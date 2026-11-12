import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import { businessDate, subscribeMonthlySales } from "../../lib/salesReporting";

type Sale = {
  id: string;
  trxId?: string;
  dateISO: string;
  cashier: string;
  paymentMethod: string;
  subtotalRp: number;
  discountRp: number;
  totalRp: number;
  totalCostRp?: number;
  grossProfitRp?: number;
  totalCostStatus?: "KNOWN" | "UNKNOWN";
};

const rupiah = (value: number) => `Rp ${Math.round(value || 0).toLocaleString("id-ID")}`;

export function PharmacyFinance() {
  const tenantId = useAuth((state) => state.claims?.tenantId || "");
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const transactions = useMemo(() => {
    const grouped = new Map<string, Sale>();
    sales.forEach((sale) => {
      const key = sale.trxId || sale.id;
      const current = grouped.get(key);
      if (!current) {
        grouped.set(key, { ...sale, id: key });
        return;
      }
      current.subtotalRp += sale.subtotalRp || 0;
      current.discountRp += sale.discountRp || 0;
      current.totalRp += sale.totalRp || 0;
      if (typeof sale.totalCostRp === "number" && typeof current.totalCostRp === "number") {
        current.totalCostRp += sale.totalCostRp;
        current.grossProfitRp = (current.grossProfitRp || 0) + (sale.grossProfitRp || 0);
      } else {
        current.totalCostRp = undefined;
        current.grossProfitRp = undefined;
        current.totalCostStatus = "UNKNOWN";
      }
    });
    return [...grouped.values()];
  }, [sales]);

  useEffect(() => {
    let active = true;
    if (!tenantId) {
      setLoading(false);
      return;
    }
    const unsubscribe = subscribeMonthlySales(tenantId, (rows) => {
      if (active) { setSales(rows as Sale[]); setError(false); setLoading(false); }
    }, () => { if (active) { setError(true); setLoading(false); } });
    return () => { active = false; unsubscribe(); };
  }, [tenantId]);

  const summary = useMemo(() => {
    const today = businessDate();
    const month = today.slice(0, 7);
    const monthlySales = transactions.filter((sale) => sale.dateISO?.startsWith(month));
    return {
      revenue: monthlySales.reduce((sum, sale) => sum + (sale.totalRp || 0), 0),
      cost: monthlySales.reduce((sum, sale) => sum + (sale.totalCostRp || 0), 0),
      profit: monthlySales.reduce((sum, sale) => sum + (sale.grossProfitRp || 0), 0),
      costKnown: monthlySales.every((sale) => sale.totalCostStatus !== "UNKNOWN" && typeof sale.totalCostRp === "number"),
      today: transactions.filter((sale) => sale.dateISO === today).length,
      monthCount: monthlySales.length,
    };
  }, [transactions]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Keuangan</h1>
        <p className="text-sm text-ink-500 mt-1">Seluruh transaksi POS bulan berjalan, diperbarui otomatis saat online. HPP/laba belum tersedia untuk transaksi yang belum memiliki biaya terverifikasi.</p>
      </header>
      {error && <p role="alert" className="text-sm text-danger-600">Data penjualan gagal dimuat.</p>}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="Omzet bulan ini" value={loading ? "…" : rupiah(summary.revenue)} />
        <Metric label="HPP bulan ini" value={loading ? "…" : summary.costKnown ? rupiah(summary.cost) : "Belum lengkap"} />
        <Metric label="Laba kotor bulan ini" value={loading ? "…" : summary.costKnown ? rupiah(summary.profit) : "Belum lengkap"} />
        <Metric label="Transaksi hari ini" value={loading ? "…" : String(summary.today)} />
      </section>
      <section className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-100 flex justify-between">
          <h2 className="font-semibold">Transaksi POS terbaru</h2>
          <span className="text-xs text-ink-500">{summary.monthCount} transaksi bulan ini</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface-50 text-left text-xs uppercase text-ink-500"><tr><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">No. Transaksi</th><th className="px-4 py-3">Kasir</th><th className="px-4 py-3">Metode</th><th className="px-4 py-3 text-right">Omzet</th><th className="px-4 py-3 text-right">Laba kotor</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-500">Memuat transaksi…</td></tr>
                : sales.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-500">Belum ada transaksi POS tersimpan.</td></tr>
                  : transactions.map((sale) => <tr key={sale.id} className="border-t border-surface-100"><td className="px-4 py-3">{sale.dateISO}</td><td className="px-4 py-3 font-mono text-xs">{sale.trxId || sale.id}</td><td className="px-4 py-3">{sale.cashier || "—"}</td><td className="px-4 py-3">{sale.paymentMethod || "—"}</td><td className="px-4 py-3 text-right">{rupiah(sale.totalRp)}</td><td className="px-4 py-3 text-right">{typeof sale.grossProfitRp === "number" ? rupiah(sale.grossProfitRp) : "—"}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="card p-4"><div className="text-xs text-ink-500">{label}</div><div className="text-xl font-bold mt-1">{value}</div></div>;
}