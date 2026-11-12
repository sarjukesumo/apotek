import type { DemoProduct } from "./demoStore";
import { pickFefo } from "./fefo";

type TrainingLine = {
  productId: string; name: string; qty: number; unitPrice: number;
  subtotalRp: number; discountRp: number; totalRp: number;
};
export type TrainingSale = {
  requestId: string; fingerprint: string; trxId: string; createdAtISO: string;
  items: TrainingLine[]; subtotalRp: number; discountRp: number; totalRp: number; discountPct: number;
  consumptions: { productId: string; batchId: string; qty: number }[];
};
const key = (tenantId: string) => `dfarma-training-pos-v1:${tenantId}`;

export function readTrainingSales(tenantId: string): TrainingSale[] {
  const raw = localStorage.getItem(key(tenantId));
  if (raw === null) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("Data latihan lokal rusak. Reset latihan sebelum melanjutkan."); }
  if (!Array.isArray(value) || !value.every((sale) =>
    sale && typeof sale.requestId === "string" && typeof sale.fingerprint === "string"
    && typeof sale.trxId === "string" && typeof sale.createdAtISO === "string"
    && !Number.isNaN(Date.parse(sale.createdAtISO))
    && Array.isArray(sale.items) && sale.items.every((item: TrainingLine) => item && typeof item.productId === "string"
      && typeof item.name === "string" && [item.qty, item.unitPrice, item.subtotalRp, item.discountRp, item.totalRp].every(Number.isSafeInteger))
    && [sale.subtotalRp, sale.discountRp, sale.totalRp, sale.discountPct].every(Number.isSafeInteger)
    && Array.isArray(sale.consumptions) && sale.consumptions.every((entry: TrainingSale["consumptions"][number]) =>
      entry && typeof entry.productId === "string" && typeof entry.batchId === "string"
      && Number.isSafeInteger(entry.qty) && entry.qty > 0))) {
    throw new Error("Format data latihan lokal tidak valid. Reset latihan sebelum melanjutkan.");
  }
  return value;
}

export function applyTrainingSales(products: DemoProduct[], sales: TrainingSale[]) {
  const consumed = new Map<string, number>();
  sales.forEach((sale) => sale.consumptions.forEach((line) => {
    const id = `${line.productId}:${line.batchId}`;
    consumed.set(id, (consumed.get(id) || 0) + line.qty);
  }));
  return products.filter((product) => product.sampleOnly === true).map((product) => ({
    ...product,
    batches: product.batches.map((batch) => ({
      ...batch, qty: Math.max(0, batch.qty - (consumed.get(`${product.id}:${batch.id}`) || 0)),
    })),
  }));
}

export async function resetTrainingSales(tenantId: string) {
  if (!navigator.locks) throw new Error("offline_concurrency_unavailable");
  await navigator.locks.request(key(tenantId), async () => { localStorage.removeItem(key(tenantId)); });
}

export async function completeTrainingSale(input: {
  tenantId: string; requestId: string; items: { productId: string; qty: number }[];
  discountPct: number; paymentMethod: string; cashReceived: number; products: DemoProduct[];
  maxDiscountPct: number;
}) {
  if (!navigator.locks) throw new Error("offline_concurrency_unavailable");
  return navigator.locks.request(key(input.tenantId), async () => {
    if (!input.items.length || input.items.length > 4) throw new Error("sale_has_too_many_batches");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw new Error("invalid_request_id");
    if (new Set(input.items.map((item) => item.productId)).size !== input.items.length) throw new Error("duplicate_product");
    if (!Number.isInteger(input.discountPct) || input.discountPct < 0 || input.discountPct > input.maxDiscountPct) throw new Error("discount_limit_exceeded");
    if (!["TUNAI", "DEBIT", "TRANSFER"].includes(input.paymentMethod)
      || !Number.isSafeInteger(input.cashReceived) || input.cashReceived < 0) throw new Error("invalid_payment");
    const fingerprint = JSON.stringify({
      items: [...input.items].sort((a, b) => a.productId.localeCompare(b.productId)),
      discountPct: input.discountPct, paymentMethod: input.paymentMethod, cashReceived: input.cashReceived,
    });
    const sales = readTrainingSales(input.tenantId);
    const previous = sales.find((sale) => sale.requestId === input.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error("checkout_request_conflict");
      return { ...previous, createdAt: new Date(previous.createdAtISO) };
    }
    const inventory = applyTrainingSales(input.products, sales);
    const consumptions: TrainingSale["consumptions"] = [];
    const items = input.items.map((line) => {
      const product = inventory.find((product) => product.id === line.productId && product.tenantId === input.tenantId);
      if (!product || !product.sampleOnly) throw new Error("training_sample_only");
      if (!Number.isSafeInteger(line.qty) || line.qty < 1 || line.qty > 500) throw new Error("invalid_quantity");
      if (!Number.isSafeInteger(product.price) || product.price < 0) throw new Error("invalid_product_price");
      const picked = pickFefo(product.batches, line.qty);
      if (!picked) throw new Error("insufficient_stock");
      if (picked.consumed.length !== 1) throw new Error("quantity_crosses_batch_boundary");
      consumptions.push({ productId: product.id, batchId: picked.consumed[0].batchId, qty: line.qty });
      const subtotalRp = product.price * line.qty;
      const discountRp = Math.round(subtotalRp * input.discountPct / 100);
      return { productId: product.id, name: product.name, qty: line.qty, unitPrice: product.price, subtotalRp, discountRp, totalRp: subtotalRp - discountRp };
    });
    const subtotalRp = items.reduce((sum, item) => sum + item.subtotalRp, 0);
    const discountRp = items.reduce((sum, item) => sum + item.discountRp, 0);
    const totalRp = subtotalRp - discountRp;
    if (![subtotalRp, discountRp, totalRp].every(Number.isSafeInteger)) throw new Error("invalid_sale_total");
    if (input.paymentMethod === "TUNAI" && input.cashReceived < totalRp) throw new Error("insufficient_cash");
    const createdAt = new Date();
    const sale: TrainingSale = {
      requestId: input.requestId, fingerprint, trxId: `LATIHAN-${input.requestId.toUpperCase()}`,
      createdAtISO: createdAt.toISOString(), items, consumptions, subtotalRp, discountRp, totalRp, discountPct: input.discountPct,
    };
    localStorage.setItem(key(input.tenantId), JSON.stringify([...sales, sale]));
    return { ...sale, createdAt };
  });
}
