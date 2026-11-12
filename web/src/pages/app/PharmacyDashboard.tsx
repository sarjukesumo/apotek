import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { loadTenantInventory } from "../../lib/inventoryRepository";
import { availableQty, batchZone } from "../../lib/fefo";
import type { DemoProduct } from "../../lib/demoStore";
import { subscribeMonthlySales } from "../../lib/salesReporting";

type PharmacyData = { name?: string; profile?: { name?: string; address?: string } };
type SaleRow = { id: string; trxId?: string; dateISO: string; totalRp: number };

function jakartaDateParts(date = new Date()) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date).map((part) => [part.type, part.value]));
}

function jakartaDateISO(date = new Date()) {
  const parts = jakartaDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

type DetailKind = "products" | "stock" | "lowStock" | "expiring" | "sales" | null;

export function PharmacyDashboard() {
  const tenantId = useAuth((state) => state.claims?.tenantId);
  const role = useAuth((state) => state.claims?.role);
  const user = useAuth((state) => state.user);
  const isAdmin = useAuth((state) => state.isAdmin);
  const reduceMotion = useReducedMotion();
  const isOwner = role === "OWNER" || isAdmin;
  const [products, setProducts] = useState<DemoProduct[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [pharmacy, setPharmacy] = useState<PharmacyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [detail, setDetail] = useState<DetailKind>(null);

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    let active = true;
    loadTenantInventory(tenantId)
      .then((result) => {
        if (!active) return;
        setProducts(result.products);
        setPharmacy(result.tenant as PharmacyData | null);
      })
      .catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    const unsubscribe = isOwner ? subscribeMonthlySales(tenantId, (rows) => {
      if (active) setSales(rows as SaleRow[]);
    }, () => { if (active) setLoadError(true); }) : undefined;
    return () => { active = false; unsubscribe?.(); };
  }, [tenantId, isOwner]);

  const inventory = useMemo(() => {
    const lowStock = products.filter((product) => availableQty(product.batches) < product.minStock).length;
    const expiring = products.reduce((count, product) => count + product.batches.filter((batch) => {
      const zone = batchZone(batch.expiryISO);
      return zone === "WARNING" || zone === "CRITICAL";
    }).length, 0);
    const expired = products.reduce((count, product) => count + product.batches.filter((batch) => batchZone(batch.expiryISO) === "EXPIRED").length, 0);
    return {
      products: products.length,
      stockUnits: products.reduce((sum, product) => sum + availableQty(product.batches), 0),
      lowStock,
      expiring,
      expired,
    };
  }, [products]);

  const isCashier = role === "CASHIER";
  const pharmacyName = pharmacy?.profile?.name || pharmacy?.name || "Apotek";
  const ownerName = user?.displayName?.trim().split(/\s+/)[0] || user?.email?.split("@")[0] || "Owner";
  const todayISO = jakartaDateISO();
  const salesToday = sales.filter((sale) => sale.dateISO === todayISO);
  const dailyRevenue = salesToday.reduce((sum, sale) => sum + (sale.totalRp || 0), 0);
  const dailyTransactions = new Set(salesToday.map((sale) => sale.trxId || sale.id)).size;
  const tickerItems = [
    `${inventory.products} produk tercatat`,
    `${inventory.lowStock} produk di bawah stok minimum`,
    `${inventory.expiring} batch mendekati kedaluwarsa`,
    `${inventory.expired} batch kedaluwarsa perlu BAP`,
    ...(isOwner ? [`${dailyTransactions} transaksi hari ini`] : []),
  ];

  return (
    <div className="space-y-6">
      <motion.header
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.3 }}
      >
        <p className="text-sm text-brand-700 font-medium">{isOwner ? "Dashboard Owner" : isCashier ? "Dashboard Kasir" : "Dashboard Staf"}</p>
        <h1 className="text-2xl font-bold mt-1">Selamat datang, {ownerName}</h1>
        <p className="text-sm text-ink-500 mt-1">{pharmacyName}{pharmacy?.profile?.address ? ` · ${pharmacy.profile.address}` : ""}</p>
      </motion.header>

      {loadError && <p role="alert" className="text-sm text-danger-600">Data apotek gagal dimuat. Periksa koneksi atau hak akses akun.</p>}
      <motion.div
        role="status"
        aria-label="Ringkasan operasional apotek"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.35, delay: reduceMotion ? 0 : 0.08 }}
        className="overflow-hidden rounded-lg border border-brand-100 bg-brand-50/70"
      >
        {loading ? <p className="px-4 py-3 text-sm text-ink-500">Memuat ringkasan operasional…</p> : (
          <div className="dashboard-ticker-track flex w-max items-center gap-8 whitespace-nowrap px-4 py-3 text-sm font-medium text-brand-800">
            {[...tickerItems, ...tickerItems].map((item, index) => (
              <span key={`${index}-${item}`} className="inline-flex items-center gap-8">
                <span>{item}</span><span aria-hidden="true" className="text-brand-400">•</span>
              </span>
            ))}
          </div>
        )}
      </motion.div>

      <motion.section
        aria-label="Ringkasan stok"
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.35, delay: reduceMotion ? 0 : 0.12 }}
        className={`grid grid-cols-2 gap-3 ${isOwner ? "lg:grid-cols-6" : "lg:grid-cols-4"}`}
      >
        <Metric label="Produk" value={loading ? "…" : inventory.products.toLocaleString("id-ID")} onClick={() => setDetail("products")} />
        <Metric label="Unit stok tersedia" value={loading ? "…" : inventory.stockUnits.toLocaleString("id-ID")} onClick={() => setDetail("stock")} />
        <Metric label="Produk di bawah stok minimum" value={loading ? "…" : inventory.lowStock.toLocaleString("id-ID")} onClick={() => setDetail("lowStock")} />
        <Metric label="Batch mendekati kedaluwarsa" value={loading ? "…" : inventory.expiring.toLocaleString("id-ID")} onClick={() => setDetail("expiring")} />
        {isOwner && <Metric label="Omzet hari ini" value={loading ? "…" : `Rp ${dailyRevenue.toLocaleString("id-ID")}`} onClick={() => setDetail("sales")} />}
        {isOwner && <Metric label="Transaksi hari ini" value={loading ? "…" : dailyTransactions.toLocaleString("id-ID")} onClick={() => setDetail("sales")} />}
      </motion.section>

      {detail && (
        <MetricDetail
          kind={detail}
          products={products}
          salesToday={salesToday}
          dailyRevenue={dailyRevenue}
          onClose={() => setDetail(null)}
        />
      )}

      <section>
        <h2 className="font-semibold mb-3">Menu operasional</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(isOwner || isCashier) && <DashboardLink reduceMotion={!!reduceMotion} delay={0} to="pos" title="POS / Kasir" description="Buka transaksi penjualan." />}
          {(isOwner || !isCashier) && <DashboardLink reduceMotion={!!reduceMotion} delay={0.04} to="inventory" title="Inventory" description="Lihat produk dan stok apotek." />}
          <DashboardLink reduceMotion={!!reduceMotion} delay={0.08} to="orders" title="Pesanan" description="Tinjau pesanan apotek." />
          <DashboardLink reduceMotion={!!reduceMotion} delay={0.12} to="hardware" title="Printer & Perangkat" description="Atur profil printer untuk kasir." />
          {isOwner && <DashboardLink reduceMotion={!!reduceMotion} delay={0.16} to="users" title="Pengguna & Akses" description="Kelola staf dan kasir apotek." />}
          {isOwner && <DashboardLink reduceMotion={!!reduceMotion} delay={0.2} to="settings" title="Profil & Nota" description="Atur branding dan format nota." />}
          {isOwner && <DashboardLink reduceMotion={!!reduceMotion} delay={0.24} to="accounting" title="Keuangan" description="Ringkasan transaksi POS tersimpan." />}
          {isOwner && <DashboardLink reduceMotion={!!reduceMotion} delay={0.28} to="reports" title="Laporan Apotek" description="Stok, penjualan, dan masa kedaluwarsa." />}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card p-4 text-left w-full hover:border-brand-300 focus-visible:border-brand-400 transition-colors cursor-pointer"
      title={`Lihat detail ${label.toLowerCase()}`}
    >
      <div className="text-xs text-ink-500 flex items-center justify-between gap-2">
        <span>{label}</span>
        <span aria-hidden="true" className="text-ink-300">›</span>
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </button>
  );
}

function MetricDetail({ kind, products, salesToday, dailyRevenue, onClose }: {
  kind: Exclude<DetailKind, null>;
  products: DemoProduct[];
  salesToday: SaleRow[];
  dailyRevenue: number;
  onClose: () => void;
}) {
  const titles: Record<Exclude<DetailKind, null>, string> = {
    products: "Semua produk tercatat",
    stock: "Unit stok tersedia per produk",
    lowStock: "Produk di bawah stok minimum",
    expiring: "Batch mendekati kedaluwarsa",
    sales: "Transaksi hari ini",
  };

  const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name, "id"));
  const stockRows = [...products]
    .map((product) => ({ product, qty: availableQty(product.batches) }))
    .sort((a, b) => b.qty - a.qty);
  const lowStockRows = stockRows.filter(({ product, qty }) => qty < product.minStock);
  const expiringRows = products.flatMap((product) => product.batches
    .map((batch) => ({ product, batch, zone: batchZone(batch.expiryISO) }))
    .filter(({ zone }) => zone === "WARNING" || zone === "CRITICAL"))
    .sort((a, b) => a.batch.expiryISO.localeCompare(b.batch.expiryISO));
  const trxRows = [...salesToday
    .reduce((map, sale) => {
      const key = sale.trxId || sale.id;
      map.set(key, { trxId: key, totalRp: (map.get(key)?.totalRp || 0) + (sale.totalRp || 0), lines: (map.get(key)?.lines || 0) + 1 });
      return map;
    }, new Map<string, { trxId: string; totalRp: number; lines: number }>())
    .values()];

  return (
    <div className="fixed inset-0 z-50 bg-ink-900/40 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={titles[kind]} onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[80vh] flex flex-col p-0 overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-surface-100">
          <h2 className="font-semibold">{titles[kind]}</h2>
          <button type="button" className="btn-secondary px-3 py-1 text-sm" onClick={onClose}>Tutup</button>
        </div>
        <div className="overflow-y-auto">
          {kind === "products" && (
            <DetailTable
              head={["Produk", "Kategori", "Stok", "Satuan"]}
              rows={sortedProducts.map((product) => [product.name, product.category || "—", availableQty(product.batches).toLocaleString("id-ID"), product.unit || "—"])}
              empty="Belum ada produk tercatat."
            />
          )}
          {kind === "stock" && (
            <DetailTable
              head={["Produk", "Stok tersedia", "Satuan"]}
              rows={stockRows.map(({ product, qty }) => [product.name, qty.toLocaleString("id-ID"), product.unit || "—"])}
              empty="Belum ada stok tersedia."
            />
          )}
          {kind === "lowStock" && (
            <DetailTable
              head={["Produk", "Stok", "Min. stok"]}
              rows={lowStockRows.map(({ product, qty }) => [product.name, qty.toLocaleString("id-ID"), product.minStock.toLocaleString("id-ID")])}
              empty="Tidak ada produk di bawah stok minimum. 👍"
            />
          )}
          {kind === "expiring" && (
            <DetailTable
              head={["Produk", "Batch", "Kedaluwarsa", "Qty", "Status"]}
              rows={expiringRows.map(({ product, batch, zone }) => [
                product.name, batch.batchNo || "—", batch.expiryISO, batch.qty.toLocaleString("id-ID"),
                zone === "CRITICAL" ? "Kritis" : "Perhatian",
              ])}
              empty="Tidak ada batch mendekati kedaluwarsa. 👍"
            />
          )}
          {kind === "sales" && (
            <>
              <DetailTable
                head={["Transaksi", "Baris item", "Total"]}
                rows={trxRows.map((trx) => [trx.trxId, String(trx.lines), `Rp ${trx.totalRp.toLocaleString("id-ID")}`])}
                empty="Belum ada transaksi hari ini."
              />
              {trxRows.length > 0 && (
                <p className="px-4 py-3 text-sm font-semibold border-t border-surface-100 text-right">
                  Total omzet hari ini: Rp {dailyRevenue.toLocaleString("id-ID")}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailTable({ head, rows, empty }: { head: string[]; rows: string[][]; empty: string }) {
  if (rows.length === 0) return <p className="px-4 py-8 text-sm text-center text-ink-500">{empty}</p>;
  return (
    <table className="w-full text-sm">
      <thead className="bg-surface-50 text-left text-xs uppercase text-ink-500 sticky top-0">
        <tr>{head.map((label) => <th key={label} className="px-4 py-2.5">{label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index} className="border-t border-surface-100">
            {row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-2.5">{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DashboardLink({ to, title, description, delay, reduceMotion }: {
  to: string;
  title: string;
  description: string;
  delay: number;
  reduceMotion: boolean;
}) {
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.25, delay: reduceMotion ? 0 : delay }}
    >
      <Link to={to} className="card block p-4 hover:border-brand-300 transition-colors">
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-ink-500 mt-1">{description}</div>
      </Link>
    </motion.div>
  );
}