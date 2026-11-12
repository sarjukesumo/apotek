import { useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import { useDemoStore, demoTotalQty } from "../../lib/demoStore";

type Range = "7d" | "30d" | "90d";

// Deterministic faux daily sales generator based on tenant + date
function fauxSales(tenantId: string, dateISO: string) {
  let h = 0;
  const s = tenantId + dateISO;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const base = (Math.abs(h) % 25) + 8;       // 8..32 transactions
  const avg = 45000 + (Math.abs(h >> 3) % 90000); // avg ticket 45k..135k
  const tx = base;
  const omzet = tx * avg;
  return { tx, omzet, avg };
}

const fmtRp = (n: number) => "Rp" + n.toLocaleString("id-ID");

export function TenantReports() {
  const claims = useAuth((s) => s.claims);
  const tenantId = claims?.tenantId ?? "";

  const products = useDemoStore((s) => s.products);
  const tenants = useDemoStore((s) => s.tenants);
  const tenant = tenants.find((t) => t.id === tenantId);

  const [range, setRange] = useState<Range>("30d");
  const [tab, setTab] = useState<"sales" | "stock" | "expiry" | "topProducts">("sales");

  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;

  const series = useMemo(() => {
    const out: { date: string; tx: number; omzet: number }[] = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const s = fauxSales(tenantId, iso);
      out.push({ date: iso, tx: s.tx, omzet: s.omzet });
    }
    return out;
  }, [tenantId, days]);

  const totals = useMemo(() => {
    const omzet = series.reduce((a, x) => a + x.omzet, 0);
    const tx = series.reduce((a, x) => a + x.tx, 0);
    const avgDaily = omzet / days;
    return { omzet, tx, avgDaily, avgTicket: tx ? omzet / tx : 0 };
  }, [series, days]);

  const tenantProducts = useMemo(
    () => products.filter((p) => p.tenantId === tenantId),
    [products, tenantId]
  );

  const stockValue = useMemo(
    () => tenantProducts.reduce((sum, p) => sum + demoTotalQty(p.batches) * p.price, 0),
    [tenantProducts]
  );
  const lowStock = tenantProducts.filter((p) => demoTotalQty(p.batches) < p.minStock);
  const expiring = useMemo(() => {
    const out: { product: string; batchNo: string; qty: number; expiry: string; daysLeft: number }[] = [];
    const now = Date.now();
    for (const p of tenantProducts) {
      for (const b of p.batches) {
        const dl = Math.round((new Date(b.expiryISO).getTime() - now) / (1000 * 60 * 60 * 24));
        if (dl <= 180) {
          out.push({ product: p.name, batchNo: b.batchNo, qty: b.qty, expiry: b.expiryISO, daysLeft: dl });
        }
      }
    }
    return out.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [tenantProducts]);

  // Top products: faux sales count per product based on price + id hash
  const topProducts = useMemo(() => {
    return tenantProducts
      .map((p) => {
        let h = 0;
        for (let i = 0; i < p.id.length; i++) h = (h * 31 + p.id.charCodeAt(i)) | 0;
        const sold = Math.abs(h) % 80 + 12;
        return { name: p.name, emoji: p.emoji, sold, omzet: sold * p.price };
      })
      .sort((a, b) => b.omzet - a.omzet)
      .slice(0, 8);
  }, [tenantProducts]);

  const maxOmzet = Math.max(...series.map((s) => s.omzet), 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">📊 Laporan</h1>
          <p className="text-sm text-ink-500">Ringkasan penjualan, stok, kadaluarsa, dan produk terlaris {tenant?.name}.</p>
        </div>
        <div className="flex gap-1">
          {(["7d", "30d", "90d"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                range === r ? "bg-brand-500 text-white border-brand-500" : "bg-white text-ink-600 border-surface-200"
              }`}
            >
              {r === "7d" ? "7 Hari" : r === "30d" ? "30 Hari" : "90 Hari"}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label={`Total Omzet ${days}h`} value={fmtRp(totals.omzet)} color="text-brand-600" onClick={() => setTab("sales")} active={tab === "sales"} />
        <KPI label="Transaksi" value={totals.tx.toLocaleString("id-ID")} color="text-accent-600" onClick={() => setTab("sales")} active={tab === "sales"} />
        <KPI label="Rata-rata Harian" value={fmtRp(Math.round(totals.avgDaily))} color="text-warn-600" onClick={() => setTab("topProducts")} active={tab === "topProducts"} />
        <KPI label="Avg. Ticket" value={fmtRp(Math.round(totals.avgTicket))} color="text-brand-700" onClick={() => setTab("topProducts")} active={tab === "topProducts"} />
      </div>

      {/* Tabs */}
      <div className="card overflow-hidden">
        <div className="flex border-b border-surface-100 bg-surface-50">
          {([
            { k: "sales", label: "📈 Tren Penjualan" },
            { k: "topProducts", label: "🔥 Produk Terlaris" },
            { k: "stock", label: "📦 Nilai Stok" },
            { k: "expiry", label: "⏰ Kadaluarsa" },
          ] as const).map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                tab === t.k ? "border-brand-500 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === "sales" && (
            <div className="space-y-2">
              <div className="text-xs text-ink-500 mb-3">Omzet per hari ({days} hari terakhir)</div>
              <div className="flex items-end gap-1 h-48">
                {series.map((s) => (
                  <div key={s.date} className="flex-1 flex flex-col items-center gap-1 group">
                    <div
                      className="w-full bg-gradient-to-t from-brand-500 to-accent-400 rounded-t hover:opacity-80 transition relative"
                      style={{ height: `${(s.omzet / maxOmzet) * 100}%` }}
                      title={`${s.date}: ${fmtRp(s.omzet)} (${s.tx} tx)`}
                    >
                      <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-ink-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap pointer-events-none">
                        {fmtRp(s.omzet)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-ink-400 pt-2">
                <span>{fmtDate(series[0]?.date)}</span>
                <span>{fmtDate(series[series.length - 1]?.date)}</span>
              </div>
            </div>
          )}

          {tab === "topProducts" && (
            <div className="space-y-2">
              {topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-50">
                  <div className="w-7 text-center text-sm font-bold text-ink-400">#{i + 1}</div>
                  <div className="text-2xl">{p.emoji}</div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-xs text-ink-500">{p.sold} terjual</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-brand-600">{fmtRp(p.omzet)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "stock" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <KPI label="Total SKU" value={tenantProducts.length} color="text-brand-600" />
                <KPI label="Nilai Stok" value={fmtRp(stockValue)} color="text-accent-600" />
                <KPI label="Stok Menipis" value={lowStock.length} color="text-danger-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-2">⚠️ Produk Stok Menipis</h3>
                {lowStock.length === 0 ? (
                  <p className="text-sm text-ink-400 italic">Semua stok aman.</p>
                ) : (
                  <div className="space-y-1">
                    {lowStock.map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-2 bg-warn-50 rounded">
                        <span className="text-sm">{p.emoji} {p.name}</span>
                        <span className="text-xs text-warn-700 font-bold">
                          {demoTotalQty(p.batches)} / min {p.minStock} {p.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "expiry" && (
            <div>
              <h3 className="font-semibold text-sm mb-2">⏰ Batch akan kadaluarsa &lt; 6 bulan</h3>
              {expiring.length === 0 ? (
                <p className="text-sm text-ink-400 italic">Tidak ada batch yang akan kadaluarsa dalam 6 bulan.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-ink-500 text-left">
                    <tr>
                      <th className="py-2">Produk</th>
                      <th>Batch</th>
                      <th>Qty</th>
                      <th>Expiry</th>
                      <th>Sisa Hari</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiring.map((e, i) => (
                      <tr key={i} className="border-t border-surface-100">
                        <td className="py-2">{e.product}</td>
                        <td className="text-ink-600 font-mono text-xs">{e.batchNo}</td>
                        <td>{e.qty}</td>
                        <td>{fmtDate(e.expiry)}</td>
                        <td>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-bold ${
                              e.daysLeft < 0
                                ? "bg-danger-100 text-danger-700"
                                : e.daysLeft < 30
                                ? "bg-danger-100 text-danger-700"
                                : e.daysLeft < 90
                                ? "bg-warn-100 text-warn-700"
                                : "bg-accent-100 text-accent-700"
                            }`}
                          >
                            {e.daysLeft < 0 ? `EXPIRED ${-e.daysLeft}h` : `${e.daysLeft} hari`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-ink-400 italic">
        💡 Data penjualan adalah simulasi deterministik (stabil per tanggal). Data stok & kadaluarsa real-time dari demoStore.
      </p>
    </div>
  );
}

function KPI({ label, value, color, onClick, active }: { label: string; value: number | string; color: string; onClick?: () => void; active?: boolean }) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`card p-4 text-left transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer ${active ? "ring-2 ring-brand-400 border-brand-300" : ""}`}
      >
        <div className="text-[11px] uppercase tracking-wider text-ink-500">{label}</div>
        <div className={`text-xl font-bold ${color}`}>{value}</div>
        <div className="text-[10px] text-ink-400 mt-0.5">klik untuk detail →</div>
      </button>
    );
  }
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}
