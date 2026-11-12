// Process queued Midtrans webhook event idempotently.
import { logger } from "firebase-functions";
import { db, FieldValue } from "../firebase";
import { getCoreStatus, mapStatus } from "./statusApi";
import { enqueue } from "../util/tasks";
import { signQR } from "../qr/sign";

interface PaymentDoc {
  type: "SUBSCRIPTION" | "MARKETPLACE";
  tenantId: string;
  orderId: string | null;
  midtransOrderId: string;
  amount: number;
  status: string;
  plan?: "BASIC" | "PRO" | "YEARLY" | null;
}

const PLAN_DAYS: Record<string, number> = { BASIC: 30, PRO: 30, YEARLY: 365 };

export async function processMidtransWebhookTask(payload: { dedupeKey: string }): Promise<void> {
  const { dedupeKey } = payload;
  const evRef = db.doc(`webhookEvents/${dedupeKey}`);
  const evSnap = await evRef.get();
  if (!evSnap.exists) return;
  const ev = evSnap.data()!;
  if (ev.processStatus === "PROCESSED") return;
  if (!ev.signatureValid) return;

  // Source-of-truth via Core API
  let status;
  try {
    status = await getCoreStatus(ev.payloadMin.order_id);
  } catch (e) {
    logger.warn("getCoreStatus failed, falling back to payload", e);
    status = ev.payloadMin;
  }
  const newStatus = mapStatus(status);

  // Map order_id -> payment doc
  const pq = await db.collection("payments")
    .where("midtransOrderId", "==", ev.payloadMin.order_id)
    .limit(1).get();
  if (pq.empty) {
    logger.error("payment not found for", ev.payloadMin.order_id);
    await evRef.update({ processStatus: "FAILED", error: "payment_not_found" });
    return;
  }
  const pSnap = pq.docs[0];
  const paymentId = pSnap.id;
  const payment = pSnap.data() as PaymentDoc;

  const cfg = (await db.doc("systemConfig/global").get()).data() as any;
  const platformFee = cfg?.midtrans?.platformFee ?? { type: "PERCENT", value: 2.5 };

  await db.runTransaction(async (tx) => {
    const pRef = db.doc(`payments/${paymentId}`);
    tx.update(pRef, { status: newStatus, updatedAt: FieldValue.serverTimestamp() });

    if (payment.type === "MARKETPLACE" && newStatus === "SUCCESS" && payment.orderId) {
      const oRef = db.doc(`tenants/${payment.tenantId}/marketplaceOrders/${payment.orderId}`);
      const oSnap = await tx.get(oRef);
      if (oSnap.exists) {
        const o = oSnap.data() as any;
        const update: any = { "payment.status": "SUCCESS", updatedAt: FieldValue.serverTimestamp() };
        if (!["PAID", "PREPARING", "READY_FOR_PICKUP", "COMPLETED"].includes(o.status)) {
          update.status = "PAID";
        }
        if (!o.qr?.signedToken) {
          update.qr = {
            v: 1,
            signedToken: await signQR({
              v: 1,
              tenantId: payment.tenantId,
              orderId: payment.orderId,
              amount: payment.amount,
              ts: Date.now(),
            }),
          };
        }
        tx.update(oRef, update);

        // Create payout doc if not exists
        const payoutKey = `payout_${payment.tenantId}_${payment.orderId}`;
        const pyRef = db.doc(`tenants/${payment.tenantId}/payouts/${payoutKey}`);
        const pyExisting = await tx.get(pyRef);
        if (!pyExisting.exists) {
          const fee =
            platformFee.type === "PERCENT"
              ? Math.round(payment.amount * (platformFee.value / 100))
              : platformFee.value;
          const tenantSnap = await tx.get(db.doc(`tenants/${payment.tenantId}`));
          const tenant = tenantSnap.data() as any;
          tx.set(pyRef, {
            orderId: payment.orderId,
            paymentId,
            provider: "MIDTRANS_IRIS",
            amountToTenant: payment.amount - fee,
            platformFee: fee,
            destinationBank: tenant?.payout?.bank ?? null,
            status: "CREATED",
            attempts: 0,
            irisReferenceNo: null,
            lastError: null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
    }

    if (payment.type === "SUBSCRIPTION" && newStatus === "SUCCESS" && payment.plan) {
      const tRef = db.doc(`tenants/${payment.tenantId}`);
      const tSnap = await tx.get(tRef);
      const t = tSnap.data() as any;
      const now = Date.now();
      const baseEnd = t?.subscription?.endAt?.toMillis?.() ?? 0;
      const start = Math.max(now, baseEnd);
      const days = PLAN_DAYS[payment.plan] ?? 30;
      const endAt = new Date(start + days * 86400_000);
      const graceEndAt = new Date(endAt.getTime() + 7 * 86400_000);
      tx.update(tRef, {
        "subscription.status": "ACTIVE",
        "subscription.plan": payment.plan,
        "subscription.startAt": new Date(start),
        "subscription.endAt": endAt,
        "subscription.graceEndAt": graceEndAt,
        "subscription.lastPaymentId": paymentId,
      });
    }

    tx.update(evRef, {
      processStatus: "PROCESSED",
      processedAt: FieldValue.serverTimestamp(),
      refs: {
        paymentId,
        tenantId: payment.tenantId,
        orderId: payment.orderId ?? null,
        midtransOrderId: ev.payloadMin.order_id,
      },
    });
  });

  if (payment.type === "MARKETPLACE" && newStatus === "SUCCESS" && payment.orderId) {
    await Promise.all([
      enqueue("deductFefoTask", { tenantId: payment.tenantId, orderId: payment.orderId }),
      enqueue("executeIrisPayoutTask", {
        tenantId: payment.tenantId,
        orderId: payment.orderId,
        paymentId,
      }),
      enqueue("sendTelegramTask", {
        tenantId: payment.tenantId,
        templateKey: "orderPaid",
        payload: { orderId: payment.orderId },
      }),
    ]);
  }

  if (payment.type === "SUBSCRIPTION" && newStatus === "SUCCESS") {
    await enqueue("sendTelegramTask", {
      tenantId: payment.tenantId,
      templateKey: "subscriptionActive",
      payload: { plan: payment.plan },
    });
  }
}
