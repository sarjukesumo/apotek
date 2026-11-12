// Multi-outlet: master cabang + mutasi stok antar cabang.
// Demo: pilih batch sumber, pilih qty, status DRAFT → IN_TRANSIT → RECEIVED.

import { useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import { useDemoStore, type DemoBranch, type DemoTransfer } from "../../lib/demoStore";

export function Branches() {
  const tenantId = useAuth((s) => s.claims?.tenantId) ?? "";
  const branches = useDemoStore((s) => s.branches.filter((b) => b.tenantId === tenantId));
  const transfers = useDemoStore((s) => s.transfers.filter((t) => t.tenantId === tenantId));
  const products = useDemoStore((s) => s.products.filter((p) => p.tenantId === tenantId));
  const upsertBranch = useDemoStore((s) => s.upsertBranch);
  const removeBranch = useDemoStore((s) => s.removeBranch);
  const addTransfer = useDemoStore((s) => s.addTransfer);
  const updateTransferStatus = useDemoStore((s) => s.updateTransferStatus);

  const [tab, setTab] = useState<"branches" | "transfers" | "new">("branches");
  const [edit, setEdit] = useState<Partial<DemoBranch> | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">🏢 Multi-Cabang &amp; Mutasi Stok</h1>
        <p className="text-ink-500 text-sm mt-0.5">Kelola cabang Apotek Yuyun dan transfer stok antar cabang.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="card !p-4"><div className="text-xs text-ink-500">Cabang Aktif</div><div className="text-2xl font-bold mt-1">{branches.filter((b) => b.active).length}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Transfer Berjalan</div><div className="text-2xl font-bold mt-1 text-warn-600">{transfers.filter((t) => t.status === "IN_TRANSIT").length}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Total Mutasi</div><div className="text-2xl font-bold mt-1">{transfers.length}</div></div>
      </div>

      <div className="flex gap-1 bg-surface-100 rounded-lg p-1 w-fit">
        {[{ k: "branches", l: `🏢 Cabang (${branches.length})` }, { k: "transfers", l: `🚚 Mutasi (${transfers.length})` }, { k: "new", l: "➕ Mutasi Baru" }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k as any)} className={`px-3 py-1.5 text-sm rounded-md ${tab === t.k ? "bg-white text-brand-700 font-semibold shadow-sm" : "text-ink-500"}`}>{t.l}</button>
        ))}
      </div>

      {tab === "branches" && (
        <div className="card">
          <div className="flex justify-end mb-3"><button onClick={() => setEdit({ tenantId, active: true, isHQ: false })} className="btn-primary text-xs">➕ Tambah Cabang</button></div>
          <div className="grid md:grid-cols-2 gap-3">
            {branches.map((b) => (
              <div key={b.id} className={`border rounded-xl p-3 ${b.isHQ ? "border-brand-300 bg-brand-50/30" : "border-surface-100"}`}>
                <div className="flex justify-between">
                  <div>
                    <div className="font-semibold flex items-center gap-2">{b.name} {b.isHQ && <span className="badge bg-brand-100 text-brand-700 text-[10px]">HQ</span>} {!b.active && <span className="badge bg-ink-100 text-ink-600 text-[10px]">non-aktif</span>}</div>
                    <div className="text-xs text-ink-500 mt-1">{b.address}</div>
                    {b.phone && <div className="text-xs text-ink-500">📞 {b.phone}</div>}
                    {b.managerName && <div className="text-xs text-ink-500">👤 {b.managerName}</div>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => setEdit(b)} className="text-xs text-brand-600 hover:underline">✏ Edit</button>
                    {!b.isHQ && <button onClick={() => { if (confirm(`Hapus ${b.name}?`)) removeBranch(b.id); }} className="text-xs text-danger-600 hover:underline">🗑 Hapus</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "transfers" && (
        <div className="card">
          {transfers.length === 0 && <div className="text-center py-10 text-ink-500">Belum ada mutasi.</div>}
          {transfers.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-left text-xs text-ink-500"><tr><th className="p-2">No Transfer</th><th className="p-2">Tanggal</th><th className="p-2">Dari → Ke</th><th className="p-2 text-right">Item</th><th className="p-2">Status</th><th></th></tr></thead>
              <tbody className="divide-y divide-surface-100">
                {transfers.slice().sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO)).map((t) => (
                  <tr key={t.id}>
                    <td className="p-2 font-mono text-xs">{t.noTransfer}</td>
                    <td className="p-2 text-xs">{t.dateISO}</td>
                    <td className="p-2 text-xs">{t.fromBranchName} <span className="text-ink-400">→</span> <b>{t.toBranchName}</b></td>
                    <td className="p-2 text-right">{t.items.length}</td>
                    <td className="p-2"><span className={`badge text-[10px] ${t.status === "RECEIVED" ? "bg-emerald-100 text-emerald-700" : t.status === "IN_TRANSIT" ? "bg-warn-100 text-warn-700" : t.status === "CANCELLED" ? "bg-ink-100 text-ink-600" : "bg-brand-100 text-brand-700"}`}>{t.status}</span></td>
                    <td className="p-2 text-right text-xs">
                      {t.status === "DRAFT" && <button onClick={() => updateTransferStatus(t.id, "IN_TRANSIT")} className="text-brand-600 hover:underline">→ Kirim</button>}
                      {t.status === "IN_TRANSIT" && <button onClick={() => updateTransferStatus(t.id, "RECEIVED")} className="text-emerald-600 hover:underline">✅ Diterima</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "new" && <NewTransfer tenantId={tenantId} branches={branches} products={products} onSubmit={(t: any) => { addTransfer(t); setTab("transfers"); }} />}

      {edit && <BranchEditor branch={edit} onClose={() => setEdit(null)} onSave={(b: any) => { upsertBranch(b); setEdit(null); }} />}
    </div>
  );
}

function BranchEditor({ branch, onClose, onSave }: any) {
  const [f, setF] = useState<any>({ id: branch.id ?? `br-${Date.now()}`, name: "", address: "", phone: "", managerName: "", active: true, isHQ: false, ...branch });
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md space-y-2" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold">{branch.id ? "✏ Edit Cabang" : "➕ Cabang Baru"}</h3>
        <div><label className="text-xs">Nama</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className="text-xs">Alamat</label><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2"><div><label className="text-xs">Telepon</label><input className="input" value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div><div><label className="text-xs">Manager</label><input className="input" value={f.managerName ?? ""} onChange={(e) => setF({ ...f, managerName: e.target.value })} /></div></div>
        <div className="flex gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Aktif</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isHQ} onChange={(e) => setF({ ...f, isHQ: e.target.checked })} /> HQ</label></div>
        <div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className="btn-secondary text-sm">Batal</button><button onClick={() => f.name && onSave(f)} className="btn-primary text-sm">💾 Simpan</button></div>
      </div>
    </div>
  );
}

function NewTransfer({ tenantId, branches, products, onSubmit }: any) {
  const [fromId, setFromId] = useState(branches.find((b: any) => b.isHQ)?.id ?? branches[0]?.id ?? "");
  const [toId, setToId] = useState(branches.find((b: any) => !b.isHQ)?.id ?? "");
  const [dateISO, setDateISO] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<DemoTransfer["items"]>([]);
  const [pid, setPid] = useState("");
  const [bno, setBno] = useState("");
  const [qty, setQty] = useState(1);

  const product = products.find((p: any) => p.id === pid);
  const batches = product?.batches ?? [];
  const batch = batches.find((b: any) => b.batchNo === bno);

  const addItem = () => {
    if (!product || !batch || qty <= 0) return;
    setItems([...items, { productId: product.id, productName: product.name, batchNo: batch.batchNo, qty, unit: product.unit, expiryISO: batch.expiryISO }]);
    setPid(""); setBno(""); setQty(1);
  };

  const submit = () => {
    if (items.length === 0 || !fromId || !toId || fromId === toId) return;
    const from = branches.find((b: any) => b.id === fromId);
    const to = branches.find((b: any) => b.id === toId);
    onSubmit({ tenantId, fromBranchId: fromId, toBranchId: toId, fromBranchName: from.name, toBranchName: to.name, dateISO, items, status: "DRAFT" });
  };

  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">🚚 Mutasi Stok Baru</h2>
      <div className="grid md:grid-cols-3 gap-2">
        <div><label className="text-xs">Dari</label><select className="input" value={fromId} onChange={(e) => setFromId(e.target.value)}>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div><label className="text-xs">Ke</label><select className="input" value={toId} onChange={(e) => setToId(e.target.value)}><option value="">— pilih —</option>{branches.filter((b: any) => b.id !== fromId).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div><label className="text-xs">Tanggal</label><input type="date" className="input" value={dateISO} onChange={(e) => setDateISO(e.target.value)} /></div>
      </div>
      <div className="border-t pt-3">
        <div className="text-sm font-semibold mb-2">Tambah Item</div>
        <div className="grid md:grid-cols-4 gap-2">
          <select className="input" value={pid} onChange={(e) => { setPid(e.target.value); setBno(""); }}><option value="">— produk —</option>{products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select className="input" value={bno} onChange={(e) => setBno(e.target.value)} disabled={!product}><option value="">— batch —</option>{batches.map((b: any) => <option key={b.batchNo} value={b.batchNo}>{b.batchNo} (qty {b.qty}, ED {b.expiryISO})</option>)}</select>
          <input type="number" min={1} max={batch?.qty ?? 999} className="input" value={qty} onChange={(e) => setQty(+e.target.value || 0)} />
          <button onClick={addItem} disabled={!batch} className="btn-secondary text-sm disabled:opacity-50">➕ Tambah</button>
        </div>
      </div>
      {items.length > 0 && (
        <div>
          <table className="w-full text-sm">
            <thead className="bg-surface-50 text-left text-xs text-ink-500"><tr><th className="p-2">Produk</th><th className="p-2">Batch</th><th className="p-2 text-right">Qty</th><th></th></tr></thead>
            <tbody className="divide-y divide-surface-100">
              {items.map((it, i) => (<tr key={i}><td className="p-2 text-xs">{it.productName}</td><td className="p-2 text-xs font-mono">{it.batchNo}</td><td className="p-2 text-right">{it.qty} {it.unit}</td><td className="p-2 text-right"><button onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-xs text-danger-600">×</button></td></tr>))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-end"><button onClick={submit} disabled={items.length === 0 || fromId === toId || !toId} className="btn-primary text-sm disabled:opacity-50">💾 Simpan Mutasi (DRAFT)</button></div>
    </div>
  );
}
