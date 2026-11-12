import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useDemoStore, type DemoDoctor } from "../../lib/demoStore";

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const fmtRp = (n: number) => "Rp " + n.toLocaleString("id-ID");

function todayISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function generateSlots(doctor: DemoDoctor, dateISO: string, takenSlots: Set<string>): string[] {
  const dow = new Date(dateISO).getDay();
  const sched = doctor.schedule.find((s) => s.dayOfWeek === dow);
  if (!sched) return [];
  const [sh, sm] = sched.startTime.split(":").map(Number);
  const [eh, em] = sched.endTime.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const slots: string[] = [];
  for (let m = startMin; m + doctor.slotMinutes <= endMin; m += doctor.slotMinutes) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    const t = `${hh}:${mm}`;
    if (!takenSlots.has(t)) slots.push(t);
  }
  return slots;
}

export function DoctorBooking() {
  const { tenantSlug } = useParams();
  const tenant = useDemoStore((s) => s.tenants.find((t) => t.slug === tenantSlug));
  const allDoctors = useDemoStore((s) => s.doctors);
  const allBookings = useDemoStore((s) => s.bookings);
  const addBooking = useDemoStore((s) => s.addBooking);

  const doctors = useMemo(
    () => (tenant ? allDoctors.filter((d) => d.tenantId === tenant.id && d.active) : []),
    [allDoctors, tenant]
  );

  const [doctorId, setDoctorId] = useState<string>("");
  const [dateISO, setDateISO] = useState<string>(todayISO());
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [complaint, setComplaint] = useState("");
  const [confirmed, setConfirmed] = useState<{ id: string; doctorName: string; dateISO: string; time: string } | null>(null);

  // pick first doctor by default
  if (!doctorId && doctors[0]) setDoctorId(doctors[0].id);

  const doctor = doctors.find((d) => d.id === doctorId);
  const taken = useMemo(() => {
    const set = new Set<string>();
    allBookings
      .filter((b) => b.doctorId === doctorId && b.dateISO === dateISO && b.status === "BOOKED")
      .forEach((b) => set.add(b.startTime));
    return set;
  }, [allBookings, doctorId, dateISO]);

  const slots = doctor ? generateSlots(doctor, dateISO, taken) : [];

  function book() {
    if (!doctor || !selectedSlot || !patientName.trim() || !patientPhone.trim() || !tenant) return;
    const [hh, mm] = selectedSlot.split(":").map(Number);
    const endMin = hh * 60 + mm + doctor.slotMinutes;
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
    const created = addBooking({
      tenantId: tenant.id,
      doctorId: doctor.id,
      dateISO,
      startTime: selectedSlot,
      endTime,
      patientName: patientName.trim(),
      patientPhone: patientPhone.trim(),
      complaint: complaint.trim() || undefined,
    });
    setConfirmed({ id: created.id, doctorName: doctor.name, dateISO, time: selectedSlot });
  }

  if (!tenant) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="card max-w-md text-center">
          <div className="text-5xl mb-3">🏥</div>
          <div className="font-bold text-lg">Apotek tidak ditemukan</div>
          <Link to="/" className="btn-primary mt-4 inline-block">← Beranda</Link>
        </div>
      </div>
    );
  }

  // Confirmed view
  if (confirmed) {
    const waText = encodeURIComponent(
      `Konfirmasi booking di ${tenant.name}\n\n` +
      `Dokter: ${confirmed.doctorName}\n` +
      `Tanggal: ${confirmed.dateISO}\n` +
      `Jam: ${confirmed.time}\n\n` +
      `Booking ID: ${confirmed.id}\n` +
      `Pasien: ${patientName}\n\n` +
      `Mohon konfirmasi kehadiran. Terima kasih.`
    );
    return (
      <div className="min-h-screen bg-surface-50 grid place-items-center p-4">
        <div className="bg-white rounded-3xl shadow-lg p-6 max-w-md w-full text-center">
          <div className="text-6xl mb-3">✅</div>
          <h2 className="text-xl font-bold">Booking Berhasil!</h2>
          <p className="text-sm text-ink-500 mt-1">Pesan konfirmasi siap dikirim ke dokter.</p>

          <div className="mt-4 text-left bg-surface-50 rounded-xl p-4 text-sm space-y-1">
            <div><strong>{tenant.name}</strong></div>
            <div className="text-ink-500">📍 {tenant.address}</div>
            <hr className="my-2 border-surface-200" />
            <div>👨‍⚕️ <strong>{confirmed.doctorName}</strong></div>
            <div>📅 {confirmed.dateISO} · 🕐 {confirmed.time}</div>
            <div>🙋 {patientName} · 📞 {patientPhone}</div>
            <div className="font-mono text-[10px] text-ink-400 mt-1">ID: {confirmed.id}</div>
          </div>

          <a
            href={`https://wa.me/${tenant.whatsapp.replace(/\D/g, "")}?text=${waText}`}
            target="_blank"
            rel="noreferrer"
            className="btn-primary w-full mt-4 grid place-items-center bg-emerald-600 hover:bg-emerald-700"
          >
            💬 Konfirmasi via WhatsApp
          </a>
          <Link to={`/store/${tenantSlug}`} className="btn-secondary w-full mt-2 grid place-items-center">
            ← Kembali ke Toko
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Hero */}
      <div className="text-white" style={{ background: `linear-gradient(135deg, ${tenant.primaryColor}, ${tenant.primaryColor}dd)` }}>
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center gap-3">
          <Link to={`/store/${tenantSlug}`} className="bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5 text-sm">←</Link>
          <div>
            <div className="text-xs opacity-80">{tenant.name}</div>
            <h1 className="text-xl font-bold">👨‍⚕️ Booking Dokter</h1>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {/* Step 1: Pilih dokter */}
        <div className="card">
          <h2 className="font-semibold">1. Pilih Dokter</h2>
          {doctors.length === 0 ? (
            <div className="text-sm text-ink-500 mt-3 italic">Belum ada dokter terdaftar di apotek ini.</div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2 mt-3">
              {doctors.map((d) => (
                <button
                  key={d.id}
                  onClick={() => { setDoctorId(d.id); setSelectedSlot(null); }}
                  className={`text-left p-3 rounded-xl border-2 transition ${
                    d.id === doctorId
                      ? "border-brand-500 bg-brand-50"
                      : "border-surface-200 hover:border-brand-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="text-3xl">{d.avatarEmoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">{d.name}</div>
                      <div className="text-xs text-ink-500">{d.specialty}</div>
                      <div className="text-xs text-brand-700 font-medium mt-0.5">{fmtRp(d.fee)}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {doctor && doctor.about && (
            <p className="text-xs text-ink-600 mt-3 bg-surface-50 rounded-lg p-2">
              <strong>Tentang:</strong> {doctor.about}
            </p>
          )}
        </div>

        {/* Step 2: Pilih tanggal */}
        {doctor && (
          <div className="card">
            <h2 className="font-semibold">2. Pilih Tanggal</h2>
            <div className="text-xs text-ink-500 mt-1">
              Jadwal {doctor.name}:{" "}
              {doctor.schedule.map((s) => `${DAY_NAMES[s.dayOfWeek]} ${s.startTime}-${s.endTime}`).join(", ") || "Belum diatur"}
            </div>
            <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1">
              {Array.from({ length: 14 }).map((_, i) => {
                const iso = todayISO(i);
                const d = new Date(iso);
                const dn = DAY_NAMES[d.getDay()];
                const isAvail = doctor.schedule.some((s) => s.dayOfWeek === d.getDay());
                const isActive = iso === dateISO;
                return (
                  <button
                    key={iso}
                    onClick={() => { setDateISO(iso); setSelectedSlot(null); }}
                    disabled={!isAvail}
                    className={`shrink-0 rounded-xl px-3 py-2 text-center border-2 transition ${
                      isActive
                        ? "border-brand-500 bg-brand-500 text-white"
                        : isAvail
                        ? "border-surface-200 hover:border-brand-300 bg-white"
                        : "border-surface-100 bg-surface-50 text-ink-300 cursor-not-allowed"
                    }`}
                  >
                    <div className="text-[10px]">{dn}</div>
                    <div className="font-bold">{d.getDate()}</div>
                    <div className="text-[10px]">{d.toLocaleDateString("id-ID", { month: "short" })}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 3: Pilih jam */}
        {doctor && (
          <div className="card">
            <h2 className="font-semibold">3. Pilih Jam</h2>
            <div className="text-xs text-ink-500 mt-1">{slots.length} slot tersedia · durasi {doctor.slotMinutes} menit</div>
            {slots.length === 0 ? (
              <div className="text-sm text-ink-500 mt-3 italic bg-surface-50 rounded-lg p-3">
                Tidak ada slot tersedia di tanggal ini. Coba tanggal lain.
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-3">
                {slots.map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedSlot(t)}
                    className={`rounded-lg py-2 text-sm font-medium transition border-2 ${
                      selectedSlot === t
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-surface-200 hover:border-brand-300 bg-white"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Data pasien */}
        {doctor && selectedSlot && (
          <div className="card">
            <h2 className="font-semibold">4. Data Pasien</h2>
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              <div>
                <label className="label">Nama Pasien *</label>
                <input className="input" value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="Nama lengkap" />
              </div>
              <div>
                <label className="label">No. WhatsApp *</label>
                <input className="input font-mono" value={patientPhone} onChange={(e) => setPatientPhone(e.target.value.replace(/[^\d]/g, ""))} placeholder="08xxxxxxxxxx" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Keluhan (opsional)</label>
                <textarea className="input" rows={2} value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="Mis. demam 2 hari, batuk berdahak…" />
              </div>
            </div>

            {/* Summary */}
            <div className="mt-4 bg-brand-50 rounded-xl p-3 text-sm">
              <div className="font-semibold text-brand-800">Ringkasan Booking</div>
              <div className="text-xs text-ink-700 mt-1 space-y-0.5">
                <div>{doctor.avatarEmoji} {doctor.name} · {doctor.specialty}</div>
                <div>📅 {dateISO} · 🕐 {selectedSlot} ({doctor.slotMinutes} menit)</div>
                <div className="font-bold">💰 Biaya konsultasi: {fmtRp(doctor.fee)}</div>
              </div>
            </div>

            <button
              onClick={book}
              disabled={!patientName.trim() || !patientPhone.trim()}
              className="btn-primary w-full mt-3 disabled:opacity-50"
            >
              ✓ Konfirmasi Booking
            </button>
            <p className="text-[11px] text-ink-500 mt-2 text-center">
              Pembayaran dilakukan langsung di apotek saat datang konsultasi.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
