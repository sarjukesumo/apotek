// Resep dokter + PMR (Patient Medication Record) + Konseling Apoteker.
// Workflow:
// 1. Tab "Resep Masuk": input resep baru (manual/foto), pilih pasien (atau buat baru), tambahkan obat per signa.
// 2. Sistem otomatis melakukan DRP screening (alergi/interaksi/duplikasi) berdasarkan PMR pasien.
// 3. Apoteker melakukan konseling, isi catatan, lalu DISPENSED.
// 4. Tab "PMR": database pasien dengan riwayat resep + alergi + kondisi kronis.

import { useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import {
  useDemoStore, newDemoId,
  type DemoPatient, type DemoPrescriptionItem, type DemoPrescriptionStatus,
} from "../../lib/demoStore";

const STATUS_META: Record<DemoPrescriptionStatus, { l: string; cls: string }> = {
  RECEIVED:   { l: "Diterima",     cls: "bg-surface-100 text-ink-700" },
  SCREENED:   { l: "Skrining DRP", cls: "bg-warn-100 text-warn-700" },
  DISPENSED:  { l: "Disiapkan",    cls: "bg-brand-100 text-brand-700" },
  COUNSELED:  { l: "Selesai (Konseling)", cls: "bg-emerald-100 text-emerald-700" },
  CANCELLED:  { l: "Dibatalkan",   cls: "bg-danger-100 text-danger-700" },
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

export function Prescriptions() {
  const tenantId = useAuth((s) => s.claims?.tenantId) ?? "";
  const products = useDemoStore((s) => s.products.filter((p) => p.tenantId === tenantId));
  const patients = useDemoStore((s) => s.patients.filter((p) => p.tenantId === tenantId));
  const prescriptions = useDemoStore((s) => s.prescriptions.filter((r) => r.tenantId === tenantId));
  const users = useDemoStore((s) => s.users.filter((u) => u.tenantId === tenantId && u.role === "APOTEKER" && u.active));
  const addPrescription = useDemoStore((s) => s.addPrescription);
  const updatePrescription = useDemoStore((s) => s.updatePrescription);
  const upsertPatient = useDemoStore((s) => s.upsertPatient);

  const [tab, setTab] = useState<"new" | "list" | "patients">("list");
  const [selectedRx, setSelectedRx] = useState<string | null>(null);
  const [editPatient, setEditPatient] = useState<DemoPatient | null>(null);

  const stats = useMemo(() => ({
    total: prescriptions.length,
    pending: prescriptions.filter((r) => r.status === "RECEIVED" || r.status === "SCREENED").length,
    drpAlerts: prescriptions.filter((r) => r.drpFindings.some((f) => f.severity === "DANGER")).length,
    patients: patients.length,
  }), [prescriptions, patients]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">📋 Resep &amp; PMR</h1>
        <p className="text-ink-500 text-sm mt-0.5">Pencatatan resep dokter, skrining DRP otomatis, konseling apoteker, dan riwayat pengobatan pasien.</p>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <div className="card !p-4"><div className="text-xs text-ink-500">Total Resep</div><div className="text-2xl font-bold mt-1">{stats.total}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Pending</div><div className="text-2xl font-bold mt-1 text-warn-600">{stats.pending}</div><div className="text-xs text-ink-500 mt-1">menunggu konseling</div></div>
        <div className="card !p-4 bg-danger-50 border-danger-200"><div className="text-xs text-danger-700">⚠ DRP Alert</div><div className="text-2xl font-bold mt-1 text-danger-700">{stats.drpAlerts}</div><div className="text-xs text-ink-500 mt-1">resep dengan risiko</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Pasien Terdaftar</div><div className="text-2xl font-bold mt-1">{stats.patients}</div></div>
      </div>

      <div className="flex gap-1 bg-surface-100 rounded-lg p-1 w-fit">
        {[
          { k: "list", l: `📚 Daftar Resep (${prescriptions.length})` },
          { k: "new", l: "➕ Resep Baru" },
          { k: "patients", l: `👥 Pasien (${patients.length})` },
        ].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-3 py-1.5 text-sm rounded-md ${tab === t.k ? "bg-white text-brand-700 font-semibold shadow-sm" : "text-ink-500"}`}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === "new" && <NewRxForm tenantId={tenantId} products={products} patients={patients} apothecaries={users}
        onSubmit={(payload: any) => { const r = addPrescription(payload); setSelectedRx(r.id); setTab("list"); }} />}

      {tab === "list" && (
        <div className="card">
          {prescriptions.length === 0 && <div className="text-center py-10 text-ink-500"><div className="text-5xl mb-2">📋</div>Belum ada resep. Klik <b>➕ Resep Baru</b>.</div>}
          {prescriptions.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-left text-xs text-ink-500">
                <tr><th className="p-2">No Resep</th><th className="p-2">Tanggal</th><th className="p-2">Pasien</th><th className="p-2">Dokter</th><th className="p-2 text-right">Item</th><th className="p-2">DRP</th><th className="p-2">Status</th><th></th></tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {prescriptions.slice().sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO)).map((r) => {
                  const m = STATUS_META[r.status];
                  const danger = r.drpFindings.filter((f) => f.severity === "DANGER").length;
                  const warn = r.drpFindings.filter((f) => f.severity === "WARN").length;
                  return (
                    <tr key={r.id}>
                      <td className="p-2 font-mono text-xs">{r.noResep}</td>
                      <td className="p-2">{r.dateISO}</td>
                      <td className="p-2">{r.patientName}</td>
                      <td className="p-2 text-xs">{r.doctorName}</td>
                      <td className="p-2 text-right">{r.items.length}</td>
                      <td className="p-2">
                        {danger > 0 && <span className="badge text-[10px] bg-danger-100 text-danger-700">⚠ {danger} bahaya</span>}
                        {warn > 0 && <span className="badge text-[10px] bg-warn-100 text-warn-700 ml-1">{warn} warn</span>}
                        {danger + warn === 0 && <span className="text-[10px] text-ink-400">✓ aman</span>}
                      </td>
                      <td className="p-2"><span className={`badge text-[10px] ${m.cls}`}>{m.l}</span></td>
                      <td className="p-2 text-right"><button onClick={() => setSelectedRx(r.id)} className="text-xs text-brand-600 hover:underline">→ Detail</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "patients" && (
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">👥 Database Pasien (PMR)</h2>
            <button onClick={() => setEditPatient({ id: "pt-" + newDemoId(), tenantId, name: "", phone: "", allergies: [], chronicConditions: [], pointsBalance: 0, createdAtISO: new Date().toISOString().slice(0, 10) })} className="btn-primary text-xs">➕ Pasien Baru</button>
          </div>
          {patients.length === 0 && <div className="text-center py-10 text-ink-500">Belum ada pasien terdaftar.</div>}
          {patients.length > 0 && (
            <div className="grid md:grid-cols-2 gap-3">
              {patients.map((p) => {
                const rxCount = prescriptions.filter((r) => r.patientId === p.id).length;
                return (
                  <div key={p.id} className="border border-surface-100 rounded-xl p-3 hover:border-brand-200 cursor-pointer" onClick={() => setEditPatient(p)}>
                    <div className="flex items-start gap-2">
                      <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-lg shrink-0">{p.gender === "F" ? "👩" : p.gender === "M" ? "👨" : "👤"}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{p.name}</div>
                        <div className="text-xs text-ink-500 mt-0.5">📞 {p.phone}{p.dob && ` · DOB ${p.dob}`}</div>
                        {p.allergies.length > 0 && <div className="text-xs text-danger-600 mt-1">⚠ Alergi: {p.allergies.join(", ")}</div>}
                        {p.chronicConditions.length > 0 && <div className="text-xs text-orange-600">🩺 Kondisi: {p.chronicConditions.join(", ")}</div>}
                        <div className="flex items-center gap-3 mt-1 text-xs">
                          <span className="text-ink-500">📋 {rxCount} resep</span>
                          {p.insurer && <span className="badge text-[10px] bg-brand-100 text-brand-700">{p.insurer}</span>}
                          {p.pointsBalance > 0 && <span className="badge text-[10px] bg-warn-100 text-warn-700">⭐ {p.pointsBalance} pts</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {selectedRx && (() => {
        const r = prescriptions.find((x) => x.id === selectedRx);
        if (!r) return null;
        return <RxDetail ret={r} apothecaries={users} onClose={() => setSelectedRx(null)} onUpdate={(patch: any) => updatePrescription(r.id, patch)} />;
      })()}

      {editPatient && <PatientEditor patient={editPatient} onClose={() => setEditPatient(null)} onSave={(p) => { upsertPatient(p); setEditPatient(null); }} />}
    </div>
  );
}

// ===== Form resep baru =====
function NewRxForm({ tenantId, products, patients, apothecaries, onSubmit }: any) {
  const [patientId, setPatientId] = useState("");
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [doctorSIP, setDoctorSIP] = useState("");
  const [dateISO, setDateISO] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<DemoPrescriptionItem[]>([]);

  const patient = patients.find((p: DemoPatient) => p.id === patientId);
  const add = (productId: string) => {
    const p = products.find((x: any) => x.id === productId); if (!p) return;
    setItems([...items, { productId, productName: p.name, qty: 10, unit: p.unit, signa: "3x1 setelah makan" }]);
  };
  const upd = (i: number, patch: Partial<DemoPrescriptionItem>) => setItems((arr) => arr.map((it, j) => i === j ? { ...it, ...patch } : it));
  const rm = (i: number) => setItems((arr) => arr.filter((_, j) => j !== i));

  const valid = (patientId || walkInName) && doctorName && items.length > 0;

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold">➕ Catat Resep Baru</h2>

      <div className="bg-brand-50 border border-brand-200 rounded-lg p-3 text-xs text-brand-700">
        💡 Pilih pasien terdaftar agar sistem otomatis melakukan skrining DRP berdasarkan riwayat alergi & kondisi kronis.
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-ink-500">Pasien terdaftar</label>
          <select className="input" value={patientId} onChange={(e) => { setPatientId(e.target.value); setWalkInName(""); setWalkInPhone(""); }}>
            <option value="">— atau isi walk-in di bawah —</option>
            {patients.map((p: DemoPatient) => <option key={p.id} value={p.id}>{p.name} · {p.phone}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs text-ink-500">Walk-in (nama)</label><input className="input" disabled={!!patientId} value={walkInName} onChange={(e) => setWalkInName(e.target.value)} placeholder="Nama pasien" /></div>
          <div><label className="text-xs text-ink-500">No HP</label><input className="input" disabled={!!patientId} value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)} placeholder="08xxx" /></div>
        </div>
      </div>

      {patient && (patient.allergies.length > 0 || patient.chronicConditions.length > 0) && (
        <div className="bg-warn-50 border border-warn-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-warn-700">📋 Riwayat Pasien</div>
          {patient.allergies.length > 0 && <div className="text-xs text-danger-700 mt-1">⚠ Alergi: <b>{patient.allergies.join(", ")}</b></div>}
          {patient.chronicConditions.length > 0 && <div className="text-xs text-orange-700">🩺 Kondisi: <b>{patient.chronicConditions.join(", ")}</b></div>}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-3">
        <div className="md:col-span-2"><label className="text-xs text-ink-500">Nama dokter penulis resep *</label><input className="input" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} placeholder="dr. Andini, Sp.A" /></div>
        <div><label className="text-xs text-ink-500">SIP</label><input className="input" value={doctorSIP} onChange={(e) => setDoctorSIP(e.target.value)} placeholder="SIP/2022/001" /></div>
      </div>
      <div><label className="text-xs text-ink-500">Tanggal resep</label><input type="date" className="input md:!w-48" value={dateISO} onChange={(e) => setDateISO(e.target.value)} /></div>

      <div>
        <label className="text-xs text-ink-500">Tambah obat</label>
        <select className="input" value="" onChange={(e) => { add(e.target.value); e.currentTarget.value = ""; }}>
          <option value="">— Pilih obat —</option>
          {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}{p.rxRequired ? " 🔒(Rx)" : ""}</option>)}
        </select>
      </div>

      {items.length > 0 && (
        <div className="rounded-xl border border-surface-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 text-xs text-ink-500"><tr><th className="p-2 text-left">Obat</th><th className="p-2 text-right">Qty</th><th className="p-2 text-left">Signa (aturan pakai)</th><th></th></tr></thead>
            <tbody className="divide-y divide-surface-100">
              {items.map((it, i) => (
                <tr key={i}>
                  <td className="p-2 text-xs">{it.productName} <span className="text-ink-400">/ {it.unit}</span></td>
                  <td className="p-2"><input type="number" min={1} className="input !w-20 text-right" value={it.qty} onChange={(e) => upd(i, { qty: +e.target.value || 0 })} /></td>
                  <td className="p-2"><input className="input" value={it.signa} onChange={(e) => upd(i, { signa: e.target.value })} placeholder="3x1 tab setelah makan" /></td>
                  <td className="p-2"><button onClick={() => rm(i)} className="text-xs text-danger-500">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button disabled={!valid} className="btn-primary text-sm disabled:opacity-50"
          onClick={() => onSubmit({
            tenantId, patientId: patientId || undefined,
            patientName: patient ? patient.name : walkInName,
            doctorName, doctorSIP: doctorSIP || undefined,
            dateISO, items, status: "RECEIVED" as DemoPrescriptionStatus,
          })}>📋 Simpan & Skrining DRP</button>
      </div>
    </div>
  );
}

// ===== Detail resep + konseling =====
function RxDetail({ ret, apothecaries, onClose, onUpdate }: any) {
  const [counselingNotes, setCounselingNotes] = useState(ret.counselingNotes ?? "");
  const [apothId, setApothId] = useState(ret.apothecaryId ?? apothecaries[0]?.id ?? "");

  const dispense = () => onUpdate({ status: "DISPENSED" });
  const counsel = () => {
    const a = apothecaries.find((x: any) => x.id === apothId);
    onUpdate({ status: "COUNSELED", counselingNotes, apothecaryId: apothId, apothecaryName: a?.name, apothecarySIPA: a?.sipa });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-5 py-4 border-b border-surface-100">
          <div>
            <h2 className="font-bold">📋 {ret.noResep}</h2>
            <div className="text-xs text-ink-500 mt-0.5">{ret.patientName} · {fmtDate(ret.dateISO)} · {ret.doctorName}</div>
          </div>
          <button onClick={onClose} className="text-2xl">×</button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {ret.drpFindings.length > 0 && (
            <div className="bg-danger-50 border border-danger-200 rounded-xl p-4">
              <h3 className="font-semibold text-danger-700 text-sm">⚠ Drug Related Problems (DRP) — Skrining Otomatis</h3>
              <ul className="mt-2 space-y-1.5">
                {ret.drpFindings.map((f: any, i: number) => (
                  <li key={i} className="text-xs flex gap-2">
                    <span className={`badge shrink-0 ${f.severity === "DANGER" ? "bg-danger-500 text-white" : f.severity === "WARN" ? "bg-warn-500 text-white" : "bg-brand-500 text-white"}`}>
                      {f.severity === "DANGER" ? "🔴" : f.severity === "WARN" ? "🟠" : "🔵"} {f.type}
                    </span>
                    <span>{f.message}</span>
                  </li>
                ))}
              </ul>
              <div className="text-[10px] text-ink-500 mt-2">💡 Apoteker WAJIB melakukan konseling sebelum dispensing.</div>
            </div>
          )}

          {ret.drpFindings.length === 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-700">
              ✅ Skrining DRP: tidak ada masalah terdeteksi pada resep ini.
            </div>
          )}

          <div>
            <h3 className="font-semibold text-sm mb-2">💊 Item Resep</h3>
            <table className="w-full text-sm border border-surface-100 rounded-lg overflow-hidden">
              <thead className="bg-surface-50 text-xs text-ink-500"><tr><th className="p-2 text-left">Obat</th><th className="p-2 text-right">Qty</th><th className="p-2 text-left">Signa</th></tr></thead>
              <tbody className="divide-y divide-surface-100">
                {ret.items.map((it: any, i: number) => (
                  <tr key={i}><td className="p-2">{it.productName}</td><td className="p-2 text-right">{it.qty} {it.unit}</td><td className="p-2 text-xs">{it.signa}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="font-semibold text-sm mb-2">🗣 Konseling Apoteker (PIO)</h3>
            <select className="input mb-2" value={apothId} onChange={(e) => setApothId(e.target.value)}>
              <option value="">— Pilih apoteker —</option>
              {apothecaries.map((a: any) => <option key={a.id} value={a.id}>{a.name}{a.sipa && ` · ${a.sipa}`}</option>)}
            </select>
            <textarea className="input min-h-24" placeholder="Catatan konseling: penjelasan aturan pakai, efek samping, interaksi makanan, peringatan khusus…" value={counselingNotes} onChange={(e) => setCounselingNotes(e.target.value)} />
          </div>
        </div>

        <div className="border-t border-surface-100 px-5 py-3 flex justify-end gap-2 bg-surface-50">
          <button onClick={onClose} className="btn-secondary text-sm">Tutup</button>
          {ret.status === "RECEIVED" && <button onClick={dispense} className="btn-primary text-sm">💊 Mark as Disiapkan</button>}
          {(ret.status === "DISPENSED" || ret.status === "RECEIVED") && <button disabled={!apothId || !counselingNotes} onClick={counsel} className="btn-primary text-sm disabled:opacity-50">✅ Selesai Konseling</button>}
        </div>
      </div>
    </div>
  );
}

// ===== Patient editor =====
function PatientEditor({ patient, onClose, onSave }: { patient: DemoPatient; onClose: () => void; onSave: (p: DemoPatient) => void }) {
  const [form, setForm] = useState(patient);
  const upd = <K extends keyof DemoPatient>(k: K, v: DemoPatient[K]) => setForm((c) => ({ ...c, [k]: v }));
  const valid = form.name && form.phone;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-surface-100 flex justify-between"><h2 className="font-bold">👤 {patient.name ? "Edit" : "Pasien Baru"}</h2><button onClick={onClose} className="text-2xl">×</button></div>
        <div className="overflow-y-auto p-5 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-ink-500">Nama *</label><input className="input" value={form.name} onChange={(e) => upd("name", e.target.value)} /></div>
            <div><label className="text-xs text-ink-500">No HP *</label><input className="input" value={form.phone} onChange={(e) => upd("phone", e.target.value)} /></div>
            <div><label className="text-xs text-ink-500">NIK</label><input className="input" value={form.nik ?? ""} onChange={(e) => upd("nik", e.target.value)} /></div>
            <div><label className="text-xs text-ink-500">DOB</label><input type="date" className="input" value={form.dob ?? ""} onChange={(e) => upd("dob", e.target.value)} /></div>
            <div><label className="text-xs text-ink-500">Gender</label>
              <select className="input" value={form.gender ?? ""} onChange={(e) => upd("gender", (e.target.value || undefined) as any)}>
                <option value="">—</option><option value="M">Laki-laki</option><option value="F">Perempuan</option>
              </select>
            </div>
            <div><label className="text-xs text-ink-500">Asuransi</label>
              <select className="input" value={form.insurer ?? ""} onChange={(e) => upd("insurer", e.target.value || undefined)}>
                <option value="">— Cash —</option><option value="BPJS">BPJS</option><option value="Admedika">Admedika</option><option value="Mandiri Inhealth">Mandiri Inhealth</option>
              </select>
            </div>
          </div>
          <div><label className="text-xs text-ink-500">Alamat</label><input className="input" value={form.address ?? ""} onChange={(e) => upd("address", e.target.value)} /></div>
          <div>
            <label className="text-xs text-ink-500">⚠ Alergi (pisahkan dengan koma)</label>
            <input className="input" value={form.allergies.join(", ")} onChange={(e) => upd("allergies", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="penisilin, sulfa" />
          </div>
          <div>
            <label className="text-xs text-ink-500">🩺 Kondisi Kronis (pisahkan dengan koma)</label>
            <input className="input" value={form.chronicConditions.join(", ")} onChange={(e) => upd("chronicConditions", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="DM tipe 2, hipertensi" />
          </div>
        </div>
        <div className="border-t border-surface-100 px-5 py-3 flex justify-end gap-2 bg-surface-50">
          <button onClick={onClose} className="btn-secondary text-sm">Batal</button>
          <button disabled={!valid} onClick={() => onSave(form)} className="btn-primary text-sm disabled:opacity-50">💾 Simpan</button>
        </div>
      </div>
    </div>
  );
}
