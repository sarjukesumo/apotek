// Midtrans Snap: create transaction token (server-side).
import fetch from "node-fetch";
import { db, FieldValue } from "../firebase";
import { getSecret, loadSystemConfig } from "../config";
import { buildMarketplaceOrderId, buildSubscriptionOrderId, SubscriptionPlan } from "../util/orderId";
import { rand6 } from "../util/crypto";

export interface SnapInput {
  type: "SUBSCRIPTION" | "MARKETPLACE";
  tenantId: string;
  orderId?: string;          // marketplace order doc id (already created)
  plan?: SubscriptionPlan;   // subscription only
  customer: { uid: string; name: string; email: string };
}

const PLAN_PRICES: Record<SubscriptionPlan, number> = {
  BASIC: 99000,
  PRO: 249000,
  YEARLY: 2490000,
};

export async function createSnapToken(input: SnapInput) {
  const cfg = await loadSystemConfig();
  const base = cfg.midtrans.isProduction
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";
  const serverKey = await getSecret(cfg.midtrans.serverKeyRef);
  const auth = "Basic " + Buffer.from(serverKey + ":").toString("base64");

  const tenantSnap = await db.doc(`tenants/${input.tenantId}`).get();
  if (!tenantSnap.exists) throw new Error("tenant not found");
  const tenant = tenantSnap.data() as any;
  const tenantShort = tenant.tenantShort || input.tenantId.slice(0, 4).toUpperCase();

  let amount = 0;
  let items: any[] = [];
  let midtransOrderId: string;

  if (input.type === "SUBSCRIPTION") {
    if (!input.plan) throw new Error("plan required");
    amount = PLAN_PRICES[input.plan];
    midtransOrderId = buildSubscriptionOrderId(tenantShort, input.plan);
    items = [{ id: input.plan, price: amount, quantity: 1, name: `Langganan ${input.plan}` }];
  } else {
    if (!input.orderId) throw new Error("orderId required");
    const oRef = db.doc(`tenants/${input.tenantId}/marketplaceOrders/${input.orderId}`);
    const oSnap = await oRef.get();
    if (!oSnap.exists) throw new Error("order not found");
    const order = oSnap.data() as any;
    if (order.customer.uid !== input.customer.uid) throw new Error("forbidden");
    amount = order.amounts.total;
    items = order.items.map((it: any) => ({
      id: it.productId, price: it.price, quantity: it.qty, name: it.name,
    }));
    midtransOrderId = buildMarketplaceOrderId(tenantShort, (order.orderNo as string).slice(-4));
  }

  const paymentRef = db.collection("payments").doc();
  await paymentRef.set({
    type: input.type,
    provider: "MIDTRANS",
    tenantId: input.tenantId,
    orderId: input.orderId ?? null,
    midtransOrderId,
    idempotencyKey: `${input.type}:${midtransOrderId}`,
    amount,
    status: "CREATED",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    plan: input.plan ?? null,
  });

  const body = {
    transaction_details: { order_id: midtransOrderId, gross_amount: amount },
    customer_details: {
      first_name: input.customer.name,
      email: input.customer.email,
    },
    item_details: items,
    credit_card: { secure: true },
  };

  const res = await fetch(`${base}/snap/v1/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": auth,
      "X-Idempotency-Key": `${midtransOrderId}-${rand6()}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Midtrans Snap error ${res.status}: ${txt}`);
  }
  const data: any = await res.json();
  await paymentRef.update({
    snapToken: data.token,
    redirectUrl: data.redirect_url,
    status: "PENDING",
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (input.type === "MARKETPLACE" && input.orderId) {
    await db.doc(`tenants/${input.tenantId}/marketplaceOrders/${input.orderId}`).update({
      status: "PAYMENT_PENDING",
      "payment.paymentId": paymentRef.id,
      "payment.midtransOrderId": midtransOrderId,
      "payment.provider": "MIDTRANS",
      "payment.status": "PENDING",
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  return { snapToken: data.token, redirectUrl: data.redirect_url, paymentId: paymentRef.id };
}
