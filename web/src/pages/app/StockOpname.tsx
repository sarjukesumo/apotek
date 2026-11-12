// Stock Opname (cycle / annual / spot).
// Workflow:
// 1. Generate worksheet → tabel batch dengan systemQty.
// 2. Input physicalQty → variance dihitung otomatis + alasan (rusak/hilang/admin/found).
// 3. Posting: physicalQty di-commit ke batches; BA Selisih dicetak (placeholder demo).

import { useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import { useDemoStore, type DemoStockOpname, type DemoStockOpnameItem } from "../../lib/demoStore";

const fmtRp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const today = () => new Date().toISOString().slice(0, 10);

export function StockOpname() {
  const tenantId = useAuth((s) => s.claims?.tenantId) ?? "";
  const products = useDemoStore((s) => s.products.filter((p) => p.tenantId === tenantId));
  const opnames = useDemoStore((s) => s.opnames.filter((o) => o.tenantId === tenantId));
  const addOpname = useDemoStore((s) => s.addOpname);
  const postOpname = useDemoStore((s) => s.postOpname);

  const [tab, setTab] = useState<"new" | "list">("list");
  const [view, setView] = useState<DemoStockOpname | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">📊 Stock Opname</h1>
        <p className="text-ink-500 text-sm mt-0.5">Cocokkan stok fisik vs sistem. BA Selisih otomatis untuk koreksi resmi.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="card !p-4"><div className="text-xs text-ink-500">Total Opname</div><div className="text-2xl font-bold mt-1">{opnames.length}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Selisih Akumulatif (Posted)</div><div className="text-xl font-bold mt-1 text-danger-600">{fmtRp(opnames.filter((o) => o.status === "POSTED").reduce((s, o) => s + Math.abs(o.totalVarianceValueRp), 0))}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Draft Pending</div><div className="text-2xl font-bold mt-1 text-warn-600">{opnames.filter((o) => o.status === "DRAFT").length}</div></div>
      </div>

      <div className="flex gap-1 bg-surface-100 rounded-lg p-1 w-fit">
        {[{ k: "list", l: `📚 Riwayat (${opnames.length})` }, { k: "new", l: "➕ Opname Baru" }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-3 py-1.5 text-sm rounded-md ${tab === t.k ? "bg-white text-brand-700 font-semibold shadow-sm" : "text-ink-500"}`}>{t.l}</button>
        ))}
      </div>

      {tab === "new" && <NewOpname tenantId={tenantId} products={products} onSubmit={(o: any) => { const created = addOpname(o); setView(created); setTab("list"); }} />}

      {tab === "list" && (
        <div className="card">
          {opnames.length === 0 && <div className="text-center py-10 text-ink-500"><div className="text-5xl mb-2">📊</div>Belum ada opname.</div>}
          {opnames.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-left text-xs text-ink-500"><tr><th className="p-2">No SO</th><th className="p-2">Tanggal</th><th className="p-2">Tipe</th><th className="p-2">Scope</th><th className="p-2 text-right">Item</th><th className="p-2 text-right">Selisih Nilai</th><th className="p-2">Status</th><th></th></tr></thead>
              <tbody className="divide-y divide-surface-100">
                {opnames.slice().sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO)).map((o) => (
                  <tr key={o.id}>
                    <td className="p-2 font-mono text-xs">{o.noSO}</td>
                    <td className="p-2">{o.dateISO}</td>
                    <td className="p-2"><span className="badge text-[10px] bg-brand-100 text-brand-700">{o.type}</span></td>
                    <td className="p-2 text-xs">{o.scope}</td>
                    <td className="p-2 text-right">{o.items.length}</td>
                    <td className={`p-2 text-right font-semibold ${o.totalVarianceValueRp < 0 ? "text-danger-600" : o.totalVarianceValueRp > 0 ? "text-emerald-600" : "text-ink-500"}`}>{o.totalVarianceValueRp >= 0 ? "+" : ""}{fmtRp(o.totalVarianceValueRp)}</td>
                    <td className="p-2"><span className={`badge text-[10px] ${o.status === "POSTED" ? "bg-emerald-100 text-emerald-700" : "bg-warn-100 text-warn-700"}`}>{o.status === "POSTED" ? "Posted" : "Draft"}</span></td>
                    <td className="p-2 text-right"><button onClick={() => setView(o)} className="text-xs text-brand-600 hover:underline">→ Lihat</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {view && <OpnameDetail op={view} onClose={() => setView(null)} onPost={(name) => { postOpname(view.id, name); setView(null); }} />}
    </div>
  );
}

function NewOpname({ tenantId, products, onSubmit }: any) {
  const [type, setType] = useState<"CYCLE" | "ANNUAL" | "SPOT">("CYCLE");
  const [scope, setScope] = useState("Semua produk");
  const [dateISO, setDateISO] = useState(today());
  const [items, setItems] = useState<DemoStockOpnameItem[]>(() =>
    products.flatMap((p: any) =>
      p.batches.map((b: any) => ({
        productId: p.id, productName: p.name, batchNo: b.batchNo,
        expiryISO: b.expiryISO, unit: p.unit,
        systemQty: b.qty, physicalQty: b.qty, variance: 0,
        valueRp: 0,
      }))
    )
  );

  const updateItem = (i: number, physical: number, reason?: any) => setItems((arr) => arr.map((it, j) => {
    if (i !== j) return it;
    const variance = physical - it.systemQty;
    const product = products.find((p: any) => p.id === it.productId);
    const valueRp = variance * (product?.price ?? 0);
    return { ...it, physicalQty: physical, variance, valueRp, reason: reason ?? it.reason };
  }));

  const totalVar = items.reduce((s, it) => s + it.valueRp, 0);
  const variances = items.filter((it) => it.variance !== 0).length;

  const submit = (status: "DRAFT" | "POSTED") => {
    onSubmit({ tenantId, type, dateISO, scope, items, totalVarianceValueRp: totalVar, status });
  };

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold">➕ Stock Opname Baru</h2>
      <div className="grid md:grid-cols-3 gap-3">
        <div><label className="text-xs text-ink-500">Tipe</label><select className="input" value={type} onChange={(e) => setType(e.target.value as any)}><option value="CYCLE">Cycle (Berkala)</option><option value="ANNUAL">Annual (Tahunan)</option><option value="SPOT">Spot Check</option></select></div>
        <div><label className="text-xs text-ink-500">Tanggal</label><input type="date" className="input" value={dateISO} onChange={(e) => setDateISO(e.target.value)} /></div>
        <div><label className="text-xs text-ink-500">Scope</label><input className="input" value={scope} onChange={(e) => setScope(e.target.value)} /></div>
      </div>

      <div className="rounded-xl border border-surface-100 max-h-[500px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-50 text-xs text-ink-500 sticky top-0">
            <tr><th className="p-2 text-left">Produk / Batch</th><th className="p-2 text-right">Sistem</th><th className="p-2 text-right">Fisik</th><th className="p-2 text-right">Selisih</th><th className="p-2 text-right">Nilai</th><th className="p-2">Alasan</th></tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {items.map((it, i) => (
              <tr key={i} className={it.variance !== 0 ? "bg-warn-50" : ""}>
                <td className="p-2"><div className="text-xs">{it.productName}</div><div className="text-[10px] font-mono text-ink-400">{it.batchNo} · ED {it.expiryISO}</div></td>
                <td className="p-2 text-right">{it.systemQty}</td>
                <td className="p-2"><input type="number" min={0} className="input !w-20 text-right text-sm" value={it.physicalQty} onChange={(e) => updateItem(i, +e.target.value || 0)} /></td>
                <td className={`p-2 text-right font-semibold ${it.variance < 0 ? "text-danger-600" : it.variance > 0 ? "text-emerald-600" : "text-ink-400"}`}>{it.variance > 0 ? "+" : ""}{it.variance}</td>
                <td className={`p-2 text-right text-xs ${it.valueRp < 0 ? "text-danger-600" : it.valueRp > 0 ? "text-emerald-600" : "text-ink-400"}`}>{it.valueRp ? fmtRp(it.valueRp) : "—"}</td>
                <td className="p-2">
                  {it.variance !== 0 && (
                    <select className="input !w-32 text-xs" value={it.reason ?? ""} onChange={(e) => updateItem(i, it.physicalQty, e.target.value)}>
                      <option value="">— alasan —</option>
                      <option value="DAMAGED">Rusak</option>
                      <option value="LOST">Hilang</option>
                      <option value="ADMIN">Salah catat</option>
                      <option value="FOUND">Ditemukan</option>
                      <option value="OTHER">Lainnya</option>
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-brand-50 font-bold sticky bottom-0">
            <tr><td colSpan={3} className="p-2 text-right">Selisih: {variances} batch</td><td colSpan={2} className={`p-2 text-right ${totalVar < 0 ? "text-danger-700" : totalVar > 0 ? "text-emerald-700" : ""}`}>{totalVar >= 0 ? "+" : ""}{fmtRp(totalVar)}</td><td></td></tr>
          </tfoot>
        </table>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={() => submit("DRAFT")} className="btn-secondary text-sm">💾 Simpan Draft</button>
        <button onClick={() => submit("POSTED")} disabled={items.some((it) => it.variance !== 0 && !it.reason)} className="btn-primary text-sm disabled:opacity-50">✅ Posting (commit ke stok)</button>
      </div>
    </div>
  );
}

function OpnameDetail({ op, onClose, onPost }: { op: DemoStockOpname; onClose: () => void; onPost: (approver: string) => void }) {
  const [approver, setApprover] = useState("");
  const variances = op.items.filter((it) => it.variance !== 0);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-surface-100 flex justify-between">
          <div><h2 className="font-bold">📊 {op.noSO}</h2><div className="text-xs text-ink-500 mt-0.5">{op.dateISO} · {op.type} · {op.scope}</div></div>
          <button onClick={onClose} className="text-2xl">×</button>
        </div>
        <div className="overflow-y-auto p-5 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="card !p-3"><div className="text-[10px] text-ink-500">Item Diperiksa</div><div className="font-bold">{op.items.length}</div></div>
            <div className="card !p-3"><div className="text-[10px] text-ink-500">Selisih</div><div className="font-bold text-warn-600">{variances.length}</div></div>
            <div className="card !p-3"><div className="text-[10px] text-ink-500">Nilai Selisih</div><div className={`font-bold ${op.totalVarianceValueRp < 0 ? "text-danger-600" : "text-emerald-600"}`}>{op.totalVarianceValueRp >= 0 ? "+" : ""}{fmtRp(op.totalVarianceValueRp)}</div></div>
          </div>
          {variances.length > 0 && (
            <table className="w-full text-sm border border-surface-100 rounded-lg overflow-hidden">
              <thead className="bg-surface-50 text-xs text-ink-500"><tr><th className="p-2 text-left">Produk</th><th className="p-2 text-right">Sistem</th><th className="p-2 text-right">Fisik</th><th className="p-2 text-right">Selisih</th><th className="p-2 text-left">Alasan</th></tr></thead>
              <tbody className="divide-y divide-surface-100">
                {variances.map((it, i) => (
                  <tr key={i}>
                    <td className="p-2 text-xs">{it.productName} <span className="text-ink-400 font-mono">{it.batchNo}</span></td>
                    <td className="p-2 text-right">{it.systemQty}</td><td className="p-2 text-right">{it.physicalQty}</td>
                    <td className={`p-2 text-right font-semibold ${it.variance < 0 ? "text-danger-600" : "text-emerald-600"}`}>{it.variance > 0 ? "+" : ""}{it.variance}</td>
                    <td className="p-2 text-xs">{it.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {op.status === "DRAFT" && (
            <div className="border-t pt-3">
              <label className="text-xs text-ink-500">Nama approver (apoteker/owner)</label>
              <input className="input" value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="Apt. Siti Aminah" />
            </div>
          )}
          {op.status === "POSTED" && <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-xs text-emerald-700">✅ Sudah diposting oleh: <b>{op.approvedByName}</b></div>}
        </div>
        <div className="border-t px-5 py-3 flex justify-end gap-2 bg-surface-50">
          <button onClick={onClose} className="btn-secondary text-sm">Tutup</button>
          {op.status === "DRAFT" && <button onClick={() => onPost(approver)} disabled={!approver} className="btn-primary text-sm disabled:opacity-50">✅ Approve & Posting</button>}
        </div>
      </div>
    </div>
  );
}
