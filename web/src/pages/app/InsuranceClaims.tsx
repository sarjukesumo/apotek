// Asuransi & Klaim — master insurer + workflow klaim DRAFT → SUBMITTED → APPROVED/REJECTED → PAID.

import { useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import { useDemoStore, type DemoInsurer, type DemoInsuranceClaim, type DemoClaimStatus } from "../../lib/demoStore";

const fmtRp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const STATUS_META: Record<DemoClaimStatus, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-ink-100 text-ink-600" },
  SUBMITTED: { label: "Diajukan", cls: "bg-brand-100 text-brand-700" },
  PROCESSED: { label: "Diproses", cls: "bg-warn-100 text-warn-700" },
  APPROVED: { label: "Disetujui", cls: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "Ditolak", cls: "bg-danger-100 text-danger-700" },
  PAID: { label: "Dibayar", cls: "bg-emerald-200 text-emerald-800" },
};

export function InsuranceClaims() {
  const tenantId = useAuth((s) => s.claims?.tenantId) ?? "";
  const insurers = useDemoStore((s) => s.insurers.filter((i) => i.tenantId === tenantId));
  const claims = useDemoStore((s) => s.claims.filter((c) => c.tenantId === tenantId));
  const upsertInsurer = useDemoStore((s) => s.upsertInsurer);
  const addClaim = useDemoStore((s) => s.addClaim);
  const updateClaimStatus = useDemoStore((s) => s.updateClaimStatus);

  const [tab, setTab] = useState<"claims" | "insurers" | "new">("claims");
  const [edit, setEdit] = useState<Partial<DemoInsurer> | null>(null);
  const [view, setView] = useState<DemoInsuranceClaim | null>(null);

  const totalClaim = claims.reduce((s, c) => s + c.totalClaimRp, 0);
  const totalApproved = claims.reduce((s, c) => s + c.approvedRp, 0);
  const pendingCount = claims.filter((c) => c.status === "SUBMITTED" || c.status === "PROCESSED").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">🏥 Asuransi &amp; Klaim</h1>
        <p className="text-ink-500 text-sm mt-0.5">BPJS, asuransi swasta, dan workflow klaim resep yang ter-cover.</p>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <div className="card !p-4"><div className="text-xs text-ink-500">Insurer Aktif</div><div className="text-2xl font-bold mt-1">{insurers.filter((i) => i.active).length}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Klaim Pending</div><div className="text-2xl font-bold mt-1 text-warn-600">{pendingCount}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Total Diajukan</div><div className="text-xl font-bold mt-1">{fmtRp(totalClaim)}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Total Disetujui</div><div className="text-xl font-bold mt-1 text-emerald-600">{fmtRp(totalApproved)}</div></div>
      </div>

      <div className="flex gap-1 bg-surface-100 rounded-lg p-1 w-fit">
        {[{ k: "claims", l: `📋 Klaim (${claims.length})` }, { k: "insurers", l: `🏥 Insurer (${insurers.length})` }, { k: "new", l: "➕ Klaim Baru" }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k as any)} className={`px-3 py-1.5 text-sm rounded-md ${tab === t.k ? "bg-white text-brand-700 font-semibold shadow-sm" : "text-ink-500"}`}>{t.l}</button>
        ))}
      </div>

      {tab === "claims" && (
        <div className="card">
          {claims.length === 0 && <div className="text-center py-10 text-ink-500">Belum ada klaim.</div>}
          {claims.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-left text-xs text-ink-500"><tr><th className="p-2">No Klaim</th><th className="p-2">Tanggal</th><th className="p-2">Insurer</th><th className="p-2">Pasien</th><th className="p-2 text-right">Diajukan</th><th className="p-2 text-right">Disetujui</th><th className="p-2">Status</th><th></th></tr></thead>
              <tbody className="divide-y divide-surface-100">
                {claims.slice().sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO)).map((c) => (
                  <tr key={c.id}>
                    <td className="p-2 font-mono text-xs">{c.noClaim}</td>
                    <td className="p-2 text-xs">{c.serviceDateISO}</td>
                    <td className="p-2 text-xs">{c.insurerName}</td>
                    <td className="p-2 text-xs">{c.patientName} <span className="text-ink-400">({c.patientMemberNo})</span></td>
                    <td className="p-2 text-right">{fmtRp(c.totalClaimRp)}</td>
                    <td className="p-2 text-right text-emerald-600">{c.approvedRp ? fmtRp(c.approvedRp) : "—"}</td>
                    <td className="p-2"><span className={`badge text-[10px] ${STATUS_META[c.status].cls}`}>{STATUS_META[c.status].label}</span></td>
                    <td className="p-2 text-right"><button onClick={() => setView(c)} className="text-xs text-brand-600 hover:underline">→ Lihat</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "insurers" && (
        <div className="card">
          <div className="flex justify-end mb-3"><button onClick={() => setEdit({ tenantId, type: "PRIVATE", active: true })} className="btn-primary text-xs">➕ Tambah Insurer</button></div>
          <table className="w-full text-sm">
            <thead className="bg-surface-50 text-left text-xs text-ink-500"><tr><th className="p-2">Nama</th><th className="p-2">Tipe</th><th className="p-2">PIC</th><th className="p-2">Kontrak</th><th className="p-2">Status</th><th></th></tr></thead>
            <tbody className="divide-y divide-surface-100">
              {insurers.map((i) => (
                <tr key={i.id}>
                  <td className="p-2 font-medium">{i.name}</td>
                  <td className="p-2"><span className={`badge text-[10px] ${i.type === "BPJS" ? "bg-emerald-100 text-emerald-700" : "bg-brand-100 text-brand-700"}`}>{i.type}</span></td>
                  <td className="p-2 text-xs">{i.picName ?? "—"}{i.phone && ` · ${i.phone}`}</td>
                  <td className="p-2 text-xs font-mono">{i.contractNo ?? "—"}</td>
                  <td className="p-2"><span className={`badge text-[10px] ${i.active ? "bg-emerald-100 text-emerald-700" : "bg-ink-100 text-ink-600"}`}>{i.active ? "aktif" : "non-aktif"}</span></td>
                  <td className="p-2 text-right"><button onClick={() => setEdit(i)} className="text-xs text-brand-600 hover:underline">✏ Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "new" && <NewClaim tenantId={tenantId} insurers={insurers} onSubmit={(c: any) => { addClaim(c); setTab("claims"); }} />}

      {edit && <InsurerEditor data={edit} onClose={() => setEdit(null)} onSave={(i: any) => { upsertInsurer(i); setEdit(null); }} />}
      {view && <ClaimDetail claim={view} onClose={() => setView(null)} onAct={updateClaimStatus} />}
    </div>
  );
}

function InsurerEditor({ data, onClose, onSave }: any) {
  const [f, setF] = useState<any>({ id: data.id ?? `ins-${Date.now()}`, name: "", type: "PRIVATE", active: true, ...data });
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md space-y-2" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold">{data.id ? "✏ Edit Insurer" : "➕ Insurer Baru"}</h3>
        <div className="grid grid-cols-2 gap-2"><div><label className="text-xs">Nama</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div><div><label className="text-xs">Tipe</label><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="BPJS">BPJS</option><option value="PRIVATE">Swasta</option></select></div></div>
        <div className="grid grid-cols-2 gap-2"><div><label className="text-xs">PIC</label><input className="input" value={f.picName ?? ""} onChange={(e) => setF({ ...f, picName: e.target.value })} /></div><div><label className="text-xs">Telepon</label><input className="input" value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div></div>
        <div><label className="text-xs">No Kontrak</label><input className="input" value={f.contractNo ?? ""} onChange={(e) => setF({ ...f, contractNo: e.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Aktif</label>
        <div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className="btn-secondary text-sm">Batal</button><button onClick={() => f.name && onSave(f)} className="btn-primary text-sm">💾 Simpan</button></div>
      </div>
    </div>
  );
}

function NewClaim({ tenantId, insurers, onSubmit }: any) {
  const [f, setF] = useState({
    insurerId: insurers[0]?.id ?? "",
    patientName: "", patientMemberNo: "", serviceDateISO: new Date().toISOString().slice(0, 10),
    items: [{ description: "", qty: 1, priceRp: 0 }],
    notes: "",
  });
  const total = f.items.reduce((s, it) => s + it.qty * it.priceRp, 0);
  const updateItem = (i: number, k: string, v: any) => setF({ ...f, items: f.items.map((it, j) => i === j ? { ...it, [k]: v } : it) });
  const submit = (status: "DRAFT" | "SUBMITTED") => {
    if (!f.insurerId || !f.patientName || total <= 0) return;
    onSubmit({ tenantId, ...f, totalClaimRp: total, status, submittedDateISO: status === "SUBMITTED" ? new Date().toISOString().slice(0, 10) : undefined });
  };
  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">➕ Klaim Baru</h2>
      <div className="grid md:grid-cols-3 gap-2">
        <div><label className="text-xs">Insurer</label><select className="input" value={f.insurerId} onChange={(e) => setF({ ...f, insurerId: e.target.value })}>{insurers.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
        <div><label className="text-xs">Pasien</label><input className="input" value={f.patientName} onChange={(e) => setF({ ...f, patientName: e.target.value })} /></div>
        <div><label className="text-xs">No Anggota</label><input className="input" value={f.patientMemberNo} onChange={(e) => setF({ ...f, patientMemberNo: e.target.value })} /></div>
        <div><label className="text-xs">Tgl Layanan</label><input type="date" className="input" value={f.serviceDateISO} onChange={(e) => setF({ ...f, serviceDateISO: e.target.value })} /></div>
      </div>
      <div className="border-t pt-3">
        <div className="flex justify-between mb-2"><div className="text-sm font-semibold">Item Klaim</div><button onClick={() => setF({ ...f, items: [...f.items, { description: "", qty: 1, priceRp: 0 }] })} className="text-xs text-brand-600">+ baris</button></div>
        <table className="w-full text-sm">
          <thead className="bg-surface-50 text-left text-xs text-ink-500"><tr><th className="p-2">Deskripsi</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Harga</th><th className="p-2 text-right">Subtotal</th><th></th></tr></thead>
          <tbody className="divide-y divide-surface-100">
            {f.items.map((it, i) => (
              <tr key={i}>
                <td className="p-2"><input className="input" value={it.description} onChange={(e) => updateItem(i, "description", e.target.value)} placeholder="Obat / tindakan" /></td>
                <td className="p-2"><input type="number" min={1} className="input !w-16 text-right" value={it.qty} onChange={(e) => updateItem(i, "qty", +e.target.value || 0)} /></td>
                <td className="p-2"><input type="number" min={0} className="input !w-28 text-right" value={it.priceRp} onChange={(e) => updateItem(i, "priceRp", +e.target.value || 0)} /></td>
                <td className="p-2 text-right">{fmtRp(it.qty * it.priceRp)}</td>
                <td className="p-2"><button onClick={() => setF({ ...f, items: f.items.filter((_, j) => j !== i) })} className="text-danger-600">×</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-brand-50 font-bold"><tr><td colSpan={3} className="p-2 text-right">TOTAL KLAIM</td><td className="p-2 text-right text-brand-700">{fmtRp(total)}</td><td></td></tr></tfoot>
        </table>
      </div>
      <div><label className="text-xs">Catatan</label><textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      <div className="flex justify-end gap-2"><button onClick={() => submit("DRAFT")} className="btn-secondary text-sm">💾 Draft</button><button onClick={() => submit("SUBMITTED")} className="btn-primary text-sm">📤 Ajukan</button></div>
    </div>
  );
}

function ClaimDetail({ claim, onClose, onAct }: any) {
  const [approved, setApproved] = useState(claim.totalClaimRp);
  const [rejReason, setRejReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b flex justify-between"><div><h2 className="font-bold">📋 {claim.noClaim}</h2><div className="text-xs text-ink-500 mt-0.5">{claim.insurerName} · {claim.patientName}</div></div><button onClick={onClose} className="text-2xl">×</button></div>
        <div className="overflow-y-auto p-5 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><div className="text-xs text-ink-500">No Anggota</div>{claim.patientMemberNo}</div>
            <div><div className="text-xs text-ink-500">Tgl Layanan</div>{claim.serviceDateISO}</div>
          </div>
          <table className="w-full text-sm border border-surface-100 rounded-lg overflow-hidden">
            <thead className="bg-surface-50 text-left text-xs text-ink-500"><tr><th className="p-2">Deskripsi</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Harga</th><th className="p-2 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-surface-100">{claim.items.map((it: any, i: number) => (<tr key={i}><td className="p-2 text-xs">{it.description}</td><td className="p-2 text-right">{it.qty}</td><td className="p-2 text-right">{fmtRp(it.priceRp)}</td><td className="p-2 text-right">{fmtRp(it.qty * it.priceRp)}</td></tr>))}</tbody>
            <tfoot className="bg-brand-50 font-bold"><tr><td colSpan={3} className="p-2 text-right">TOTAL DIAJUKAN</td><td className="p-2 text-right">{fmtRp(claim.totalClaimRp)}</td></tr>{claim.approvedRp > 0 && <tr><td colSpan={3} className="p-2 text-right text-emerald-700">DISETUJUI</td><td className="p-2 text-right text-emerald-700">{fmtRp(claim.approvedRp)}</td></tr>}</tfoot>
          </table>
          {claim.rejectionReason && <div className="bg-danger-50 border border-danger-200 rounded-lg p-2 text-xs text-danger-700">⚠ Ditolak: {claim.rejectionReason}</div>}
          {(claim.status === "SUBMITTED" || claim.status === "PROCESSED") && (
            <div className="border-t pt-3 space-y-2">
              <div className="font-semibold text-sm">Update Status (mock pihak insurer)</div>
              <div><label className="text-xs">Nominal disetujui</label><input type="number" className="input" value={approved} onChange={(e) => setApproved(+e.target.value || 0)} /></div>
              <div><label className="text-xs">Alasan tolak (jika ditolak)</label><input className="input" value={rejReason} onChange={(e) => setRejReason(e.target.value)} /></div>
            </div>
          )}
        </div>
        <div className="border-t px-5 py-3 bg-surface-50 flex justify-end gap-2 flex-wrap">
          {claim.status === "DRAFT" && <button onClick={() => onAct(claim.id, "SUBMITTED")} className="btn-primary text-sm">📤 Ajukan</button>}
          {claim.status === "SUBMITTED" && <button onClick={() => onAct(claim.id, "PROCESSED")} className="btn-secondary text-sm">⏳ Diproses</button>}
          {(claim.status === "SUBMITTED" || claim.status === "PROCESSED") && <>
            <button onClick={() => onAct(claim.id, "REJECTED", 0, rejReason || "Tidak memenuhi syarat")} className="text-sm px-3 py-1.5 rounded-lg bg-danger-100 text-danger-700">✗ Tolak</button>
            <button onClick={() => onAct(claim.id, "APPROVED", approved)} className="text-sm px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700">✓ Setuju</button>
          </>}
          {claim.status === "APPROVED" && <button onClick={() => onAct(claim.id, "PAID", claim.approvedRp)} className="btn-primary text-sm">💰 Tandai Dibayar</button>}
          <button onClick={onClose} className="btn-secondary text-sm">Tutup</button>
        </div>
      </div>
    </div>
  );
}
