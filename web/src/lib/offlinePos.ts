import type { DemoProduct } from "./demoStore";
import { availableQty, pickFefo } from "./fefo";

export type OfflineSaleItem = { productId: string; qty: number };
export type OfflineSaleConsumption = { productId: string; batchId: string; qty: number };

export interface QueuedPosSale {
  key: string;
  tenantId: string;
  cashierUid: string;
  cashierName: string;
  requestId: string;
  items: OfflineSaleItem[];
  expectedPrices: { productId: string; unitPrice: number }[];
  discountPct: number;
  paymentMethod: string;
  cashReceived: number;
  isOwner: boolean;
  createdAtISO: string;
  consumptions: OfflineSaleConsumption[];
  status: "pending" | "needs-attention";
  lastError?: string;
}

type OfflineSaleInput = Omit<
  QueuedPosSale,
  "key" | "createdAtISO" | "consumptions" | "expectedPrices" | "status" | "lastError"
>;

const DATABASE_NAME = "batam-farma-offline";
const STORE_NAME = "queued-pos-sales";
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const queueChannel = typeof window === "undefined" || typeof BroadcastChannel === "undefined"
  ? null
  : new BroadcastChannel("batam-farma-offline-pos");

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("offline_database_open_failed"));
    request.onblocked = () => reject(new Error("offline_database_upgrade_blocked"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("offline_database_transaction_failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("offline_database_transaction_aborted"));
  });
}

async function readAllSales(): Promise<QueuedPosSale[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const done = transactionDone(transaction);
    const request = transaction.objectStore(STORE_NAME).getAll() as IDBRequest<QueuedPosSale[]>;
    const sales = await new Promise<QueuedPosSale[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("offline_database_read_failed"));
    });
    await done;
    return sales;
  } finally {
    database.close();
  }
}

async function writeSale(sale: QueuedPosSale): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).put(sale);
    await done;
  } finally {
    database.close();
  }
  queueChannel?.postMessage({ tenantId: sale.tenantId });
}

async function deleteSale(key: string, tenantId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).delete(key);
    await done;
  } finally {
    database.close();
  }
  queueChannel?.postMessage({ tenantId });
}

export async function getQueuedPosSales(tenantId: string): Promise<QueuedPosSale[]> {
  return (await readAllSales())
    .filter((sale) => sale.tenantId === tenantId)
    .sort((a, b) => a.createdAtISO.localeCompare(b.createdAtISO));
}

export async function queueOfflinePosSale(
  input: OfflineSaleInput,
  products: DemoProduct[],
  alreadyAppliedSales: QueuedPosSale[],
  cashierMaxDiscountPct: number,
) {
  if (!navigator.locks) throw new Error("offline_concurrency_unavailable");
  return navigator.locks.request("batam-farma-offline-pos-queue", async () => {
    const storedSales = await getQueuedPosSales(input.tenantId);
    const appliedKeys = new Set(alreadyAppliedSales.map((sale) => sale.key));
    const unreflectedSales = storedSales.filter((sale) => !appliedKeys.has(sale.key));
    const currentProducts = applyQueuedSalesToInventory(products, unreflectedSales);
    return queueOfflinePosSaleUnlocked(input, currentProducts, cashierMaxDiscountPct);
  });
}

async function queueOfflinePosSaleUnlocked(
  input: OfflineSaleInput,
  products: DemoProduct[],
  cashierMaxDiscountPct: number,
) {
  if (!input.items.length || input.items.length > 4) throw new Error("sale_has_too_many_batches");
  if (!REQUEST_ID_PATTERN.test(input.requestId)) throw new Error("invalid_request_id");
  if (new Set(input.items.map((item) => item.productId)).size !== input.items.length) throw new Error("duplicate_product");
  if (!Number.isInteger(input.discountPct) || input.discountPct < 0 || input.discountPct > 100) throw new Error("invalid_discount");
  if (!input.isOwner && input.discountPct > cashierMaxDiscountPct) throw new Error("discount_limit_exceeded");

  const consumptions: OfflineSaleConsumption[] = [];
  const expectedPrices: { productId: string; unitPrice: number }[] = [];
  const saleItems = input.items.map((item) => {
    if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 500) throw new Error("invalid_quantity");
    const product = products.find((candidate) => candidate.id === item.productId && candidate.tenantId === input.tenantId);
    if (!product) throw new Error("product_not_found");
    if (product.active === false || product.sampleOnly === true) throw new Error("product_inactive");
    if (product.rxRequired) throw new Error("rx_verification_required");
    if (!Number.isSafeInteger(product.price) || product.price < 0) throw new Error("invalid_product_price");
    expectedPrices.push({ productId: item.productId, unitPrice: product.price });
    if (availableQty(product.batches) < item.qty) throw new Error("insufficient_stock");

    const picked = pickFefo(product.batches, item.qty);
    if (!picked) throw new Error("insufficient_stock");
    if (picked.consumed.length !== 1) throw new Error("quantity_crosses_batch_boundary");
    consumptions.push({
      productId: item.productId,
      batchId: picked.consumed[0].batchId,
      qty: item.qty,
    });
    const subtotalRp = item.qty * product.price;
    const discountRp = Math.round(subtotalRp * input.discountPct / 100);
    return {
      productId: item.productId,
      name: product.name,
      qty: item.qty,
      unitPrice: product.price,
      subtotalRp,
      discountRp,
      totalRp: subtotalRp - discountRp,
    };
  });

  const subtotalRp = saleItems.reduce((sum, item) => sum + item.subtotalRp, 0);
  const discountRp = saleItems.reduce((sum, item) => sum + item.discountRp, 0);
  const totalRp = saleItems.reduce((sum, item) => sum + item.totalRp, 0);
  if (![subtotalRp, discountRp, totalRp].every(Number.isSafeInteger)) throw new Error("invalid_sale_total");
  if (input.paymentMethod === "TUNAI" && input.cashReceived < totalRp) throw new Error("insufficient_cash");

  const createdAt = new Date();
  const queuedSale: QueuedPosSale = {
    ...input,
    expectedPrices,
    key: `${input.tenantId}:${input.requestId}`,
    createdAtISO: createdAt.toISOString(),
    consumptions,
    status: "pending",
  };
  await writeSale(queuedSale);
  return {
    trxId: `TRX-${input.requestId.toUpperCase()}`,
    createdAt,
    items: saleItems,
    subtotalRp,
    discountRp,
    totalRp,
    discountPct: input.discountPct,
    consumptions,
    queuedSale,
  };
}

export function applyQueuedSalesToInventory(products: DemoProduct[], queuedSales: QueuedPosSale[]) {
  const remainingByBatch = new Map<string, number>();
  for (const sale of queuedSales) {
    for (const consumption of sale.consumptions) {
      remainingByBatch.set(
        `${consumption.productId}:${consumption.batchId}`,
        (remainingByBatch.get(`${consumption.productId}:${consumption.batchId}`) ?? 0) + consumption.qty,
      );
    }
  }
  return products.map((product) => ({
    ...product,
    batches: product.batches.map((batch) => ({
      ...batch,
      qty: Math.max(0, batch.qty - (remainingByBatch.get(`${product.id}:${batch.id}`) ?? 0)),
    })),
  }));
}

export async function acknowledgeQueuedPosSale(key: string, tenantId: string) {
  await deleteSale(key, tenantId);
}

export async function markQueuedPosSale(
  sale: QueuedPosSale,
  status: QueuedPosSale["status"],
  lastError?: string,
) {
  await writeSale({ ...sale, status, lastError });
}
