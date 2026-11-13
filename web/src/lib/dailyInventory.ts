import { businessDate } from "./salesReporting";
import type { InventoryMovement } from "./inventoryRepository";

export type DailyInventorySummary = {
  opening: number;
  sales: number;
  adjustment: number;
  incoming: number;
  outgoing: number;
};

export function jakartaDayBounds(date = new Date()) {
  const start = new Date(`${businessDate(date)}T00:00:00+07:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export function summarizeDailyInventory(movements: InventoryMovement[]) {
  const summaries = new Map<string, DailyInventorySummary & { firstSeconds: number; firstNanoseconds: number }>();
  for (const movement of movements) {
    const { seconds, nanoseconds } = movement.createdAt;
    let summary = summaries.get(movement.productId);
    if (!summary) {
      summary = {
        opening: movement.productStockBefore, sales: 0, adjustment: 0, incoming: 0, outgoing: 0,
        firstSeconds: seconds, firstNanoseconds: nanoseconds,
      };
      summaries.set(movement.productId, summary);
    } else if (seconds < summary.firstSeconds || (seconds === summary.firstSeconds && nanoseconds < summary.firstNanoseconds)) {
      summary.opening = movement.productStockBefore;
      summary.firstSeconds = seconds;
      summary.firstNanoseconds = nanoseconds;
    } else if (seconds === summary.firstSeconds && nanoseconds === summary.firstNanoseconds) {
      summary.opening = Math.max(summary.opening, movement.productStockBefore);
    }
    if (movement.quantityDelta > 0) summary.incoming += movement.quantityDelta;
    else summary.outgoing -= movement.quantityDelta;
    if (movement.movementType === "SALE") summary.sales -= movement.quantityDelta;
    if (movement.movementType === "ADJUSTMENT") summary.adjustment += movement.quantityDelta;
  }
  return summaries;
}
