import { describe, expect, it } from "vitest";
import type { DemoProduct } from "../src/lib/demoStore";
import { applyQueuedSalesToInventory, type QueuedPosSale } from "../src/lib/offlinePos";

const products: DemoProduct[] = [
  {
    id: "medicine-a",
    tenantId: "pharmacy-a",
    name: "Medicine A",
    category: "Obat",
    price: 1000,
    emoji: "",
    gradient: "",
    desc: "",
    unit: "tablet",
    rxRequired: false,
    marketplaceEnabled: false,
    minStock: 1,
    batches: [
      { id: "batch-a", batchNo: "A", qty: 5, expiryISO: "2099-12-31" },
      { id: "batch-b", batchNo: "B", qty: 3, expiryISO: "2099-12-31" },
    ],
  },
  {
    id: "medicine-b",
    tenantId: "pharmacy-a",
    name: "Medicine B",
    category: "Obat",
    price: 2000,
    emoji: "",
    gradient: "",
    desc: "",
    unit: "tablet",
    rxRequired: false,
    marketplaceEnabled: false,
    minStock: 1,
    batches: [{ id: "batch-c", batchNo: "C", qty: 7, expiryISO: "2099-12-31" }],
  },
];

function queuedSale(requestId: string, qty: number): QueuedPosSale {
  return {
    key: `pharmacy-a:${requestId}`,
    tenantId: "pharmacy-a",
    cashierUid: "cashier-a",
    cashierName: "Kasir",
    requestId,
    items: [{ productId: "medicine-a", qty }],
    expectedPrices: [{ productId: "medicine-a", unitPrice: 1000 }],
    discountPct: 0,
    paymentMethod: "TUNAI",
    cashReceived: 10000,
    isOwner: false,
    createdAtISO: "2026-10-28T02:00:00.000Z",
    consumptions: [{ productId: "medicine-a", batchId: "batch-a", qty }],
    status: "pending",
  };
}

describe("applyQueuedSalesToInventory", () => {
  it("subtracts all pending sale quantities from the right cached batch without mutating the cache", () => {
    const updated = applyQueuedSalesToInventory(products, [
      queuedSale("sale-one", 2),
      queuedSale("sale-two", 1),
    ]);

    expect(updated[0].batches.map((batch) => batch.qty)).toEqual([2, 3]);
    expect(updated[1].batches[0].qty).toBe(7);
    expect(products[0].batches[0].qty).toBe(5);
  });

  it("does not display negative stock when pending sales exceed a stale cached quantity", () => {
    const updated = applyQueuedSalesToInventory(products, [queuedSale("sale-one", 10)]);

    expect(updated[0].batches[0].qty).toBe(0);
    expect(products[0].batches[0].qty).toBe(5);
  });
});
