// IRIS payout (near real-time, idempotent).
import fetch from "node-fetch";
import { logger } from "firebase-functions";
import { db, FieldValue } from "../firebase";
import { getSecret, loadSystemConfig } from "../config";
import { backoff, enqueue } from "../util/tasks";

// Minimal mapping. Extend as needed.
const BANK_CODE: Record<string, string> = {
  BCA: "bca", MANDIRI: "mandiri", BNI: "bni", BRI: "bri", PERMATA: "permata", CIMB: "cimb",
};

function bankCode(name: string): string {
  return BANK_CODE[(name || "").toUpperCase()] ?? (name || "").toLowerCase();
}

interface PayoutInput { tenantId: string; orderId: string; paymentId: string; }

export async function executeIrisPayoutTask(input: PayoutInput): Promise<void> {
  const { tenantId, orderId } = input;
  const cfg = await loadSystemConfig();
  const base = cfg.iris.isProduction
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";

  const payoutKey = `payout_${tenantId}_${orderId}`;
  const ref = db.doc(`tenants/${tenantId}/payouts/${payoutKey}`);

  // Acquire lock + bump attempts
  const lockResult = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("payout doc missing");
    const cur = snap.data()!;
    if (cur.status === "SUCCESS") return { skip: true };
    if ((cur.attempts ?? 0) >= 5) {
      tx.update(ref, { status: "FAILED", updatedAt: FieldValue.serverTimestamp() });
      return { skip: true };
    }
    tx.update(ref, {
      status: "PROCESSING",
      attempts: (cur.attempts ?? 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { skip: false, attempts: (cur.attempts ?? 0) + 1, current: cur };
  });

  if (lockResult.skip) return;

  const cur = lockResult.current!;
  const attempts = lockResult.attempts!;

  try {
    const creator = await getSecret(cfg.iris.creatorKeyRef);
    const creatorAuth = "Basic " + Buffer.from(creator + ":").toString("base64");

    let referenceNo: string | null = cur.irisReferenceNo ?? null;

    if (!referenceNo) {
      const createBody = {
        payouts: [{
          beneficiary_name: cur.destinationBank.accountHolderName,
          beneficiary_account: cur.destinationBank.accountNumber,
          beneficiary_bank: bankCode(cur.destinationBank.bankName),
          amount: String(cur.amountToTenant),
          notes: `PHARMAOS ${orderId}`.slice(0, 100),
        }],
      };
      const createRes = await fetch(`${base}/iris/api/v1/payouts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": creatorAuth,
          "X-Idempotency-Key": payoutKey,
        },
        body: JSON.stringify(createBody),
      });
      if (!createRes.ok) {
        const t = await createRes.text();
        throw new Error(`IRIS create ${createRes.status}: ${t}`);
      }
      const createData: any = await createRes.json();
      referenceNo = createData.payouts?.[0]?.reference_no ?? null;
      if (!referenceNo) throw new Error("IRIS create: no reference_no");
      await ref.update({ irisReferenceNo: referenceNo, updatedAt: FieldValue.serverTimestamp() });
    }

    if (cfg.iris.autoApprove) {
      const approver = await getSecret(cfg.iris.approverKeyRef);
      const approverAuth = "Basic " + Buffer.from(approver + ":").toString("base64");
      const approveRes = await fetch(`${base}/iris/api/v1/payouts/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": approverAuth },
        body: JSON.stringify({ reference_nos: [referenceNo] }),
      });
      if (!approveRes.ok) {
        const t = await approveRes.text();
        // 4xx like already approved or pending OTP -> log and continue
        logger.warn(`IRIS approve ${approveRes.status}: ${t}`);
      }
    }

    await ref.update({
      status: "SUCCESS",
      lastError: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err: any) {
    logger.error("payout error", err);
    await ref.update({
      status: "RETRYING",
      lastError: String(err?.message ?? err),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (attempts < 5) {
      await enqueue("executeIrisPayoutTask", input, { delaySeconds: backoff(attempts) });
    } else {
      await ref.update({ status: "FAILED" });
    }
  }
}
