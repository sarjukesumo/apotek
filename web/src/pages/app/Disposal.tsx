// Pemusnahan Obat (BAP — Berita Acara Pemusnahan)
// Workflow: pilih batch expired/rusak → isi metode + saksi → preview & cetak BAP → simpan ke disposals.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { useDemoStore, type DemoDisposal } from "../../lib/demoStore";
import {
  batchZone, batchZoneMeta, expiredQty, valueInZones, formatDaysToExpiry,
} from "../../lib/fefo";

type Reason = "EXPIRED" | "DAMAGED" | "RECALL" | "OTHER";

interface SelectedItem {
  productId: string;
  productName: string;
  batchId: string;
  batchNo: string;
  qty: number;            // qty to dispose (default = full batch qty)
  unit: string;
  expiryISO: string;
  price: number;
}

function fmtRp(n: number) { return `Rp ${n.toLocaleString("id-ID")}`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }

export function DisposalPage() {
  const tenantId = useAuth((s) => s.claims?.tenantId) ?? "";
  const tenant = useDemoStore((s) => s.tenants.find((t) => t.id === tenantId));
  const products = useDemoStore((s) => s.products.filter((p) => p.tenantId === tenantId));
  const users = useDemoStore((s) => s.users.filter((u) => u.tenantId === tenantId && u.active));
  const disposals = useDemoStore((s) => s.disposals.filter((d) => d.tenantId === tenantId));
  const addDisposal = useDemoStore((s) => s.addDisposal);

  const [selected, setSelected] = useState<Record<string, SelectedItem>>({});
  const [reason, setReason] = useState<Reason>("EXPIRED");
  const [method, setMethod] = useState("Insinerasi pihak ke-3 (PT Wastec)");
  const [witness1, setWitness1] = useState("");
  const [witness2, setWitness2] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(todayISO());
  const [showPreview, setShowPreview] = useState<DemoDisposal | null>(null);
  const [filter, setFilter] = useState<"expired" | "critical" | "all">("expired");

  // Flatten all batches with risk metadata
  const candidates = useMemo(() => {
    const list: (SelectedItem & { zone: ReturnType<typeof batchZone> })[] = [];
    for (const p of products) {
      for (const b of p.batches) {
        const zone = batchZone(b.expiryISO);
        if (filter === "expired" && zone !== "EXPIRED") continue;
        if (filter === "critical" && zone !== "CRITICAL" && zone !== "EXPIRED") continue;
        list.push({
          productId: p.id, productName: p.name,
          batchId: b.id, batchNo: b.batchNo,
          qty: b.qty, unit: p.unit, expiryISO: b.expiryISO, price: p.price,
          zone,
        });
      }
    }
    return list.sort((a, b) => a.expiryISO.localeCompare(b.expiryISO));
  }, [products, filter]);

  const summary = useMemo(() => {
    const expiredUnits = products.reduce((s, p) => s + expiredQty(p.batches), 0);
    const expiredValue = products.reduce((s, p) => s + valueInZones(p, ["EXPIRED"]), 0);
    return { expiredUnits, expiredValue };
  }, [products]);

  const selectedList = Object.values(selected);
  const selectedTotal = selectedList.reduce((s, it) => s + it.qty * it.price, 0);

  function toggle(item: SelectedItem) {
    setSelected((cur) => {
      const next = { ...cur };
      if (next[item.batchId]) delete next[item.batchId];
      else next[item.batchId] = item;
      return next;
    });
  }

  function selectAllExpired() {
    const next: Record<string, SelectedItem> = {};
    for (const c of candidates) if (c.zone === "EXPIRED") next[c.batchId] = c;
    setSelected(next);
  }

  function updateQty(batchId: string, qty: number) {
    setSelected((cur) => {
      const it = cur[batchId];
      if (!it) return cur;
      return { ...cur, [batchId]: { ...it, qty: Math.max(0, qty) } };
    });
  }

  function handleSubmit() {
    if (selectedList.length === 0) {
      alert("Pilih minimal 1 batch untuk dimusnahkan.");
      return;
    }
    if (!witness1.trim() || !witness2.trim()) {
      alert("Isi 2 saksi (apoteker + 1 staff lain).");
      return;
    }
    if (!confirm(`Konfirmasi pemusnahan ${selectedList.length} batch senilai ${fmtRp(selectedTotal)}?\nTindakan ini akan menghapus batch dari inventory & generate BAP.`)) return;

    const created = addDisposal({
      tenantId,
      dateISO: date,
      reason,
      method,
      witnesses: [witness1, witness2].filter(Boolean),
      notes: notes.trim() || undefined,
      items: selectedList.map((it) => ({
        productId: it.productId,
        productName: it.productName,
        batchNo: it.batchNo,
        qty: it.qty,
        unit: it.unit,
        expiryISO: it.expiryISO,
        valueRp: it.qty * it.price,
      })),
      totalValueRp: selectedTotal,
    });
    setShowPreview(created);
    setSelected({});
    setWitness1(""); setWitness2(""); setNotes("");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">🗑 Pemusnahan Obat (BAP)</h1>
          <p className="text-ink-500 text-sm mt-1">
            {tenant?.name} · Berita Acara Pemusnahan untuk batch expired / rusak / recall — sesuai PMK 73/2016 & PerBPOM.
          </p>
        </div>
        <Link to=".." className="btn-secondary text-sm">← Dashboard</Link>
      </div>

      {/* Summary strip */}
      <div className="grid md:grid-cols-3 gap-3">
        <div className="card !p-4 bg-danger-50/50 border-danger-200">
          <div className="text-xs text-danger-700 font-semibold">⚫ Expired Saat Ini</div>
          <div className="text-2xl font-bold text-danger-700 mt-1">{summary.expiredUnits} unit</div>
          <div className="text-xs text-ink-500 mt-1">Senilai {fmtRp(summary.expiredValue)}</div>
        </div>
        <div className="card !p-4">
          <div className="text-xs text-ink-500">Riwayat BAP</div>
          <div className="text-2xl font-bold mt-1">{disposals.length}</div>
          <div className="text-xs text-ink-500 mt-1">Total {fmtRp(disposals.reduce((s, d) => s + d.totalValueRp, 0))}</div>
        </div>
        <div className="card !p-4 bg-brand-50/50 border-brand-200">
          <div className="text-xs text-brand-700 font-semibold">📋 BAP Baru</div>
          <div className="text-2xl font-bold text-brand-700 mt-1">{selectedList.length}</div>
          <div className="text-xs text-ink-500 mt-1">{fmtRp(selectedTotal)} dipilih</div>
        </div>
      </div>

      {/* Step 1: Pilih batch */}
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold">1. Pilih Batch yang Dimusnahkan</h2>
          <div className="flex gap-2 items-center">
            <div className="flex gap-1 bg-surface-100 rounded-lg p-1">
              {[
                { k: "expired", l: "⚫ Expired" },
                { k: "critical", l: "🔴 + Critical" },
                { k: "all", l: "Semua" },
              ].map((f) => (
                <button key={f.k} onClick={() => setFilter(f.k as any)}
                  className={`px-3 py-1 text-xs rounded-md ${filter === f.k ? "bg-white text-brand-700 font-semibold shadow-sm" : "text-ink-500"}`}>
                  {f.l}
                </button>
              ))}
            </div>
            <button onClick={selectAllExpired} className="btn-secondary text-xs">✓ Pilih Semua Expired</button>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-surface-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-500 bg-surface-50 border-b border-surface-100">
              <tr>
                <th className="p-2 w-10"></th>
                <th className="p-2">Produk</th>
                <th className="p-2">Batch</th>
                <th className="p-2">Expiry</th>
                <th className="p-2 text-right">Stok</th>
                <th className="p-2 text-right">Qty Musnah</th>
                <th className="p-2 text-right">Nilai</th>
              </tr>
            </thead>
            <tbody>
              {candidates.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-ink-500">
                  <div className="text-3xl">✅</div>
                  <div className="mt-2">Tidak ada batch dalam zona ini.</div>
                </td></tr>
              )}
              {candidates.map((c) => {
                const sel = selected[c.batchId];
                const zm = batchZoneMeta(c.expiryISO);
                return (
                  <tr key={c.batchId} className={`border-t border-surface-100 ${sel ? "bg-brand-50/40" : "hover:bg-surface-50/50"}`}>
                    <td className="p-2 text-center">
                      <input type="checkbox" checked={!!sel} onChange={() => toggle(c)}
                        className="w-4 h-4 accent-brand-500" />
                    </td>
                    <td className="p-2">
                      <div className="font-medium text-sm">{c.productName}</div>
                      <div className="text-[10px] text-ink-500">{fmtRp(c.price)} / {c.unit}</div>
                    </td>
                    <td className="p-2 font-mono text-xs">{c.batchNo}</td>
                    <td className="p-2">
                      <span className={`badge text-[10px] ${zm.cls}`}>{c.expiryISO}</span>
                      <div className="text-[10px] text-ink-500 mt-0.5">{formatDaysToExpiry(c.expiryISO)}</div>
                    </td>
                    <td className="p-2 text-right font-semibold">{c.qty} {c.unit}</td>
                    <td className="p-2 text-right">
                      {sel ? (
                        <input type="number" min={0} max={c.qty} value={sel.qty}
                          onChange={(e) => updateQty(c.batchId, parseInt(e.target.value) || 0)}
                          className="w-20 h-8 text-right border border-surface-200 rounded text-sm" />
                      ) : <span className="text-ink-400">—</span>}
                    </td>
                    <td className="p-2 text-right text-xs">
                      {sel ? <span className="font-semibold text-danger-600">{fmtRp(sel.qty * c.price)}</span> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Step 2: Detail BAP */}
      {selectedList.length > 0 && (
        <div className="card">
          <h2 className="font-semibold">2. Detail Pemusnahan</h2>
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            <div>
              <label className="label">Tanggal Pemusnahan</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Alasan</label>
              <select className="input" value={reason} onChange={(e) => setReason(e.target.value as Reason)}>
                <option value="EXPIRED">Expired (kadaluarsa)</option>
                <option value="DAMAGED">Rusak / kemasan terbuka</option>
                <option value="RECALL">Recall produsen / BPOM</option>
                <option value="OTHER">Lainnya</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Metode Pemusnahan</label>
              <input className="input" value={method} onChange={(e) => setMethod(e.target.value)}
                placeholder="Mis. Insinerasi pihak ke-3 (PT Wastec), Hancurkan + buang sesuai prosedur, dll." />
            </div>
            <div>
              <label className="label">Saksi 1 (Apoteker)</label>
              <select className="input" value={witness1} onChange={(e) => setWitness1(e.target.value)}>
                <option value="">— Pilih —</option>
                {users.filter((u) => u.role === "APOTEKER" || u.role === "OWNER").map((u) => (
                  <option key={u.id} value={`${u.name}${u.sipa ? ` (SIPA: ${u.sipa})` : ""}`}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Saksi 2 (Staff lain)</label>
              <select className="input" value={witness2} onChange={(e) => setWitness2(e.target.value)}>
                <option value="">— Pilih —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.name}>{u.name} ({u.role})</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Catatan tambahan (opsional)</label>
              <textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Mis. Disaksikan oleh perwakilan Dinkes setempat…" />
            </div>
          </div>

          <div className="flex gap-2 mt-4 pt-4 border-t border-surface-100">
            <button onClick={handleSubmit} className="btn-primary flex-1">
              📝 Buat BAP & Hapus dari Inventory
            </button>
            <button onClick={() => setSelected({})} className="btn-secondary">Batal</button>
          </div>
        </div>
      )}

      {/* Riwayat */}
      {disposals.length > 0 && (
        <div className="card">
          <h2 className="font-semibold">📚 Riwayat BAP</h2>
          <div className="mt-3 rounded-xl border border-surface-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-500 bg-surface-50 border-b border-surface-100">
                <tr>
                  <th className="p-2">No. BAP</th>
                  <th className="p-2">Tanggal</th>
                  <th className="p-2">Alasan</th>
                  <th className="p-2 text-right">Item</th>
                  <th className="p-2 text-right">Nilai</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {[...disposals].reverse().map((d) => (
                  <tr key={d.id} className="border-t border-surface-100 hover:bg-surface-50/50">
                    <td className="p-2 font-mono text-xs">{d.bapNo}</td>
                    <td className="p-2">{d.dateISO}</td>
                    <td className="p-2"><span className="badge text-[10px] bg-surface-100">{d.reason}</span></td>
                    <td className="p-2 text-right">{d.items.length} batch</td>
                    <td className="p-2 text-right font-semibold text-danger-600">{fmtRp(d.totalValueRp)}</td>
                    <td className="p-2 text-right">
                      <button onClick={() => setShowPreview(d)} className="text-xs text-brand-600 hover:underline">Lihat / Cetak →</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showPreview && tenant && (
        <BAPPreview disposal={showPreview} tenant={tenant} onClose={() => setShowPreview(null)} />
      )}
    </div>
  );
}

// ===== BAP Preview & Print Modal =====
function BAPPreview({ disposal, tenant, onClose }: { disposal: DemoDisposal; tenant: any; onClose: () => void }) {
  function handlePrint() {
    const node = document.getElementById("bap-print-area");
    if (!node) return;
    const w = window.open("", "_blank", "width=900,height=1200");
    if (!w) return;
    w.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${disposal.bapNo}</title>
<style>
  body { font-family: 'Times New Roman', serif; padding: 32px; color: #000; line-height: 1.5; }
  h1 { text-align: center; font-size: 18px; margin: 0; text-decoration: underline; }
  h2 { text-align: center; font-size: 14px; margin: 4px 0 16px; font-weight: normal; }
  .meta { margin: 16px 0; }
  .meta div { display: flex; gap: 8px; }
  .meta .lbl { width: 160px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; }
  th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; }
  th { background: #f0f0f0; }
  .right { text-align: right; }
  .center { text-align: center; }
  .sig { display: flex; justify-content: space-around; margin-top: 56px; gap: 32px; }
  .sig div { text-align: center; min-width: 180px; }
  .sig .name { margin-top: 70px; border-top: 1px solid #000; padding-top: 4px; font-weight: bold; }
  @media print { @page { size: A4; margin: 1.5cm; } }
</style></head><body>${node.innerHTML}<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300);}<\/script></body></html>`);
    w.document.close();
  }

  const reasonLabel = ({ EXPIRED: "Kadaluarsa (Expired)", DAMAGED: "Rusak / Kemasan terbuka", RECALL: "Recall produsen / BPOM", OTHER: "Lainnya" } as const)[disposal.reason];

  return (
    <div className="fixed inset-0 z-[60] bg-ink-900/60 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[95vh] overflow-y-auto my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-surface-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="font-bold">📄 {disposal.bapNo}</div>
            <div className="text-xs text-ink-500">{disposal.dateISO} · {disposal.items.length} batch · {fmtRp(disposal.totalValueRp)}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="btn-primary text-sm">🖨 Cetak / PDF</button>
            <button onClick={onClose} className="btn-secondary text-sm">Tutup</button>
          </div>
        </div>

        <div id="bap-print-area" className="p-8 bg-white text-ink-900 text-sm leading-relaxed">
          <h1>BERITA ACARA PEMUSNAHAN OBAT</h1>
          <h2>Nomor: {disposal.bapNo}</h2>

          <p className="mt-4">
            Pada hari ini, <b>{new Date(disposal.dateISO).toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</b>,
            telah dilakukan pemusnahan sediaan farmasi di:
          </p>

          <div className="meta mt-3 ml-4">
            <div><span className="lbl">Nama Apotek</span>: <b>{tenant.name}</b></div>
            <div><span className="lbl">Alamat</span>: {tenant.address}</div>
            {tenant.sia && <div><span className="lbl">SIA</span>: {tenant.sia}</div>}
            {tenant.npwp && <div><span className="lbl">NPWP</span>: {tenant.npwp}</div>}
            <div><span className="lbl">Alasan Pemusnahan</span>: <b>{reasonLabel}</b></div>
            <div><span className="lbl">Metode</span>: {disposal.method}</div>
          </div>

          <p className="mt-4">Dengan rincian sebagai berikut:</p>

          <table>
            <thead>
              <tr>
                <th className="center" style={{ width: 32 }}>No</th>
                <th>Nama Obat</th>
                <th>No. Batch</th>
                <th>Expiry</th>
                <th className="right">Qty</th>
                <th className="right">Nilai (Rp)</th>
              </tr>
            </thead>
            <tbody>
              {disposal.items.map((it, i) => (
                <tr key={i}>
                  <td className="center">{i + 1}</td>
                  <td>{it.productName}</td>
                  <td style={{ fontFamily: "monospace" }}>{it.batchNo}</td>
                  <td>{it.expiryISO}</td>
                  <td className="right">{it.qty} {it.unit}</td>
                  <td className="right">{it.valueRp.toLocaleString("id-ID")}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={5} className="right" style={{ fontWeight: "bold" }}>TOTAL</td>
                <td className="right" style={{ fontWeight: "bold" }}>Rp {disposal.totalValueRp.toLocaleString("id-ID")}</td>
              </tr>
            </tbody>
          </table>

          {disposal.notes && (
            <p><b>Catatan:</b> {disposal.notes}</p>
          )}

          <p className="mt-4">
            Demikian Berita Acara ini dibuat dengan sebenar-benarnya untuk dipergunakan sebagaimana mestinya.
          </p>

          <div className="sig">
            {disposal.witnesses.map((w, i) => (
              <div key={i}>
                <div>Saksi {i + 1}</div>
                <div className="name">{w}</div>
              </div>
            ))}
          </div>

          <div className="text-center text-[10px] text-ink-400 mt-12">
            Dokumen digital dari Batam Farma · {disposal.bapNo} · dibuat {disposal.createdAtISO}
          </div>
        </div>
      </div>
    </div>
  );
}
