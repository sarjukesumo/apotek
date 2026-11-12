import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { useAuth } from "../../lib/auth";
import { demoTotalQty, type DemoProduct } from "../../lib/demoStore";
import { loadTenantInventory, loadTenantSuppliers } from "../../lib/inventoryRepository";
import { db } from "../../lib/firebase";
import { Link } from "react-router-dom";
import {
  batchZone, daysToExpiry, availableQty, expiredQty, valueInZones,
  isReturnEligible, daysUntilReturnDeadline,
} from "../../lib/fefo";

type DashboardTenant = { id: string; name: string; address: string; primaryColor: string; logoEmoji: string; slug: string };
type DashboardSale = {
  id: string;
  trxId?: string;
  dateISO: string;
  totalRp: number;
  totalCostRp?: number;
  paymentMethod?: string;
  cashier?: string;
  createdAt?: { toDate?: () => Date };
};

function expiryDays(iso: string) { return daysToExpiry(iso); }

function formatRp(n: number) { return `Rp ${n.toLocaleString("id-ID")}`; }

type DetailKey = "sales" | "products" | "value" | "attention" | null;

export function TenantDashboard() {
  const claims = useAuth((s) => s.claims);
  const user = useAuth((s) => s.user);
  const isAdmin = useAuth((s) => s.isAdmin);
  const reduceMotion = useReducedMotion();
  const tenantId = claims?.tenantId ?? "";
  const isOwner = claims?.role === "OWNER" || isAdmin;
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<DashboardTenant | null>(null);
  const [products, setProducts] = useState<DemoProduct[]>([]);
  const [suppliers, setSuppliers] = useState<Awaited<ReturnType<typeof loadTenantSuppliers>>>([]);
  const [posSales, setPosSales] = useState<DashboardSale[]>([]);
  const [dashboardError, setDashboardError] = useState("");
  const [detail, setDetail] = useState<DetailKey>(null);

  useEffect(() => {
    let active = true;
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const monthStart = new Date().toISOString().slice(0, 7);
    const nextMonth = new Date(`${monthStart}-01T00:00:00.000Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const salesQuery = query(
      collection(db, `tenants/${tenantId}/posSales`),
      where("dateISO", ">=", monthStart),
      where("dateISO", "<", nextMonth.toISOString().slice(0, 7)),
      orderBy("dateISO", "desc"),
      limit(500),
    );

    Promise.all([
      loadTenantInventory(tenantId, isOwner),
      loadTenantSuppliers(tenantId),
      isOwner ? getDocs(salesQuery) : Promise.resolve(null),
    ]).then(([inventory, supplierRows, salesSnapshot]) => {
      if (!active) return;
      const tenantData = inventory.tenant ?? {};
      const profile = (tenantData.profile ?? {}) as Record<string, unknown>;
      const branding = (tenantData.branding ?? {}) as Record<string, unknown>;
      setTenant({
        id: tenantId,
        name: String(profile.name ?? tenantData.name ?? "Apotek"),
        address: String(profile.address ?? ""),
        primaryColor: String(branding.primaryColor ?? "#10b981"),
        logoEmoji: String(branding.logoEmoji ?? "💊"),
        slug: String(tenantData.tenantSlug ?? ""),
      });
      setProducts(inventory.products);
      setSuppliers(supplierRows);
      setPosSales((salesSnapshot?.docs ?? []).map((sale) => ({ id: sale.id, ...sale.data() } as DashboardSale)));
      setDashboardError("");
    }).catch((loadError: unknown) => {
      if (active) setDashboardError(loadError instanceof Error ? loadError.message : "Gagal memuat dashboard.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tenantId, isOwner]);

  const stats = useMemo(() => {
    const totalProducts = products.length;
    const totalStockUnits = products.reduce((s, p) => s + availableQty(p.batches), 0);
    const stockValue = products.reduce((s, p) => s + availableQty(p.batches) * p.price, 0);
    const lowStock = products.filter((p) => availableQty(p.batches) < p.minStock);
    const marketplaceCount = products.filter((p) => p.marketplaceEnabled).length;
    const expiringSoon = products.flatMap((p) =>
      p.batches.filter((b) => { const z = batchZone(b.expiryISO); return z === "WARNING" || z === "CRITICAL"; })
        .map((b) => ({ ...b, productName: p.name, days: expiryDays(b.expiryISO), zone: batchZone(b.expiryISO) }))
    ).sort((a, b) => a.days - b.days);
    const expiredBatches = products.flatMap((p) =>
      p.batches.filter((b) => batchZone(b.expiryISO) === "EXPIRED")
        .map((b) => ({ ...b, productName: p.name, productId: p.id, price: p.price, unit: p.unit, days: expiryDays(b.expiryISO) }))
    ).sort((a, b) => a.days - b.days);
    const riskValue = products.reduce((s, p) => s + valueInZones(p, ["WARNING", "CRITICAL"]), 0);
    const expiredValue = products.reduce((s, p) => s + valueInZones(p, ["EXPIRED"]), 0);
    const expiredUnits = products.reduce((s, p) => s + expiredQty(p.batches), 0);
    return { totalProducts, totalStockUnits, stockValue, lowStock, marketplaceCount, expiringSoon, expiredBatches, riskValue, expiredValue, expiredUnits };
  }, [products]);

  // Auto-suggest retur ke supplier:
  // group eligible WARNING/CRITICAL batches by supplier; surface top suggestions.
  const returnSuggestions = useMemo(() => {
    type Sug = {
      supplierId: string;
      supplierName: string;
      batches: { productName: string; batchNo: string; qty: number; valueRp: number; days: number; deadline: number | null }[];
      totalValueRp: number;
      totalUnits: number;
      urgentCount: number;
    };
    const map = new Map<string, Sug>();
    for (const p of products) {
      for (const b of p.batches) {
        if ((b.qty || 0) <= 0) continue;
        const z = batchZone(b.expiryISO);
        if (z !== "WARNING" && z !== "CRITICAL") continue;
        if (!b.supplierId) continue;
        const sup = suppliers.find((s) => s.id === b.supplierId);
        if (!sup) continue;
        if (!isReturnEligible(b, sup)) continue;
        const deadline = daysUntilReturnDeadline(b, sup);
        const valueRp = b.qty * p.price;
        const cur = map.get(sup.id) ?? {
          supplierId: sup.id, supplierName: sup.name,
          batches: [], totalValueRp: 0, totalUnits: 0, urgentCount: 0,
        };
        cur.batches.push({
          productName: p.name, batchNo: b.batchNo, qty: b.qty, valueRp,
          days: daysToExpiry(b.expiryISO), deadline,
        });
        cur.totalValueRp += valueRp;
        cur.totalUnits += b.qty;
        if (deadline !== null && deadline <= 7) cur.urgentCount++;
        map.set(sup.id, cur);
      }
    }
    return Array.from(map.values())
      .map((s) => ({ ...s, batches: s.batches.sort((a, b) => (a.deadline ?? 999) - (b.deadline ?? 999)) }))
      .sort((a, b) => b.urgentCount - a.urgentCount || b.totalValueRp - a.totalValueRp);
  }, [products, suppliers]);

  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const todaysSales = posSales.filter((sale) => sale.dateISO === today);
  const dailySales = todaysSales.reduce((sum, sale) => sum + sale.totalRp, 0);
  const dailyOrders = new Set(todaysSales.map((sale) => sale.trxId || sale.id)).size;
  const profitToday = useMemo(() => {
    const omzet = todaysSales.reduce((sum, sale) => sum + sale.totalRp, 0);
    const costKnown = todaysSales.every((sale) => typeof sale.totalCostRp === "number");
    const hpp = costKnown ? todaysSales.reduce((sum, sale) => sum + (sale.totalCostRp ?? 0), 0) : null;
    const gp = hpp === null ? null : omzet - hpp;
    return { omzet, hpp, gp, count: new Set(todaysSales.map((sale) => sale.trxId || sale.id)).size, pct: gp !== null && omzet > 0 ? (gp / omzet) * 100 : null };
  }, [todaysSales]);
  const profitMonth = useMemo(() => {
    const ms = posSales.filter((s) => s.dateISO.startsWith(month));
    const omzet = ms.reduce((s, x) => s + x.totalRp, 0);
    const costKnown = ms.every((sale) => typeof sale.totalCostRp === "number");
    const hpp = costKnown ? ms.reduce((sum, sale) => sum + (sale.totalCostRp ?? 0), 0) : null;
    const gp = hpp === null ? null : omzet - hpp;
    return { omzet, hpp, gp, count: new Set(ms.map((sale) => sale.trxId || sale.id)).size, pct: gp !== null && omzet > 0 ? (gp / omzet) * 100 : null };
  }, [posSales, month]);

  const ownerName = user?.displayName?.trim().split(/\s+/)[0]
    || user?.email?.split("@")[0]
    || "Owner";
  const tickerMessages = useMemo(() => [
    `${stats.totalProducts} produk terdaftar`,
    `${stats.lowStock.length} produk di bawah stok minimum`,
    `${stats.expiringSoon.length} batch mendekati kedaluwarsa`,
    `${stats.expiredBatches.length} batch kedaluwarsa perlu BAP`,
    ...(isOwner ? [`${dailyOrders} transaksi hari ini`] : []),
  ], [stats, dailyOrders, isOwner]);

  // Margin alert: produk dengan margin < 10% (atau rugi)
  const marginAlerts = useMemo(() => {
    const todayISO = new Date().toISOString().slice(0, 10);
    return products.map((p) => {
      const live = p.batches.filter((b) => b.qty > 0 && b.expiryISO >= todayISO && typeof b.costPrice === "number");
      const totalQty = live.reduce((s, b) => s + b.qty, 0);
      if (totalQty === 0 || p.price === 0) return null;
      const avgCost = Math.round(live.reduce((s, b) => s + b.qty * (b.costPrice || 0), 0) / totalQty);
      const pct = ((p.price - avgCost) / p.price) * 100;
      if (pct >= 10) return null;
      return { id: p.id, name: p.name, price: p.price, avgCost, pct, isLoss: pct < 0 };
    }).filter(Boolean).sort((a, b) => a!.pct - b!.pct).slice(0, 5) as { id: string; name: string; price: number; avgCost: number; pct: number; isLoss: boolean }[];
  }, [products]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.3 }}
        className="flex items-center gap-4 flex-wrap"
      >
        {tenant && (
          <div
            className="w-16 h-16 rounded-2xl grid place-items-center text-3xl shrink-0"
            style={{ backgroundColor: tenant.primaryColor + "20", color: tenant.primaryColor }}
          >{tenant.logoEmoji}</div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-brand-700">Selamat datang, {ownerName}</p>
          <h1 className="text-2xl font-bold">{tenant?.name ?? "Dashboard Owner"}</h1>
          <p className="text-ink-500 text-sm mt-0.5">{tenant?.address}</p>
        </div>
        <Link to="settings" className="btn-secondary text-sm">⚙️ Pengaturan</Link>
      </motion.div>

      {dashboardError && <p role="alert" className="text-sm text-danger-700">Dashboard gagal dimuat dari Firebase: {dashboardError}</p>}

      <motion.div
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.35, delay: reduceMotion ? 0 : 0.08 }}
        className="overflow-hidden rounded-lg border border-brand-100 bg-brand-50/70"
        role="status"
        aria-label="Ringkasan operasional apotek"
      >
        {loading ? <div className="px-4 py-3 text-sm text-ink-500">Memuat ringkasan operasional…</div> : (
          <div className="dashboard-ticker-track flex w-max items-center gap-8 whitespace-nowrap px-4 py-3 text-sm font-medium text-brand-800">
            {[...tickerMessages, ...tickerMessages].map((message, index) => (
              <span key={`${index}-${message}`} className="inline-flex items-center gap-8">
                <span>{message}</span><span aria-hidden="true" className="text-brand-400">•</span>
              </span>
            ))}
          </div>
        )}
      </motion.div>

      {/* KPIs */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.35, delay: reduceMotion ? 0 : 0.12 }}
        className="grid md:grid-cols-4 gap-3"
      >
        <button
          type="button"
          onClick={() => setDetail("sales")}
          className="card !p-4 bg-gradient-to-br from-brand-500 to-brand-600 text-white text-left hover:shadow-lg hover:scale-[1.02] transition-all cursor-pointer"
        >
          <div className="text-xs opacity-80">Penjualan Hari Ini</div>
          <div className="text-2xl font-bold mt-1">{loading ? "…" : isOwner ? formatRp(dailySales) : "Owner saja"}</div>
          <div className="text-xs opacity-80 mt-1">{isOwner ? `${dailyOrders} transaksi · klik detail →` : "Data penjualan dibatasi ke Owner"}</div>
        </button>
        <button
          type="button"
          onClick={() => setDetail("products")}
          className="card !p-4 text-left hover:border-brand-300 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="text-xs text-ink-500">Total Produk</div>
          <div className="text-2xl font-bold mt-1">{loading ? "…" : stats.totalProducts}</div>
          <div className="text-xs text-ink-500 mt-1">{loading ? "Memuat stok…" : `${stats.totalStockUnits} unit stok · detail →`}</div>
        </button>
        <button
          type="button"
          onClick={() => setDetail("value")}
          className="card !p-4 text-left hover:border-brand-300 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="text-xs text-ink-500">Nilai Stok</div>
          <div className="text-2xl font-bold mt-1">{loading ? "…" : formatRp(stats.stockValue)}</div>
          <div className="text-xs text-brand-600 mt-1">{stats.marketplaceCount} produk di marketplace</div>
        </button>
        <button
          type="button"
          onClick={() => setDetail("attention")}
          className="card !p-4 text-left hover:border-brand-300 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="text-xs text-ink-500">Perlu Perhatian</div>
          <div className="text-2xl font-bold mt-1">
            <span className="text-warn-500">{stats.lowStock.length}</span>
            <span className="text-ink-500 text-base"> + </span>
            <span className="text-danger-500">{stats.expiringSoon.length}</span>
          </div>
          <div className="text-xs text-ink-500 mt-1">stok menipis · ED &lt; 90 hari</div>
          {stats.riskValue > 0 && (
            <div className="text-[11px] text-orange-600 mt-1 font-semibold">
              ⚠ Berisiko: {formatRp(stats.riskValue)}
            </div>
          )}
        </button>
      </motion.div>

      {/* Laba Kotor + Margin Alert */}
      <div className="grid lg:grid-cols-3 gap-3">
        <Link to="accounting" className="card !p-4 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white hover:shadow-lg transition-all">
          <div className="flex items-center justify-between">
            <div className="text-xs opacity-90">💎 Laba Kotor Hari Ini</div>
            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded">Firebase</span>
          </div>
          <div className="text-2xl font-bold mt-2">{profitToday.gp === null ? "HPP belum lengkap" : formatRp(profitToday.gp)}</div>
          <div className="text-[11px] opacity-90 mt-1">
            Omzet {formatRp(profitToday.omzet)} · {profitToday.count} trx
          </div>
          <div className="text-[11px] opacity-90 mt-0.5">
            Margin: <b>{profitToday.pct === null ? "—" : `${profitToday.pct.toFixed(1)}%`}</b>
            {profitToday.count === 0 && <span className="opacity-70"> (belum ada penjualan)</span>}
          </div>
        </Link>

        <Link to="accounting" className="card !p-4 bg-gradient-to-br from-brand-500 to-brand-600 text-white hover:shadow-lg transition-all">
          <div className="flex items-center justify-between">
            <div className="text-xs opacity-90">📈 Laba Kotor Bulan Ini ({month})</div>
          </div>
          <div className="text-2xl font-bold mt-2">{profitMonth.gp === null ? "HPP belum lengkap" : formatRp(profitMonth.gp)}</div>
          <div className="text-[11px] opacity-90 mt-1">
            Omzet {formatRp(profitMonth.omzet)} · HPP {profitMonth.hpp === null ? "belum lengkap" : formatRp(profitMonth.hpp)}
          </div>
          <div className="text-[11px] opacity-90 mt-0.5">
            Margin: <b>{profitMonth.pct === null ? "—" : `${profitMonth.pct.toFixed(1)}%`}</b> · {profitMonth.count} trx
          </div>
        </Link>

        <div className={`card !p-4 ${marginAlerts.length > 0 ? "border-2 border-danger-300 bg-danger-50/30" : "bg-emerald-50/30 border border-emerald-200"}`}>
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold flex items-center gap-1">
              {marginAlerts.length > 0 ? <span className="text-danger-700">⚠ Margin Alert</span> : <span className="text-emerald-700">✓ Semua Margin Aman</span>}
            </div>
            <Link to="inventory" className="text-[10px] text-brand-600">Inventory →</Link>
          </div>
          {marginAlerts.length === 0 ? (
            <div className="text-xs text-ink-500 mt-2">Tidak ada produk dengan margin &lt; 10%. 🎉</div>
          ) : (
            <ul className="mt-2 space-y-1 text-xs">
              {marginAlerts.map((m) => (
                <li key={m.id} className="flex justify-between items-center">
                  <span className="truncate flex-1">{m.name}</span>
                  <span className={`font-bold ml-2 ${m.isLoss ? "text-danger-600" : "text-orange-600"}`}>
                    {m.isLoss ? "RUGI " : ""}{m.pct.toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Stok menipis */}
        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">⚠ Stok Menipis</h2>
            <Link to="inventory" className="text-xs text-brand-600">Lihat semua →</Link>
          </div>
          <div className="mt-3 divide-y divide-surface-100">
            {stats.lowStock.length === 0 && <div className="text-sm text-ink-500 py-4 text-center">✅ Semua stok aman</div>}
            {stats.lowStock.slice(0, 5).map((p) => {
              const stock = demoTotalQty(p.batches);
              return (
                <div key={p.id} className="py-2 flex items-center gap-2">
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${p.gradient} grid place-items-center text-lg shrink-0`}>{p.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{p.name}</div>
                    <div className="text-xs text-ink-500">Min stok: {p.minStock}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-warn-500">{stock}</div>
                    <div className="text-[10px] text-ink-500">tersisa</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Akan kadaluarsa */}
        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">⏰ Akan Kadaluarsa (&lt; 90 hari)</h2>
            <Link to="inventory" className="text-xs text-brand-600">Lihat semua →</Link>
          </div>
          <div className="mt-3 divide-y divide-surface-100">
            {stats.expiringSoon.length === 0 && <div className="text-sm text-ink-500 py-4 text-center">✅ Tidak ada yang akan kadaluarsa</div>}
            {stats.expiringSoon.slice(0, 5).map((b) => (
              <div key={b.id} className="py-2 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{b.productName}</div>
                  <div className="text-xs text-ink-500 font-mono">Batch {b.batchNo} · {b.qty} pcs</div>
                </div>
                <span className={`badge text-[10px] ${b.days < 30 ? "bg-danger-500/10 text-danger-500" : "bg-warn-500/10 text-warn-500"}`}>
                  {b.expiryISO}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Expired — perlu Pemusnahan */}
      {stats.expiredBatches.length > 0 && (
        <div className="card border-danger-200 bg-danger-50/30">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-semibold text-danger-700">⚫ Batch Expired — Perlu Dimusnahkan (BAP)</h2>
              <p className="text-xs text-ink-500 mt-0.5">
                {stats.expiredUnits} unit · senilai <span className="font-semibold text-danger-700">{formatRp(stats.expiredValue)}</span> · auto-blokir di POS
              </p>
            </div>
            <Link to="disposal" className="btn-primary text-xs">📝 Buat BAP Pemusnahan</Link>
          </div>
          <div className="mt-3 divide-y divide-danger-100">
            {stats.expiredBatches.slice(0, 5).map((b) => (
              <div key={b.id} className="py-2 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{b.productName}</div>
                  <div className="text-xs text-ink-500 font-mono">Batch {b.batchNo} · {b.qty} {b.unit}</div>
                </div>
                <span className="badge text-[10px] bg-ink-900 text-white">
                  Expired {Math.abs(b.days)} hr lalu
                </span>
              </div>
            ))}
            {stats.expiredBatches.length > 5 && (
              <div className="py-2 text-xs text-ink-500 text-center">
                + {stats.expiredBatches.length - 5} batch lain…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Auto-suggest retur ke supplier */}
      {returnSuggestions.length > 0 && (
        <div className="card border-orange-200 bg-orange-50/30">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-semibold text-orange-700">↩️ Saran Retur ke Supplier</h2>
              <p className="text-xs text-ink-500 mt-0.5">
                {returnSuggestions.reduce((s, x) => s + x.batches.length, 0)} batch eligible ·
                total <span className="font-semibold text-orange-700">{formatRp(returnSuggestions.reduce((s, x) => s + x.totalValueRp, 0))}</span>
                {" "}· kirim balik sebelum lewat window kebijakan
              </p>
            </div>
            <Link to="returns" className="btn-secondary text-xs">📋 Buka Halaman Retur</Link>
          </div>
          <div className="mt-3 grid md:grid-cols-2 gap-3">
            {returnSuggestions.slice(0, 4).map((s) => (
              <div key={s.supplierId} className="border border-orange-200 rounded-xl p-3 bg-white">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">🏭 {s.supplierName}</div>
                    <div className="text-[11px] text-ink-500 mt-0.5">
                      {s.batches.length} batch · {s.totalUnits} unit · <span className="font-semibold text-orange-700">{formatRp(s.totalValueRp)}</span>
                    </div>
                  </div>
                  {s.urgentCount > 0 && (
                    <span className="badge text-[10px] bg-danger-500/10 text-danger-600 shrink-0">
                      ⏰ {s.urgentCount} mendesak
                    </span>
                  )}
                </div>
                <ul className="mt-2 space-y-1">
                  {s.batches.slice(0, 3).map((b) => (
                    <li key={b.batchNo} className="text-[11px] text-ink-600 flex items-center gap-1">
                      <span className="truncate flex-1">{b.productName} <span className="font-mono text-ink-400">#{b.batchNo}</span></span>
                      {b.deadline !== null && (
                        <span className={b.deadline <= 7 ? "text-danger-600 font-semibold" : "text-orange-600"}>
                          {b.deadline <= 0 ? `lewat ${Math.abs(b.deadline)}hr` : `${b.deadline}hr lagi`}
                        </span>
                      )}
                    </li>
                  ))}
                  {s.batches.length > 3 && (
                    <li className="text-[10px] text-ink-400">+ {s.batches.length - 3} batch lain…</li>
                  )}
                </ul>
                <Link
                  to="returns"
                  className="mt-2 block text-center text-[11px] text-brand-600 hover:underline"
                >→ Buat surat retur</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="card">
        <h2 className="font-semibold">🚀 Quick Actions</h2>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { to: "pos", icon: "🛒", label: "Buka Kasir" },
            { to: "inventory", icon: "📦", label: "Inventory" },
            { to: "orders", icon: "📋", label: "Pesanan" },
            { to: "doctor", icon: "👨‍⚕️", label: "Jadwal Dokter" },
            { to: "disposal", icon: "🗑", label: "Pemusnahan" },
            { to: "returns", icon: "↩️", label: "Retur Supplier" },
            { to: "verify", icon: "📱", label: "Scan QR" },
            { to: "ai", icon: "🤖", label: "AI Assistant" },
            { to: tenant ? `/store/${tenant.slug}` : "#", icon: "🛍️", label: "Lihat Toko Online" },
          ].map((a) => (
            <Link key={a.to} to={a.to} className="rounded-xl border border-surface-100 hover:border-brand-200 hover:bg-brand-50/30 p-3 text-center transition-colors">
              <div className="text-2xl">{a.icon}</div>
              <div className="text-xs font-medium mt-1">{a.label}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Detail modals */}
      {detail && (
        <KPIDetailModal
          which={detail}
          onClose={() => setDetail(null)}
          tenantId={tenantId}
          canReadSales={isOwner}
          sales={todaysSales}
          products={products}
          stats={stats}
          dailySales={dailySales}
          dailyOrders={dailyOrders}
        />
      )}
    </div>
  );
}

// ---------- Detail modal ----------

type KPIDetailProps = {
  which: Exclude<DetailKey, null>;
  onClose: () => void;
  tenantId: string;
  products: DemoProduct[];
  stats: {
    totalProducts: number;
    totalStockUnits: number;
    stockValue: number;
    lowStock: any[];
    marketplaceCount: number;
    expiringSoon: any[];
  };
  dailySales: number;
  dailyOrders: number;
  canReadSales: boolean;
  sales: DashboardSale[];
};

function KPIDetailModal({ which, onClose, tenantId, products, stats, dailySales, dailyOrders, canReadSales, sales }: KPIDetailProps) {
  const titleMap: Record<Exclude<DetailKey, null>, string> = {
    sales: "💰 Detail Penjualan Hari Ini",
    products: "📦 Detail Total Produk",
    value: "💎 Detail Nilai Stok",
    attention: "⚠️ Detail Perlu Perhatian",
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
          <h2 className="font-bold text-lg">{titleMap[which]}</h2>
          <button onClick={onClose} className="text-2xl text-ink-400 hover:text-ink-700 leading-none">×</button>
        </div>

        <div className="overflow-y-auto p-5">
          {which === "sales" && <SalesDetail sales={sales} canReadSales={canReadSales} dailySales={dailySales} dailyOrders={dailyOrders} />}
          {which === "products" && <ProductsDetail products={products} totalUnits={stats.totalStockUnits} />}
          {which === "value" && <StockValueDetail products={products} totalValue={stats.stockValue} marketplaceCount={stats.marketplaceCount} />}
          {which === "attention" && <AttentionDetail lowStock={stats.lowStock} expiringSoon={stats.expiringSoon} />}
        </div>

        <div className="border-t border-surface-100 px-5 py-3 flex justify-end gap-2 bg-surface-50">
          <Link to="reports" className="btn-secondary text-sm" onClick={onClose}>📊 Buka Laporan Lengkap</Link>
          <button onClick={onClose} className="btn-primary text-sm">Tutup</button>
        </div>
      </div>
    </div>
  );
}

function SalesDetail({ sales, canReadSales, dailySales, dailyOrders }: {
  sales: DashboardSale[];
  canReadSales: boolean;
  dailySales: number;
  dailyOrders: number;
}) {
  const byMethod = sales.reduce<Record<string, { count: number; total: number }>>((acc, sale) => {
    const method = sale.paymentMethod || "LAINNYA";
    if (!acc[method]) acc[method] = { count: 0, total: 0 };
    acc[method].count++;
    acc[method].total += sale.totalRp;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-brand-50 rounded-xl p-3">
          <div className="text-[11px] text-ink-500">Total Omzet</div>
          <div className="font-bold text-brand-700">{formatRp(dailySales)}</div>
        </div>
        <div className="bg-accent-50 rounded-xl p-3">
          <div className="text-[11px] text-ink-500">Transaksi</div>
          <div className="font-bold text-accent-700">{dailyOrders}</div>
        </div>
        <div className="bg-surface-50 rounded-xl p-3">
          <div className="text-[11px] text-ink-500">Avg Ticket</div>
          <div className="font-bold">{formatRp(dailyOrders ? Math.round(dailySales / dailyOrders) : 0)}</div>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-2">Per Metode Pembayaran</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Object.entries(byMethod).map(([m, v]) => (
            <div key={m} className="border border-surface-200 rounded-lg p-2 text-center">
              <div className="text-[10px] text-ink-500">{m}</div>
              <div className="font-bold text-sm">{v.count}x</div>
              <div className="text-[10px] text-ink-500">{formatRp(v.total)}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-2">Daftar Transaksi ({sales.length})</h3>
        <div className="border border-surface-100 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 text-xs text-ink-500">
              <tr>
                <th className="text-left px-3 py-2">Jam</th>
                <th className="text-left px-3 py-2">Kasir</th>
                <th className="text-left px-3 py-2">Metode</th>
                <th className="text-right px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {!canReadSales ? <tr><td colSpan={4} className="px-3 py-6 text-center text-ink-500">Data penjualan hanya tersedia untuk Owner.</td></tr>
                : sales.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-ink-500">Belum ada transaksi hari ini.</td></tr>
                  : sales.slice(0, 20).map((sale) => (
                <tr key={sale.id}>
                  <td className="px-3 py-2 font-mono text-xs">{sale.createdAt?.toDate?.().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) ?? "—"}</td>
                  <td className="px-3 py-2">{sale.cashier || "—"}</td>
                  <td className="px-3 py-2"><span className="badge text-[10px] bg-surface-100">{sale.paymentMethod || "—"}</span></td>
                  <td className="px-3 py-2 text-right font-medium">{formatRp(sale.totalRp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sales.length > 20 && (
            <div className="bg-surface-50 text-center text-xs text-ink-500 py-2">
              … {sales.length - 20} transaksi lainnya
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductsDetail({ products, totalUnits }: { products: any[]; totalUnits: number }) {
  const byCategory = products.reduce<Record<string, { count: number; units: number }>>((acc, p) => {
    if (!acc[p.category]) acc[p.category] = { count: 0, units: 0 };
    acc[p.category].count++;
    acc[p.category].units += demoTotalQty(p.batches);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-brand-50 rounded-xl p-3">
          <div className="text-[11px] text-ink-500">Total SKU</div>
          <div className="font-bold text-brand-700 text-xl">{products.length}</div>
        </div>
        <div className="bg-accent-50 rounded-xl p-3">
          <div className="text-[11px] text-ink-500">Total Unit Stok</div>
          <div className="font-bold text-accent-700 text-xl">{totalUnits.toLocaleString("id-ID")}</div>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-2">Per Kategori</h3>
        <div className="space-y-1.5">
          {Object.entries(byCategory).sort((a, b) => b[1].units - a[1].units).map(([cat, v]) => (
            <div key={cat} className="flex items-center gap-3 p-2 rounded-lg bg-surface-50">
              <div className="flex-1 font-medium text-sm">{cat}</div>
              <div className="text-xs text-ink-500">{v.count} SKU</div>
              <div className="font-bold text-sm w-16 text-right">{v.units} unit</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-2">Daftar Produk</h3>
        <div className="space-y-1">
          {products.map((p) => (
            <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-50">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${p.gradient} grid place-items-center text-base shrink-0 overflow-hidden`}>
                {p.imageUrl ? <img src={p.imageUrl} alt="" className="w-full h-full object-contain" /> : p.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{p.name}</div>
                <div className="text-[10px] text-ink-500">{p.category} · {formatRp(p.price)}</div>
              </div>
              <div className="text-sm font-bold">{demoTotalQty(p.batches)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StockValueDetail({ products, totalValue, marketplaceCount }: { products: any[]; totalValue: number; marketplaceCount: number }) {
  const sorted = [...products]
    .map((p) => ({ ...p, qty: demoTotalQty(p.batches), value: demoTotalQty(p.batches) * p.price }))
    .sort((a, b) => b.value - a.value);
  const max = sorted[0]?.value || 1;
  const marketplaceValue = sorted.filter((p) => p.marketplaceEnabled).reduce((s, p) => s + p.value, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-brand-50 rounded-xl p-3">
          <div className="text-[11px] text-ink-500">Total Nilai Stok</div>
          <div className="font-bold text-brand-700">{formatRp(totalValue)}</div>
        </div>
        <div className="bg-accent-50 rounded-xl p-3">
          <div className="text-[11px] text-ink-500">{marketplaceCount} Produk di Marketplace</div>
          <div className="font-bold text-accent-700">{formatRp(marketplaceValue)}</div>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-2">Top Produk Berdasarkan Nilai</h3>
        <div className="space-y-1.5">
          {sorted.slice(0, 10).map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <div className="text-base w-7 text-center">{p.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs font-bold text-brand-700 shrink-0">{formatRp(p.value)}</div>
                </div>
                <div className="bg-surface-100 rounded-full h-1.5 mt-1 overflow-hidden">
                  <div className="bg-gradient-to-r from-brand-500 to-accent-400 h-full" style={{ width: `${(p.value / max) * 100}%` }} />
                </div>
                <div className="text-[10px] text-ink-500 mt-0.5">{p.qty} unit × {formatRp(p.price)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AttentionDetail({ lowStock, expiringSoon }: { lowStock: any[]; expiringSoon: any[] }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-sm mb-2 text-warn-700">⚠ Stok Menipis ({lowStock.length})</h3>
        {lowStock.length === 0 ? (
          <div className="text-sm text-ink-500 italic bg-surface-50 rounded-lg p-3">✅ Semua stok aman</div>
        ) : (
          <div className="space-y-1.5">
            {lowStock.map((p) => {
              const stock = demoTotalQty(p.batches);
              return (
                <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg bg-warn-50/50 border border-warn-100">
                  <div className="text-xl">{p.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-[10px] text-ink-500">Min: {p.minStock} · Sekarang: <span className="font-bold text-warn-600">{stock}</span></div>
                  </div>
                  <div className="text-xs text-warn-700 font-bold">{p.minStock - stock} kurang</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-2 text-danger-700">⏰ Akan Kadaluarsa ({expiringSoon.length})</h3>
        {expiringSoon.length === 0 ? (
          <div className="text-sm text-ink-500 italic bg-surface-50 rounded-lg p-3">✅ Tidak ada yang akan kadaluarsa dalam 90 hari</div>
        ) : (
          <div className="space-y-1.5">
            {expiringSoon.map((b) => (
              <div key={b.id} className="flex items-center gap-2 p-2 rounded-lg bg-danger-50/40 border border-danger-100">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{b.productName}</div>
                  <div className="text-[10px] text-ink-500 font-mono">Batch {b.batchNo} · {b.qty} pcs</div>
                </div>
                <div className="text-right">
                  <div className={`text-xs font-bold ${b.days < 30 ? "text-danger-600" : "text-warn-600"}`}>
                    {b.days} hari lagi
                  </div>
                  <div className="text-[10px] text-ink-500 font-mono">{b.expiryISO}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
