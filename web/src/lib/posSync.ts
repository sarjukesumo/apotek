import { completePosSale } from "./posRepository";
import {
  acknowledgeQueuedPosSale, getQueuedPosSales, markQueuedPosSale,
} from "./offlinePos";

let activeSync: Promise<{ synced: number; attention: number }> | null = null;

export function isNetworkError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error
    ? String(error.code)
    : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return !navigator.onLine
    || code === "unavailable"
    || code === "deadline-exceeded"
    || message.includes("client is offline")
    || message.includes("network request failed");
}

export async function syncQueuedPosSales(tenantId: string, cashierUid: string) {
  if (!navigator.onLine) return { synced: 0, attention: 0 };
  if (activeSync) return activeSync;
  activeSync = (async () => {
    let synced = 0;
    let attention = 0;
    const sales = await getQueuedPosSales(tenantId);
    for (const sale of sales) {
      if (sale.cashierUid !== cashierUid) {
        attention += 1;
        break;
      }
      if (sale.status === "needs-attention") {
        attention += 1;
        break;
      }
      try {
        await completePosSale({
          tenantId: sale.tenantId,
          cashierUid: sale.cashierUid,
          cashierName: sale.cashierName,
          requestId: sale.requestId,
          products: [],
          items: sale.items,
          discountPct: sale.discountPct,
          paymentMethod: sale.paymentMethod,
          cashReceived: sale.cashReceived,
          isOwner: sale.isOwner,
          occurredAtISO: sale.createdAtISO,
          expectedPrices: sale.expectedPrices,
        });
        await acknowledgeQueuedPosSale(sale.key, sale.tenantId);
        synced += 1;
      } catch (error) {
        if (isNetworkError(error)) {
          await markQueuedPosSale(sale, "pending");
        } else {
          const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
          const message = error instanceof Error ? error.message : "sync_failed";
          await markQueuedPosSale(sale, "needs-attention", code || message);
          attention += 1;
        }
        break;
      }
    }
    return { synced, attention };
  })();
  try {
    return await activeSync;
  } finally {
    activeSync = null;
  }
}

export async function retryQueuedPosSales(tenantId: string, cashierUid: string) {
  const sales = await getQueuedPosSales(tenantId);
  for (const sale of sales) {
    if (sale.cashierUid === cashierUid && sale.status === "needs-attention") {
      await markQueuedPosSale(sale, "pending");
    }
  }
  return syncQueuedPosSales(tenantId, cashierUid);
}
