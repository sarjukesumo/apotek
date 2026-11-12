export type PosPaymentMethod = "TUNAI" | "DEBIT" | "TRANSFER";

export interface PosCheckoutItem {
  productId: string;
  qty: number;
}

export interface PosCheckoutInput {
  requestId: string;
  items: PosCheckoutItem[];
  discountPct: number;
  paymentMethod: PosPaymentMethod;
  cashReceived: number;
  customerName?: string;
}

export interface PosStockBatch {
  id: string;
  batchNo?: string;
  expiryISO: string;
  qty: number;
}

export function jakartaDateISO(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function parsePosCheckoutInput(value: unknown): PosCheckoutInput {
  if (!value || typeof value !== "object") throw new Error("invalid_checkout");
  const body = value as Record<string, unknown>;
  if (typeof body.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) {
    throw new Error("invalid_request_id");
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 25) {
    throw new Error("invalid_items");
  }

  const seen = new Set<string>();
  const items = body.items.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("invalid_item");
    const item = entry as Record<string, unknown>;
    if (typeof item.productId !== "string" || !/^[^/]{1,150}$/.test(item.productId)) throw new Error("invalid_product_id");
    if (seen.has(item.productId)) throw new Error("duplicate_product");
    seen.add(item.productId);
    if (!Number.isSafeInteger(item.qty) || (item.qty as number) < 1 || (item.qty as number) > 500) {
      throw new Error("invalid_quantity");
    }
    return { productId: item.productId, qty: item.qty as number };
  });

  const discountPct = body.discountPct ?? 0;
  if (!Number.isInteger(discountPct) || (discountPct as number) < 0 || (discountPct as number) > 100) {
    throw new Error("invalid_discount");
  }
  if (body.paymentMethod !== "TUNAI" && body.paymentMethod !== "DEBIT" && body.paymentMethod !== "TRANSFER") {
    throw new Error("invalid_payment_method");
  }
  const cashReceived = body.cashReceived ?? 0;
  if (!Number.isSafeInteger(cashReceived) || (cashReceived as number) < 0) throw new Error("invalid_cash_received");
  const customerName = body.customerName === undefined ? undefined : String(body.customerName).trim();
  if (customerName && customerName.length > 120) throw new Error("invalid_customer_name");

  return {
    requestId: body.requestId,
    items,
    discountPct: discountPct as number,
    paymentMethod: body.paymentMethod,
    cashReceived: cashReceived as number,
    ...(customerName ? { customerName } : {}),
  };
}

export function allocateFefo(batches: PosStockBatch[], qty: number, todayISO: string) {
  let remaining = qty;
  const consumed: Array<{ batchId: string; batchNo: string; qty: number }> = [];
  const ordered = [...batches].sort((left, right) => left.expiryISO.localeCompare(right.expiryISO));

  for (const batch of ordered) {
    if (remaining === 0) break;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(batch.expiryISO) || batch.expiryISO < todayISO) continue;
    if (!Number.isSafeInteger(batch.qty) || batch.qty <= 0) continue;
    const taken = Math.min(remaining, batch.qty);
    consumed.push({ batchId: batch.id, batchNo: batch.batchNo || "—", qty: taken });
    remaining -= taken;
  }

  if (remaining > 0) throw new Error("insufficient_stock");
  return consumed;
}

export function calculatePosTotals(lines: Array<{ qty: number; unitPrice: number }>, discountPct: number) {
  const subtotalRp = lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
  if (!Number.isSafeInteger(subtotalRp)) throw new Error("sale_total_out_of_range");
  const discountRp = Math.round(subtotalRp * discountPct / 100);
  return { subtotalRp, discountRp, totalRp: subtotalRp - discountRp };
}