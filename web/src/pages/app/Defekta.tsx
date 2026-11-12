// Buku Defekta — daftar item yang perlu di-PO ke supplier.
// Saran qty otomatis berdasarkan ROP (Reorder Point) sederhana:
//   ROP = (avg sales per hari × lead time) + safety stock
//   suggestQty (EOQ-ish) = max(minStock × 2 - currentStock, leadTime × dailyAvg × 1.5)
// Avg sales per hari diestimasi dari minStock (heuristic untuk demo).

import { useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import { useDemoStore, type DemoDefektaItem, type DemoProduct } from "../../lib/demoStore";
import { availableQty } from "../../lib/fefo";

const LEAD_TIME_DAYS = 5;     // asumsi default lead time supplier
const SAFETY_STOCK_FACTOR = 1.3; // 30% buffer

function computeROP(p: DemoProduct) {
  // Estimasi avg daily sales: minStock dianggap stock untuk ~7 hari
  const dailyAvg = Math.max(1, p.minStock / 7);
  const rop = Math.ceil(dailyAvg * LEAD_TIME_DAYS * SAFETY_STOCK_FACTOR);
  const suggestQty = Math.max(p.minStock * 2 - availableQty(p.batches), Math.ceil(dailyAvg * LEAD_TIME_DAYS * 1.5));
  return { dailyAvg, rop, suggestQty: Math.max(0, suggestQty) };
}

const fmtRp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

export function Defekta() {
  const tenantId = useAuth((s) => s.claims?.tenantId) ?? "";
  const products = useDemoStore((s) => s.products.filter((p) => p.tenantId === tenantId));
  const suppliers = useDemoStore((s) => s.suppliers.filter((s) => s.tenantId === tenantId && s.active));
  const defektas = useDemoStore((s) => s.defektas.filter((d) => d.tenantId === tenantId));
  const addDefekta = useDemoStore((s) => s.addDefekta);
  const updateDefektaStatus = useDemoStore((s) => s.updateDefektaStatus);

  const candidates = useMemo(() => {
    return products.map((p) => {
      const stock = availableQty(p.batches);
      const meta = computeROP(p);
      return { product: p, currentStock: stock, ...meta, needsReorder: stock <= meta.rop };
    }).sort((a, b) => (a.currentStock - a.rop) - (b.currentStock - b.rop));
  }, [products]);

  const needReorder = candidates.filter((c) => c.needsReorder);

  const [tab, setTab] = useState<"suggest" | "list">("suggest");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const togglePick = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = needReorder.length > 0 && needReorder.every((c) => picked.has(c.product.id));
  const toggleAll = () => setPicked(allSelected ? new Set() : new Set(needReorder.map((c) => c.product.id)));

  const submit = () => {
    if (picked.size === 0) return;
    const items: DemoDefektaItem[] = candidates.filter((c) => picked.has(c.product.id)).map((c) => ({
      productId: c.product.id, productName: c.product.name, unit: c.product.unit,
      currentStock: c.currentStock, rop: c.rop, suggestQty: c.suggestQty,
    }));
    addDefekta({ tenantId, dateISO: new Date().toISOString().slice(0, 10), items, status: "OPEN" });
    setPicked(new Set());
    setTab("list");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">📓 Buku Defekta &amp; ROP</h1>
        <p className="text-ink-500 text-sm mt-0.5">Daftar item yang stok-nya di bawah Reorder Point — siap dijadikan PO ke supplier.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="card !p-4 bg-gradient-to-br from-warn-500 to-warn-600 text-white">
          <div className="text-xs opacity-80">Perlu Reorder</div>
          <div className="text-2xl font-bold mt-1">{needReorder.length}</div>
          <div className="text-xs opacity-80 mt-1">item di bawah ROP</div>
        </div>
        <div className="card !p-4">
          <div className="text-xs text-ink-500">Defekta Tercatat</div>
          <div className="text-2xl font-bold mt-1">{defektas.length}</div>
        </div>
        <div className="card !p-4">
          <div className="text-xs text-ink-500">Lead Time Asumsi</div>
          <div className="text-2xl font-bold mt-1">{LEAD_TIME_DAYS} <span className="text-base font-normal text-ink-500">hari</span></div>
          <div className="text-xs text-ink-500 mt-1">Safety stock {Math.round((SAFETY_STOCK_FACTOR - 1) * 100)}%</div>
        </div>
      </div>

      <div className="flex gap-1 bg-surface-100 rounded-lg p-1 w-fit">
        {[
          { k: "suggest", l: `🎯 Saran Reorder (${needReorder.length})` },
          { k: "list", l: `📚 Riwayat Defekta (${defektas.length})` },
        ].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-3 py-1.5 text-sm rounded-md ${tab === t.k ? "bg-white text-brand-700 font-semibold shadow-sm" : "text-ink-500"}`}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === "suggest" && (
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">🎯 Saran Reorder Otomatis</h2>
            {needReorder.length > 0 && (
              <button onClick={submit} disabled={picked.size === 0} className="btn-primary text-xs disabled:opacity-50">
                📓 Catat ke Defekta ({picked.size})
              </button>
            )}
          </div>
          {needReorder.length === 0 && <div className="text-center py-10 text-ink-500"><div className="text-5xl mb-2">✅</div>Semua produk masih di atas Reorder Point.</div>}
          {needReorder.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-xs text-ink-500">
                <tr>
                  <th className="p-2 text-left"><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                  <th className="p-2 text-left">Produk</th>
                  <th className="p-2 text-right">Stok</th>
                  <th className="p-2 text-right">ROP</th>
                  <th className="p-2 text-right">Saran Qty</th>
                  <th className="p-2 text-right">Avg/hari</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {needReorder.map((c) => (
                  <tr key={c.product.id} className={picked.has(c.product.id) ? "bg-brand-50" : ""}>
                    <td className="p-2"><input type="checkbox" checked={picked.has(c.product.id)} onChange={() => togglePick(c.product.id)} /></td>
                    <td className="p-2"><div className="font-medium text-sm">{c.product.name}</div><div className="text-[10px] text-ink-400">{c.product.category}</div></td>
                    <td className="p-2 text-right"><span className="text-danger-600 font-bold">{c.currentStock}</span></td>
                    <td className="p-2 text-right text-ink-600">{c.rop}</td>
                    <td className="p-2 text-right"><span className="badge bg-emerald-100 text-emerald-700 text-xs">+{c.suggestQty}</span></td>
                    <td className="p-2 text-right text-xs text-ink-500">~{c.dailyAvg.toFixed(1)} {c.product.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-3 text-[11px] text-ink-400">
            💡 ROP = avg harian × lead time × safety factor. Saran qty mempertimbangkan target restock 2× minStock atau {Math.round(LEAD_TIME_DAYS * 1.5)} hari konsumsi.
          </div>
        </div>
      )}

      {tab === "list" && (
        <div className="card">
          {defektas.length === 0 && <div className="text-center py-10 text-ink-500">Belum ada defekta dibuat.</div>}
          {defektas.length > 0 && (
            <div className="space-y-3">
              {defektas.slice().sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO)).map((d) => (
                <div key={d.id} className="border border-surface-100 rounded-xl p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-mono text-sm font-semibold">{d.noDefekta}</div>
                      <div className="text-xs text-ink-500">{d.dateISO} · {d.items.length} item</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`badge text-[10px] ${d.status === "OPEN" ? "bg-warn-100 text-warn-700" : d.status === "ORDERED" ? "bg-brand-100 text-brand-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {d.status === "OPEN" ? "Open" : d.status === "ORDERED" ? "Sudah PO" : "Selesai"}
                      </span>
                      {d.status === "OPEN" && <button onClick={() => updateDefektaStatus(d.id, "ORDERED")} className="text-xs text-brand-600 hover:underline">→ Tandai PO</button>}
                      {d.status === "ORDERED" && <button onClick={() => updateDefektaStatus(d.id, "CLOSED")} className="text-xs text-emerald-600 hover:underline">→ Selesai</button>}
                    </div>
                  </div>
                  <ul className="mt-2 text-xs text-ink-600 space-y-1">
                    {d.items.slice(0, 5).map((it) => (
                      <li key={it.productId}>{it.productName} <span className="text-ink-400">stok {it.currentStock}/{it.rop} → +{it.suggestQty} {it.unit}</span></li>
                    ))}
                    {d.items.length > 5 && <li className="text-ink-400">+ {d.items.length - 5} item lain…</li>}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
