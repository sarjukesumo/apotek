// Order ID naming standard for Midtrans.
// Charset: [A-Za-z0-9-_~.], max length 50.
import { rand6 } from "./crypto";

const ALLOWED = /^[A-Za-z0-9\-_~.]+$/;

function assertOrderId(id: string) {
  if (id.length > 50) throw new Error(`order_id too long (${id.length}): ${id}`);
  if (!ALLOWED.test(id)) throw new Error(`order_id has invalid chars: ${id}`);
}

export type SubscriptionPlan = "BASIC" | "PRO" | "YEARLY";

export function buildSubscriptionOrderId(
  tenantShort: string,
  plan: SubscriptionPlan,
  when: Date = new Date()
): string {
  const ym = `${when.getUTCFullYear()}${String(when.getUTCMonth() + 1).padStart(2, "0")}`;
  const id = `SUB-${tenantShort}-${ym}-${plan}-${rand6()}`;
  assertOrderId(id);
  return id;
}

export function buildMarketplaceOrderId(
  tenantShort: string,
  seq4: string,
  when: Date = new Date()
): string {
  const ts = when.toISOString().replace(/[-:T]/g, "").slice(0, 12); // YYYYMMDDHHmm
  const id = `ORD-${tenantShort}-${ts}-${seq4}`;
  assertOrderId(id);
  return id;
}

export function buildOrderNo(seq4: string, when: Date = new Date()): string {
  const ts = when.toISOString().replace(/[-:T]/g, "").slice(0, 12);
  return `${ts}-${seq4}`;
}
