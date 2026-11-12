// Promo & Pricing Engine — CRUD promo (PERCENT_OFF / AMOUNT_OFF / BUY_X_GET_Y / BUNDLE / ED_NEAR_AUTO).
// Promo ED_NEAR_AUTO bersinergi dengan FEFO: kasir auto-discount untuk batch zona kuning/merah.

import { useState } from "react";
import { useAuth } from "../../lib/auth";
import { useDemoStore, type DemoPromo, type DemoPromoType } from "../../lib/demoStore";

const TYPE_META: Record<DemoPromoType, { label: string; cls: string; emoji: string }> = {
  PERCENT_OFF: { label: "% Diskon", cls: "bg-brand-100 text-brand-700", emoji: "🏷" },
  AMOUNT_OFF: { label: "Potongan Rp", cls: "bg-emerald-100 text-emerald-700", emoji: "💵" },
  BUY_X_GET_Y: { label: "Beli X Dapat Y", cls: "bg-yellow-100 text-yellow-700", emoji: "🎁" },
  BUNDLE: { label: "Bundling", cls: "bg-violet-100 text-violet-700", emoji: "📦" },
  ED_NEAR_AUTO: { label: "Auto-Diskon ED", cls: "bg-orange-100 text-orange-700", emoji: "⏰" },
};

export function Promos() {
  const tenantId = useAuth((s) => s.claims?.tenantId) ?? "";
  const promos = useDemoStore((s) => s.promos.filter((p) => p.tenantId === tenantId));
  const products = useDemoStore((s) => s.products.filter((p) => p.tenantId === tenantId));
  const upsertPromo = useDemoStore((s) => s.upsertPromo);
  const removePromo = useDemoStore((s) => s.removePromo);
  const [edit, setEdit] = useState<Partial<DemoPromo> | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const active = promos.filter((p) => p.active && p.startISO <= today && p.endISO >= today);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">🏷 Promo &amp; Pricing</h1>
        <p className="text-ink-500 text-sm mt-0.5">Promo manual + auto-diskon ED untuk batch mendekati expired (sinergi dengan FEFO).</p>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="card !p-4 bg-gradient-to-br from-brand-500 to-brand-600 text-white"><div className="text-xs opacity-80">Promo Aktif</div><div className="text-2xl font-bold mt-1">{active.length}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Total Promo</div><div className="text-2xl font-bold mt-1">{promos.length}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Auto-Diskon ED</div><div className="text-2xl font-bold mt-1 text-orange-600">{promos.filter((p) => p.type === "ED_NEAR_AUTO").length}</div></div>
      </div>

      <div className="flex justify-end"><button onClick={() => setEdit({ tenantId, type: "PERCENT_OFF", active: true, startISO: today, endISO: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10) })} className="btn-primary text-xs">➕ Promo Baru</button></div>

      <div className="grid md:grid-cols-2 gap-3">
        {promos.map((p) => {
          const meta = TYPE_META[p.type];
          const isActive = p.active && p.startISO <= today && p.endISO >= today;
          return (
            <div key={p.id} className={`card !p-4 ${isActive ? "ring-2 ring-brand-300" : "opacity-70"}`}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2"><span className="text-xl">{meta.emoji}</span><div className="font-bold">{p.name}</div></div>
                  <div className="text-xs text-ink-500 mt-1 font-mono">{p.code}</div>
                </div>
                <span className={`badge text-[10px] ${meta.cls}`}>{meta.label}</span>
              </div>
              <div className="text-sm mt-2">
                {p.type === "PERCENT_OFF" && <>Diskon <b>{p.discountPercent}%</b></>}
                {p.type === "AMOUNT_OFF" && <>Potongan <b>Rp {(p.discountAmountRp ?? 0).toLocaleString("id-ID")}</b></>}
                {p.type === "BUY_X_GET_Y" && <>Beli <b>{p.buyQty}</b> dapat <b>{p.getQty}</b> gratis</>}
                {p.type === "BUNDLE" && <>Paket bundling</>}
                {p.type === "ED_NEAR_AUTO" && <>Otomatis diskon <b>{p.discountPercent}%</b> untuk batch zona <b>{p.edZoneTrigger}</b></>}
              </div>
              {p.applyToCategory && <div className="text-xs text-ink-500 mt-1">Kategori: <b>{p.applyToCategory}</b></div>}
              {p.applyToProductIds && p.applyToProductIds.length > 0 && <div className="text-xs text-ink-500 mt-1">{p.applyToProductIds.length} produk spesifik</div>}
              {p.minSubtotalRp && <div className="text-xs text-ink-500">Min belanja: Rp {p.minSubtotalRp.toLocaleString("id-ID")}</div>}
              <div className="text-[11px] text-ink-400 mt-2">Periode: {p.startISO} → {p.endISO}</div>
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-surface-100">
                <span className={`text-[11px] ${isActive ? "text-emerald-600" : "text-ink-400"}`}>● {isActive ? "Sedang berjalan" : (p.active ? "Belum/Sudah lewat periode" : "Non-aktif")}</span>
                <div className="flex gap-2"><button onClick={() => setEdit(p)} className="text-xs text-brand-600 hover:underline">✏ Edit</button><button onClick={() => { if (confirm(`Hapus promo ${p.name}?`)) removePromo(p.id); }} className="text-xs text-danger-600 hover:underline">🗑</button></div>
              </div>
            </div>
          );
        })}
      </div>

      {edit && <PromoEditor data={edit} products={products} onClose={() => setEdit(null)} onSave={(p: any) => { upsertPromo(p); setEdit(null); }} />}
    </div>
  );
}

function PromoEditor({ data, products, onClose, onSave }: any) {
  const [f, setF] = useState<any>({
    id: data.id ?? `pr-${Date.now()}`, code: "", name: "", type: "PERCENT_OFF",
    discountPercent: 10, discountAmountRp: 0, buyQty: 2, getQty: 1,
    minSubtotalRp: 0, edZoneTrigger: "WARNING",
    active: true, startISO: new Date().toISOString().slice(0, 10),
    endISO: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10),
    applyToProductIds: [], applyToCategory: "",
    ...data,
  });
  const cats = Array.from(new Set(products.map((p: any) => p.category as string)));
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex justify-between"><h3 className="font-bold">{data.id ? "✏ Edit Promo" : "➕ Promo Baru"}</h3><button onClick={onClose} className="text-2xl">×</button></div>
        <div className="overflow-y-auto p-5 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs">Kode</label><input className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="SEHAT10" /></div>
            <div><label className="text-xs">Tipe</label><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}</select></div>
          </div>
          <div><label className="text-xs">Nama</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          {(f.type === "PERCENT_OFF" || f.type === "ED_NEAR_AUTO") && <div><label className="text-xs">% Diskon</label><input type="number" min={0} max={100} className="input" value={f.discountPercent} onChange={(e) => setF({ ...f, discountPercent: +e.target.value || 0 })} /></div>}
          {f.type === "AMOUNT_OFF" && <div><label className="text-xs">Potongan (Rp)</label><input type="number" className="input" value={f.discountAmountRp} onChange={(e) => setF({ ...f, discountAmountRp: +e.target.value || 0 })} /></div>}
          {f.type === "BUY_X_GET_Y" && <div className="grid grid-cols-2 gap-2"><div><label className="text-xs">Beli (X)</label><input type="number" min={1} className="input" value={f.buyQty} onChange={(e) => setF({ ...f, buyQty: +e.target.value || 1 })} /></div><div><label className="text-xs">Dapat (Y)</label><input type="number" min={1} className="input" value={f.getQty} onChange={(e) => setF({ ...f, getQty: +e.target.value || 1 })} /></div></div>}
          {f.type === "ED_NEAR_AUTO" && <div><label className="text-xs">Trigger zona FEFO</label><select className="input" value={f.edZoneTrigger} onChange={(e) => setF({ ...f, edZoneTrigger: e.target.value })}><option value="WARNING">Warning (90 hari)</option><option value="CRITICAL">Critical (30 hari)</option></select></div>}
          <div><label className="text-xs">Kategori (opsional)</label><select className="input" value={f.applyToCategory} onChange={(e) => setF({ ...f, applyToCategory: e.target.value })}><option value="">— semua —</option>{cats.map((c) => <option key={c as string} value={c as string}>{c as string}</option>)}</select></div>
          <div><label className="text-xs">Min Subtotal (Rp)</label><input type="number" className="input" value={f.minSubtotalRp} onChange={(e) => setF({ ...f, minSubtotalRp: +e.target.value || 0 })} /></div>
          <div className="grid grid-cols-2 gap-2"><div><label className="text-xs">Mulai</label><input type="date" className="input" value={f.startISO} onChange={(e) => setF({ ...f, startISO: e.target.value })} /></div><div><label className="text-xs">Selesai</label><input type="date" className="input" value={f.endISO} onChange={(e) => setF({ ...f, endISO: e.target.value })} /></div></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Aktif</label>
        </div>
        <div className="border-t px-5 py-3 bg-surface-50 flex justify-end gap-2"><button onClick={onClose} className="btn-secondary text-sm">Batal</button><button onClick={() => f.code && f.name && onSave(f)} className="btn-primary text-sm">💾 Simpan</button></div>
      </div>
    </div>
  );
}
