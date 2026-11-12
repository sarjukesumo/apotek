import { useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import { useDemoStore, type DemoDoctor } from "../../lib/demoStore";

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const SPECIALTIES = ["Dokter Umum", "Dokter Anak", "Dokter Gigi", "Dokter Kulit", "Dokter Mata", "Dokter Penyakit Dalam", "Dokter Kandungan", "Lainnya"];
const fmtRp = (n: number) => "Rp " + n.toLocaleString("id-ID");

export function DoctorAdmin() {
  const tenantId = useAuth((s) => s.claims?.tenantId) ?? "";
  const doctors = useDemoStore((s) => s.doctors.filter((d) => d.tenantId === tenantId));
  const bookings = useDemoStore((s) => s.bookings.filter((b) => b.tenantId === tenantId));
  const upsertDoctor = useDemoStore((s) => s.upsertDoctor);
  const removeDoctor = useDemoStore((s) => s.removeDoctor);
  const toggleDoctorActive = useDemoStore((s) => s.toggleDoctorActive);
  const cancelBooking = useDemoStore((s) => s.cancelBooking);

  const [editing, setEditing] = useState<DemoDoctor | null>(null);

  const stats = useMemo(() => {
    const upcoming = bookings.filter((b) => b.status === "BOOKED" && b.dateISO >= new Date().toISOString().slice(0, 10));
    const cancelled = bookings.filter((b) => b.status === "CANCELLED");
    return { total: bookings.length, upcoming: upcoming.length, cancelled: cancelled.length };
  }, [bookings]);

  function newDoctor() {
    setEditing({
      id: "d-" + Math.random().toString(36).slice(2, 8),
      tenantId,
      name: "",
      specialty: "Dokter Umum",
      avatarEmoji: "👨‍⚕️",
      fee: 100000,
      slotMinutes: 30,
      active: true,
      schedule: [{ dayOfWeek: 1, startTime: "08:00", endTime: "12:00" }],
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">👨‍⚕️ Dokter Praktik</h1>
          <p className="text-sm text-ink-500">Kelola dokter & jadwal konsultasi di apotek Anda.</p>
        </div>
        <button onClick={newDoctor} className="btn-primary">+ Tambah Dokter</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card !p-3">
          <div className="text-xs text-ink-500">Total Dokter</div>
          <div className="text-xl font-bold">{doctors.length}</div>
        </div>
        <div className="card !p-3">
          <div className="text-xs text-ink-500">Booking Akan Datang</div>
          <div className="text-xl font-bold text-brand-600">{stats.upcoming}</div>
        </div>
        <div className="card !p-3">
          <div className="text-xs text-ink-500">Dibatalkan</div>
          <div className="text-xl font-bold text-danger-500">{stats.cancelled}</div>
        </div>
      </div>

      {/* Daftar dokter */}
      <div className="card">
        <h2 className="font-semibold">Daftar Dokter</h2>
        <div className="mt-3 grid md:grid-cols-2 gap-3">
          {doctors.length === 0 && (
            <div className="md:col-span-2 text-center text-sm text-ink-500 py-8">
              Belum ada dokter. Klik <strong>+ Tambah Dokter</strong>.
            </div>
          )}
          {doctors.map((d) => (
            <div key={d.id} className={`border-2 rounded-xl p-3 ${d.active ? "border-surface-200" : "border-surface-100 bg-surface-50 opacity-70"}`}>
              <div className="flex items-start gap-2">
                <div className="text-3xl">{d.avatarEmoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{d.name}</div>
                  <div className="text-xs text-ink-500">{d.specialty} · {fmtRp(d.fee)} · {d.slotMinutes} menit/slot</div>
                  {d.sip && <div className="text-[10px] text-ink-400 font-mono">SIP: {d.sip}</div>}
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={() => setEditing(d)} className="btn-secondary text-xs h-7 px-2">✏️</button>
                  <button onClick={() => toggleDoctorActive(d.id)} className="btn-secondary text-xs h-7 px-2">{d.active ? "⏸" : "▶"}</button>
                </div>
              </div>
              <div className="mt-2 text-xs text-ink-600">
                <strong>Jadwal:</strong>{" "}
                {d.schedule.length === 0 ? <em className="text-ink-400">Belum diatur</em> : d.schedule.map((s) => `${DAY_NAMES[s.dayOfWeek]} ${s.startTime}-${s.endTime}`).join(", ")}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Booking */}
      <div className="card">
        <h2 className="font-semibold">Booking Pasien</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-ink-500 text-xs">
              <tr>
                <th className="py-2">Tanggal</th>
                <th>Jam</th>
                <th>Dokter</th>
                <th>Pasien</th>
                <th>Keluhan</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bookings.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-ink-500">Belum ada booking.</td></tr>
              )}
              {bookings.sort((a, b) => b.dateISO.localeCompare(a.dateISO) || b.startTime.localeCompare(a.startTime)).map((b) => {
                const doc = doctors.find((d) => d.id === b.doctorId);
                return (
                  <tr key={b.id} className="border-t border-surface-100">
                    <td className="py-2">{b.dateISO} ({DAY_NAMES[new Date(b.dateISO).getDay()]})</td>
                    <td>{b.startTime}–{b.endTime}</td>
                    <td className="text-xs">{doc?.name ?? b.doctorId}</td>
                    <td>
                      <div className="font-medium">{b.patientName}</div>
                      <div className="text-[10px] text-ink-500 font-mono">{b.patientPhone}</div>
                    </td>
                    <td className="text-xs text-ink-600 max-w-[200px] truncate">{b.complaint || "—"}</td>
                    <td>
                      <span className={`badge text-[10px] ${
                        b.status === "BOOKED" ? "bg-brand-50 text-brand-700"
                        : b.status === "DONE" ? "bg-emerald-50 text-emerald-700"
                        : "bg-danger-50 text-danger-700"
                      }`}>{b.status}</span>
                    </td>
                    <td>
                      {b.status === "BOOKED" && (
                        <button onClick={() => cancelBooking(b.id)} className="btn-secondary text-xs text-danger-500">Batal</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <DoctorEditor
          doctor={editing}
          onSave={(d) => { upsertDoctor(d); setEditing(null); }}
          onClose={() => setEditing(null)}
          onDelete={(id) => { if (confirm("Hapus dokter ini?")) { removeDoctor(id); setEditing(null); } }}
        />
      )}
    </div>
  );
}

function DoctorEditor({
  doctor, onSave, onClose, onDelete,
}: {
  doctor: DemoDoctor;
  onSave: (d: DemoDoctor) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const [form, setForm] = useState<DemoDoctor>({ ...doctor });
  function update<K extends keyof DemoDoctor>(k: K, v: DemoDoctor[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }
  function updateSched(idx: number, patch: Partial<DemoDoctor["schedule"][number]>) {
    setForm((s) => ({ ...s, schedule: s.schedule.map((x, i) => (i === idx ? { ...x, ...patch } : x)) }));
  }
  function addSched() {
    setForm((s) => ({ ...s, schedule: [...s.schedule, { dayOfWeek: 2, startTime: "08:00", endTime: "12:00" }] }));
  }
  function removeSched(idx: number) {
    setForm((s) => ({ ...s, schedule: s.schedule.filter((_, i) => i !== idx) }));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
          <h2 className="font-bold text-lg">{doctor.name ? "Edit Dokter" : "+ Dokter Baru"}</h2>
          <button onClick={onClose} className="text-2xl text-ink-400 hover:text-ink-700 leading-none">×</button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="label">Nama Lengkap (dengan gelar)</label>
              <input className="input" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="dr. Nama Lengkap, Sp.A" />
            </div>
            <div>
              <label className="label">Spesialisasi</label>
              <select className="input" value={form.specialty} onChange={(e) => update("specialty", e.target.value)}>
                {SPECIALTIES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Avatar</label>
              <input className="input text-2xl text-center" maxLength={2} value={form.avatarEmoji} onChange={(e) => update("avatarEmoji", e.target.value)} />
            </div>
            <div>
              <label className="label">Biaya Konsultasi (Rp)</label>
              <input type="number" className="input" value={form.fee} onChange={(e) => update("fee", Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Durasi per Slot (menit)</label>
              <input type="number" className="input" value={form.slotMinutes} onChange={(e) => update("slotMinutes", Number(e.target.value))} />
            </div>
            <div>
              <label className="label">SIP (opsional)</label>
              <input className="input font-mono" value={form.sip ?? ""} onChange={(e) => update("sip", e.target.value)} placeholder="SIP/2024/001" />
            </div>
            <div>
              <label className="label">Status</label>
              <label className="flex items-center gap-2 mt-2">
                <input type="checkbox" className="w-5 h-5 accent-brand-500" checked={form.active} onChange={(e) => update("active", e.target.checked)} />
                <span className="text-sm">Aktif (dapat menerima booking)</span>
              </label>
            </div>
            <div className="md:col-span-2">
              <label className="label">Tentang</label>
              <textarea className="input" rows={2} value={form.about ?? ""} onChange={(e) => update("about", e.target.value)} placeholder="Singkat: pengalaman, fokus praktik, dll" />
            </div>
          </div>

          {/* Jadwal */}
          <div>
            <div className="flex items-center justify-between">
              <label className="label">Jadwal Praktik</label>
              <button onClick={addSched} className="btn-secondary text-xs h-7 px-2">+ Tambah Jadwal</button>
            </div>
            <div className="space-y-2 mt-1">
              {form.schedule.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={s.dayOfWeek}
                    onChange={(e) => updateSched(i, { dayOfWeek: Number(e.target.value) })}
                    className="input flex-1"
                  >
                    {DAY_NAMES.map((n, d) => <option key={d} value={d}>{n}</option>)}
                  </select>
                  <input type="time" className="input flex-1" value={s.startTime} onChange={(e) => updateSched(i, { startTime: e.target.value })} />
                  <span className="text-ink-400">–</span>
                  <input type="time" className="input flex-1" value={s.endTime} onChange={(e) => updateSched(i, { endTime: e.target.value })} />
                  <button onClick={() => removeSched(i)} className="btn-secondary h-9 px-2 text-danger-500">✕</button>
                </div>
              ))}
              {form.schedule.length === 0 && <div className="text-xs text-ink-400 italic">Belum ada jadwal.</div>}
            </div>
          </div>
        </div>

        <div className="border-t border-surface-100 px-5 py-3 flex justify-between gap-2 bg-surface-50">
          <button onClick={() => onDelete(form.id)} className="btn-secondary text-danger-500 text-sm">🗑 Hapus</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">Batal</button>
            <button onClick={() => onSave(form)} disabled={!form.name.trim()} className="btn-primary text-sm disabled:opacity-50">💾 Simpan</button>
          </div>
        </div>
      </div>
    </div>
  );
}
