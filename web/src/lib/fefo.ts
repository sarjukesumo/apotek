// FEFO (First Expired First Out) helpers — central source of truth.
// Used by POS picking, Inventory zona badges, Dashboard risk widget,
// and Pemusnahan (BAP) flow.

import type { DemoBatch, DemoProduct } from "./demoStore";

export type FefoZone = "SAFE" | "WATCH" | "WARNING" | "CRITICAL" | "EXPIRED";

export interface ZoneMeta {
  zone: FefoZone;
  label: string;     // user-facing
  short: string;     // short emoji+label for badges
  cls: string;       // tailwind classes for badge bg+text
  ringCls: string;   // for borders / rings
  priority: number;  // higher = more urgent
}

const ZONES: Record<FefoZone, Omit<ZoneMeta, "zone">> = {
  SAFE:     { label: "Aman",     short: "🟢 Aman",     cls: "bg-accent-50 text-accent-700",   ringCls: "ring-accent-200",  priority: 0 },
  WATCH:    { label: "Watch",    short: "🟡 Watch",    cls: "bg-yellow-50 text-yellow-700",   ringCls: "ring-yellow-200",  priority: 1 },
  WARNING:  { label: "Warning",  short: "🟠 Warning",  cls: "bg-orange-50 text-orange-700",   ringCls: "ring-orange-200",  priority: 2 },
  CRITICAL: { label: "Critical", short: "🔴 Critical", cls: "bg-danger-50 text-danger-700",   ringCls: "ring-danger-300",  priority: 3 },
  EXPIRED:  { label: "Expired",  short: "⚫ Expired",  cls: "bg-ink-900 text-white",          ringCls: "ring-ink-900",     priority: 4 },
};

// Threshold defaults (days). Override via zoneOverrides if rules per kategori dibutuhkan nanti.
export const FEFO_THRESHOLDS = {
  watchDays: 180,
  warningDays: 90,
  criticalDays: 30,
};
const jakartaDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
});

export function daysToExpiry(iso: string, now: Date = new Date()): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return Number.NEGATIVE_INFINITY;
  const parts = jakartaDateFormatter.formatToParts(now);
  const today = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const expiryDay = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const todayDay = Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day));
  return Math.floor((expiryDay - todayDay) / 86400_000);
}

export function batchZone(iso: string, now: Date = new Date()): FefoZone {
  const d = daysToExpiry(iso, now);
  if (d < 0) return "EXPIRED";
  if (d <= FEFO_THRESHOLDS.criticalDays) return "CRITICAL";
  if (d <= FEFO_THRESHOLDS.warningDays) return "WARNING";
  if (d <= FEFO_THRESHOLDS.watchDays) return "WATCH";
  return "SAFE";
}

export function zoneMeta(zone: FefoZone): ZoneMeta {
  return { zone, ...ZONES[zone] };
}

export function batchZoneMeta(iso: string, now: Date = new Date()): ZoneMeta {
  return zoneMeta(batchZone(iso, now));
}

/** Sort batches by expiry ascending (earliest ED first). Returns new array. */
export function sortFefo<T extends { expiryISO: string }>(batches: T[]): T[] {
  return [...batches].sort((a, b) => a.expiryISO.localeCompare(b.expiryISO));
}

/** Total qty across all batches (includes expired). */
export function totalQty(batches: DemoBatch[]): number {
  return batches.reduce((s, b) => s + (b.qty || 0), 0);
}

/** Qty available for sale = sum of non-expired batches. */
export function availableQty(batches: DemoBatch[], now: Date = new Date()): number {
  return batches.reduce((s, b) => s + (batchZone(b.expiryISO, now) === "EXPIRED" ? 0 : b.qty || 0), 0);
}

/** Qty sitting in expired batches (must be quarantined / disposed). */
export function expiredQty(batches: DemoBatch[], now: Date = new Date()): number {
  return batches.reduce((s, b) => s + (batchZone(b.expiryISO, now) === "EXPIRED" ? b.qty || 0 : 0), 0);
}

/** Sum of qty in given zones. */
export function qtyInZones(batches: DemoBatch[], zones: FefoZone[], now: Date = new Date()): number {
  const set = new Set(zones);
  return batches.reduce((s, b) => s + (set.has(batchZone(b.expiryISO, now)) ? b.qty || 0 : 0), 0);
}

/** Rupiah value of product stock in a given zone set (qty * price). */
export function valueInZones(p: DemoProduct, zones: FefoZone[], now: Date = new Date()): number {
  return qtyInZones(p.batches, zones, now) * p.price;
}

/** Highest priority zone present in product batches (for product-level badge). */
export function productWorstZone(p: DemoProduct, now: Date = new Date()): FefoZone | null {
  let worst: FefoZone | null = null;
  let prio = -1;
  for (const b of p.batches) {
    if ((b.qty || 0) <= 0) continue;
    const z = batchZone(b.expiryISO, now);
    const m = ZONES[z];
    if (m.priority > prio) {
      prio = m.priority;
      worst = z;
    }
  }
  return worst;
}

/**
 * FEFO pick: returns the new batches array after consuming `qty` units,
 * picking from earliest non-expired batch first. Returns null if not enough
 * available qty (caller decides what to do).
 */
export function pickFefo(
  batches: DemoBatch[],
  qty: number,
  now: Date = new Date(),
): { newBatches: DemoBatch[]; consumed: { batchId: string; batchNo: string; qty: number; costPrice: number }[] } | null {
  if (qty <= 0) return { newBatches: batches, consumed: [] };
  if (availableQty(batches, now) < qty) return null;

  const sorted = sortFefo(batches);
  let remaining = qty;
  const consumed: { batchId: string; batchNo: string; qty: number; costPrice: number }[] = [];
  const next: DemoBatch[] = [];

  for (const b of sorted) {
    // Skip expired (kept untouched, must be disposed via Pemusnahan flow)
    if (batchZone(b.expiryISO, now) === "EXPIRED") {
      next.push(b);
      continue;
    }
    if (remaining <= 0 || (b.qty || 0) <= 0) {
      next.push(b);
      continue;
    }
    const take = Math.min(remaining, b.qty);
    remaining -= take;
    if (b.qty - take > 0) next.push({ ...b, qty: b.qty - take });
    consumed.push({ batchId: b.id, batchNo: b.batchNo, qty: take, costPrice: b.costPrice ?? 0 });
  }
  return { newBatches: next, consumed };
}

/** Format days remaining as friendly Indonesian string. */
export function formatDaysToExpiry(iso: string, now: Date = new Date()): string {
  const d = daysToExpiry(iso, now);
  if (d < 0) return `Expired ${Math.abs(d)} hari lalu`;
  if (d === 0) return "Hari ini";
  if (d === 1) return "Besok";
  if (d < 30) return `${d} hari lagi`;
  if (d < 365) return `${Math.round(d / 30)} bulan lagi`;
  return `${Math.round(d / 30)} bulan lagi`;
}

// =====================================================================
// Supplier-return eligibility helpers
// =====================================================================

/** Reasons a batch cannot be returned to a supplier. null = eligible. */
export type ReturnIneligibleReason =
  | "EXPIRED"          // sudah lewat ED — harus BAP
  | "BELOW_MIN_ED"     // sisa hari ED < kebijakan supplier
  | "WRONG_SUPPLIER"   // batch bukan dari supplier ini
  | "NOT_RETURNABLE"   // supplier tidak menerima retur (barang putus)
  | "NO_QTY"           // tidak ada stok
  | "INACTIVE";        // supplier non-aktif

export type SupplierReturnPolicy = {
  id: string;
  active: boolean;
  returnable: boolean;
  returnMinDaysBeforeED: number;
};

export function returnIneligibleReason(
  batch: DemoBatch,
  supplier: SupplierReturnPolicy,
  now: Date = new Date(),
): ReturnIneligibleReason | null {
  if (!supplier.active) return "INACTIVE";
  if (!supplier.returnable) return "NOT_RETURNABLE";
  if ((batch.qty || 0) <= 0) return "NO_QTY";
  if (batch.supplierId && batch.supplierId !== supplier.id) return "WRONG_SUPPLIER";
  const d = daysToExpiry(batch.expiryISO, now);
  if (d < 0) return "EXPIRED";
  if (d < supplier.returnMinDaysBeforeED) return "BELOW_MIN_ED";
  return null;
}

export function isReturnEligible(
  batch: DemoBatch,
  supplier: SupplierReturnPolicy,
  now: Date = new Date(),
): boolean {
  return returnIneligibleReason(batch, supplier, now) === null;
}

/**
 * Days remaining before this batch crosses out of the return-eligibility window
 * (i.e. crosses below supplier.returnMinDaysBeforeED). Negative = sudah lewat.
 * Returns null if not applicable (supplier non-returnable / wrong supplier / no qty / inactive).
 */
export function daysUntilReturnDeadline(
  batch: DemoBatch,
  supplier: SupplierReturnPolicy,
  now: Date = new Date(),
): number | null {
  if (!supplier.active || !supplier.returnable) return null;
  if ((batch.qty || 0) <= 0) return null;
  if (batch.supplierId && batch.supplierId !== supplier.id) return null;
  const d = daysToExpiry(batch.expiryISO, now);
  return d - supplier.returnMinDaysBeforeED;
}
