// Telemedicine lite — sesi konsultasi dokter via chat / video.
// Demo: list sesi aktif, panel chat, end session, generate e-prescription mock.

import { useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import { useDemoStore, type DemoTelemedSession } from "../../lib/demoStore";

export function Telemed() {
  const tenantId = useAuth((s) => s.claims?.tenantId) ?? "";
  const sessions = useDemoStore((s) => s.telemedSessions.filter((t) => t.tenantId === tenantId));
  const messages = useDemoStore((s) => s.chatMessages);
  const doctors = useDemoStore((s) => s.doctors.filter((d) => d.tenantId === tenantId));
  const startSession = useDemoStore((s) => s.startTelemedSession);
  const endSession = useDemoStore((s) => s.endTelemedSession);
  const addChatMessage = useDemoStore((s) => s.addChatMessage);

  const [selected, setSelected] = useState<DemoTelemedSession | null>(null);
  const [showNew, setShowNew] = useState(false);

  const active = sessions.filter((s) => s.status === "ACTIVE");
  const ended = sessions.filter((s) => s.status === "ENDED");
  const sessionMsgs = useMemo(() => selected ? messages.filter((m) => m.sessionId === selected.id).sort((a, b) => a.createdAtISO.localeCompare(b.createdAtISO)) : [], [selected, messages]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">📞 Telemedicine</h1>
        <p className="text-ink-500 text-sm mt-0.5">Konsultasi dokter jarak jauh via chat/video, otomatis menghasilkan e-prescription.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="card !p-4 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white"><div className="text-xs opacity-80">Sesi Aktif</div><div className="text-2xl font-bold mt-1">{active.length}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Selesai</div><div className="text-2xl font-bold mt-1">{ended.length}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Dokter Tersedia</div><div className="text-2xl font-bold mt-1">{doctors.length}</div></div>
      </div>

      <div className="flex justify-end"><button onClick={() => setShowNew(true)} className="btn-primary text-xs">➕ Mulai Sesi Baru</button></div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-1 space-y-2">
          <h2 className="font-semibold text-sm text-ink-500">📋 Daftar Sesi</h2>
          {sessions.length === 0 && <div className="card !p-6 text-center text-ink-500 text-sm">Belum ada sesi.</div>}
          {sessions.slice().sort((a, b) => b.startedISO.localeCompare(a.startedISO)).map((s) => (
            <div key={s.id} onClick={() => setSelected(s)} className={`card !p-3 cursor-pointer ${selected?.id === s.id ? "ring-2 ring-brand-400" : ""}`}>
              <div className="flex justify-between"><div className="font-semibold text-sm">{s.patientName}</div><span className={`badge text-[10px] ${s.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-ink-100 text-ink-600"}`}>{s.status === "ACTIVE" ? "● aktif" : "selesai"}</span></div>
              <div className="text-xs text-ink-500 mt-1">👨‍⚕ {s.doctorName} · {s.channel === "VIDEO" ? "📹 Video" : "💬 Chat"}</div>
              <div className="text-[10px] text-ink-400 mt-1">{new Date(s.startedISO).toLocaleString("id-ID")}</div>
            </div>
          ))}
        </div>
        <div className="md:col-span-2">
          {!selected && <div className="card !p-10 text-center text-ink-500"><div className="text-5xl mb-3">💬</div>Pilih sesi untuk membuka chat.</div>}
          {selected && (
            <div className="card flex flex-col h-[600px]">
              <div className="border-b border-surface-100 pb-3 mb-3 flex justify-between items-start">
                <div>
                  <div className="font-bold">{selected.patientName} <span className="text-xs text-ink-500">({selected.patientPhone})</span></div>
                  <div className="text-xs text-ink-500">👨‍⚕ {selected.doctorName} · {selected.channel}</div>
                </div>
                {selected.status === "ACTIVE" && <button onClick={() => { endSession(selected.id); setSelected({ ...selected, status: "ENDED", endedISO: new Date().toISOString() }); }} className="btn-secondary text-xs">⏹ Akhiri Sesi</button>}
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 px-1">
                {sessionMsgs.length === 0 && <div className="text-center text-ink-400 text-sm py-10">Belum ada pesan.</div>}
                {sessionMsgs.map((m) => (
                  <div key={m.id} className={`flex ${m.senderRole === "DOCTOR" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${m.senderRole === "DOCTOR" ? "bg-brand-600 text-white" : m.senderRole === "PHARMACIST" ? "bg-emerald-100 text-emerald-800" : "bg-surface-100"}`}>
                      <div className="text-[10px] opacity-75 mb-0.5">{m.senderName} · {m.senderRole}</div>
                      <div className="text-sm whitespace-pre-wrap">{m.text}</div>
                      <div className="text-[10px] opacity-60 mt-1">{new Date(m.createdAtISO).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                  </div>
                ))}
              </div>
              {selected.status === "ACTIVE" && <ChatComposer sessionId={selected.id} doctorName={selected.doctorName} send={addChatMessage} />}
            </div>
          )}
        </div>
      </div>

      {showNew && <NewSession tenantId={tenantId} doctors={doctors} onClose={() => setShowNew(false)} onCreate={(s: any) => { const created = startSession(s); setSelected(created); setShowNew(false); }} />}
    </div>
  );
}

function ChatComposer({ sessionId, doctorName, send }: any) {
  const [text, setText] = useState("");
  const [role, setRole] = useState<"DOCTOR" | "PHARMACIST">("DOCTOR");
  const submit = () => {
    if (!text.trim()) return;
    send({ sessionId, senderRole: role, senderName: role === "DOCTOR" ? doctorName : "Apt. Siti A.", text: text.trim() });
    setText("");
  };
  return (
    <div className="border-t border-surface-100 pt-3 mt-3">
      <div className="flex gap-2">
        <select className="input !w-32" value={role} onChange={(e) => setRole(e.target.value as any)}><option value="DOCTOR">👨‍⚕ Dokter</option><option value="PHARMACIST">💊 Apoteker</option></select>
        <input className="input flex-1" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Ketik pesan..." />
        <button onClick={submit} className="btn-primary text-sm">📤</button>
      </div>
    </div>
  );
}

function NewSession({ tenantId, doctors, onClose, onCreate }: any) {
  const [f, setF] = useState({ doctorId: doctors[0]?.id ?? "", patientName: "", patientPhone: "", channel: "CHAT" as "CHAT" | "VIDEO" });
  const submit = () => {
    if (!f.doctorId || !f.patientName) return;
    const dr = doctors.find((d: any) => d.id === f.doctorId);
    onCreate({ tenantId, ...f, doctorName: dr.name });
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md space-y-2" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold">📞 Mulai Sesi Telemedicine</h3>
        <div><label className="text-xs">Dokter</label><select className="input" value={f.doctorId} onChange={(e) => setF({ ...f, doctorId: e.target.value })}>{doctors.map((d: any) => <option key={d.id} value={d.id}>{d.name} — {d.specialty}</option>)}</select></div>
        <div><label className="text-xs">Pasien</label><input className="input" value={f.patientName} onChange={(e) => setF({ ...f, patientName: e.target.value })} /></div>
        <div><label className="text-xs">HP Pasien</label><input className="input" value={f.patientPhone} onChange={(e) => setF({ ...f, patientPhone: e.target.value })} /></div>
        <div><label className="text-xs">Channel</label><select className="input" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value as any })}><option value="CHAT">💬 Chat</option><option value="VIDEO">📹 Video</option></select></div>
        <div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className="btn-secondary text-sm">Batal</button><button onClick={submit} className="btn-primary text-sm">▶ Mulai</button></div>
      </div>
    </div>
  );
}
