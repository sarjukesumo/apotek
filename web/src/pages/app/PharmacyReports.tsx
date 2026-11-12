import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import { loadTenantInventory } from "../../lib/inventoryRepository";
import { availableQty, batchZone, daysToExpiry } from "../../lib/fefo";
import type { DemoProduct } from "../../lib/demoStore";
import { businessDate, subscribeMonthlySales } from "../../lib/salesReporting";

type SaleRow = { trxId?: string; id?: string; dateISO: string; totalRp: number; items?: { productId: string; productName: string; qty: number }[] };
const rupiah = (value: number) => `Rp ${Math.round(value || 0).toLocaleString("id-ID")}`;

export function PharmacyReports() {
  const tenantId = useAuth((state) => state.claims?.tenantId || "");
  const [products, setProducts] = useState<DemoProduct[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    if (!tenantId) {
      setLoading(false);
      return;
    }
    loadTenantInventory(tenantId).then((inventory) => {
      if (!active) return;
      setProducts(inventory.products);
    }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    const unsubscribe = subscribeMonthlySales(tenantId, (rows) => {
      if (active) setSales(rows as SaleRow[]);
    }, () => { if (active) setError(true); });
    return () => { active = false; unsubscribe(); };
  }, [tenantId]);

  const report = useMemo(() => {
    const today = businessDate();
    const month = today.slice(0, 7);
    const currentMonth = sales.filter((sale) => sale.dateISO?.startsWith(month));
    const expiring = products.flatMap((product) => product.batches
      .filter((batch) => batch.qty > 0 && ["WARNING", "CRITICAL"].includes(batchZone(batch.expiryISO)))
      .map((batch) => ({ product: product.name, batch: batch.batchNo, qty: batch.qty, expiry: batch.expiryISO, days: daysToExpiry(batch.expiryISO) })));
    const lowStock = products.filter((product) => availableQty(product.batches) < product.minStock)
      .map((product) => ({ name: product.name, available: availableQty(product.batches), minimum: product.minStock }));
    const topProducts = new Map<string, { name: string; qty: number }>();
    currentMonth.forEach((sale) => sale.items?.forEach((item) => {
      const current = topProducts.get(item.productId) || { name: item.productName, qty: 0 };
      current.qty += item.qty;
      topProducts.set(item.productId, current);
    }));
    return {
      salesCount: new Set(currentMonth.map((sale) => sale.trxId || sale.id)).size,
      revenue: currentMonth.reduce((sum, sale) => sum + (sale.totalRp || 0), 0),
      stockUnits: products.reduce((sum, product) => sum + availableQty(product.batches), 0),
      lowStock,
      expiring: expiring.sort((a, b) => a.days - b.days),
      topProducts: [...topProducts.values()].sort((a, b) => b.qty - a.qty).slice(0, 10),
    };
  }, [products, sales]);

  return (
    <div className="space-y-5">
      <header><h1 className="text-2xl font-bold">Laporan Apotek</h1><p className="text-sm text-ink-500 mt-1">Bersumber dari inventory dan transaksi Firebase.</p></header>
      {error && <p role="alert" className="text-sm text-danger-600">Sebagian data laporan gagal dimuat.</p>}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="Produk" value={loading ? "…" : String(products.length)} />
        <Metric label="Unit stok tersedia" value={loading ? "…" : report.stockUnits.toLocaleString("id-ID")} />
        <Metric label="Omzet bulan ini" value={loading ? "…" : rupiah(report.revenue)} />
        <Metric label="Transaksi bulan ini" value={loading ? "…" : String(report.salesCount)} />
      </section>
      <section className="grid lg:grid-cols-2 gap-4">
        <ReportList title="Stok di bawah minimum" empty="Tidak ada produk di bawah stok minimum." headers={["Produk", "Tersedia", "Minimum"]} rows={report.lowStock.map((item) => [item.name, String(item.available), String(item.minimum)])} loading={loading} />
        <ReportList title="Batch mendekati kedaluwarsa" empty="Tidak ada batch yang mendekati kedaluwarsa." headers={["Produk / Batch", "Kedaluwarsa", "Sisa"]} rows={report.expiring.slice(0, 20).map((item) => [`${item.product} · ${item.batch}`, item.expiry, `${item.days} hari`])} loading={loading} />
        <ReportList title="Produk terlaris bulan ini" empty="Belum ada transaksi produk bulan ini." headers={["Produk", "Terjual"]} rows={report.topProducts.map((item) => [item.name, String(item.qty)])} loading={loading} />
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="card p-4"><div className="text-xs text-ink-500">{label}</div><div className="text-xl font-bold mt-1">{value}</div></div>;
}

function ReportList({ title, empty, headers, rows, loading }: { title: string; empty: string; headers: string[]; rows: string[][]; loading: boolean }) {
  return (
    <section className="card overflow-hidden">
      <h2 className="px-4 py-3 font-semibold border-b border-surface-100">{title}</h2>
      {loading ? <p className="p-4 text-sm text-ink-500">Memuat laporan…</p> : rows.length === 0 ? <p className="p-4 text-sm text-ink-500">{empty}</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-surface-50 text-left text-xs text-ink-500"><tr>{headers.map((header) => <th key={header} className="px-4 py-2">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-t border-surface-100">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-2">{cell}</td>)}</tr>)}</tbody></table></div>
      )}
    </section>
  );
}