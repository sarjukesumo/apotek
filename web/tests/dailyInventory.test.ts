import { describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { InventoryMovement, InventoryMovementType } from "../src/lib/inventoryRepository";
import { jakartaDayBounds, summarizeDailyInventory } from "../src/lib/dailyInventory";

vi.mock("../src/lib/firebase", () => ({ db: null }));

function movement(
  productId: string, movementType: InventoryMovementType, quantityDelta: number,
  productStockBefore: number, seconds: number,
): InventoryMovement {
  return {
    id: `${productId}-${seconds}-${quantityDelta}`, tenantId: "tenant", productId, productName: productId,
    batchId: "batch", batchNo: "batch", movementType, quantityDelta,
    batchQtyBefore: productStockBefore, batchQtyAfter: productStockBefore + quantityDelta,
    productStockBefore, productStockAfter: productStockBefore + quantityDelta,
    actorUid: "user", actorName: "User", createdAt: new Timestamp(seconds, 0),
  };
}

describe("daily inventory", () => {
  it("uses Jakarta midnight regardless of the device time zone", () => {
    const { start, end } = jakartaDayBounds(new Date("2026-11-13T17:30:00Z"));
    expect(start.toISOString()).toBe("2026-11-13T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-14T17:00:00.000Z");
  });

  it("counts incoming, sales and all outgoing separately for each product", () => {
    const summaries = summarizeDailyInventory([
      movement("a", "SUPPLIER_RETURN", -2, 13, 30),
      movement("a", "SALE", -3, 16, 20),
      movement("b", "IMPORT", 4, 0, 15),
      movement("a", "PURCHASE", 6, 10, 10),
      movement("a", "ADJUSTMENT", -1, 11, 40),
    ]);
    expect(summaries.get("a")).toMatchObject({ opening: 10, sales: 3, adjustment: -1, incoming: 6, outgoing: 6 });
    expect(summaries.get("b")).toMatchObject({ opening: 0, sales: 0, adjustment: 0, incoming: 4, outgoing: 0 });
  });

  it("finds opening stock when a sale consumes multiple batches at the same timestamp", () => {
    const summary = summarizeDailyInventory([
      movement("a", "SALE", -2, 8, 10),
      movement("a", "SALE", -2, 10, 10),
    ]).get("a");
    expect(summary).toMatchObject({ opening: 10, sales: 4, incoming: 0, outgoing: 4 });
  });
});
