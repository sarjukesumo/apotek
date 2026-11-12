// Notifikasi multi-channel (WA / SMS / Email / In-app) — inbox + composer broadcast.

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAuth } from "../../lib/auth";
import { db } from "../../lib/firebase";
import { useDemoStore, type DemoNotifChannel } from "../../lib/demoStore";

const CHANNEL_META: Record<DemoNotifChannel, { label: string; emoji: string; cls: string }> = {
  WA: { label: "WhatsApp (nonaktif)", emoji: "💬", cls: "bg-surface-100 text-ink-500" },
  SMS: { label: "SMS", emoji: "📱", cls: "bg-brand-100 text-brand-700" },
  EMAIL: { label: "Email", emoji: "📧", cls: "bg-violet-100 text-violet-700" },
  INAPP: { label: "In-App", emoji: "🔔", cls: "bg-yellow-100 text-yellow-700" },
};

const TEMPLATES = [
  { id: "rx_ready", name: "Resep Siap Diambil", channel: "WA" as const, body: "Halo {nama}, resep Anda sudah siap diambil di Apotek Yuyun. Terima kasih 🙏" },
  { id: "promo_ed", name: "Promo Diskon ED", channel: "WA" as const, body: "🏷 Promo spesial! Diskon 20% untuk produk yang akan kadaluarsa. Berlaku hingga akhir bulan." },
  { id: "stock_low", name: "Stok Hampir Habis", channel: "INAPP" as const, body: "⚠ {produk} tinggal {qty} {unit}. Segera lakukan pemesanan." },
  { id: "birthday", name: "Ucapan Ulang Tahun", channel: "WA" as const, body: "Selamat ulang tahun {nama}! 🎂 Nikmati diskon 25% sebagai hadiah dari kami." },
  { id: "return_deadline", name: "Deadline Retur Supplier", channel: "EMAIL" as const, body: "Reminder: deadline retur {produk} batch {batch} tinggal {hari} hari." },
];

export function Notifications() {
  const tenantId = useAuth((s) => s.claims?.tenantId) ?? "";
  const notifs = useDemoStore((s) => s.notifications.filter((n) => n.tenantId === tenantId));
  const members = useDemoStore((s) => s.members.filter((m) => m.tenantId === tenantId));
  const enqueue = useDemoStore((s) => s.enqueueNotification);
  const markSent = useDemoStore((s) => s.markNotificationSent);

  const [tab, setTab] = useState<"inbox" | "compose" | "templates">("inbox");
  const [filterCh, setFilterCh] = useState<DemoNotifChannel | "ALL">("ALL");
  const [telegramChatIds, setTelegramChatIds] = useState("");
  const [telegramSaving, setTelegramSaving] = useState(false);
  const [telegramMessage, setTelegramMessage] = useState("");

  useEffect(() => {
    getDoc(doc(db, `tenants/${tenantId}/privateSettings/notifications`)).then((snapshot) => {
      const recipients = snapshot.data()?.telegramChatIds ?? [];
      setTelegramChatIds(Array.isArray(recipients) ? recipients.join(", ") : "");
    }).catch(() => setTelegramMessage("Gagal memuat chat ID Telegram."));
  }, [tenantId]);

  async function saveTelegramChatIds() {
    setTelegramSaving(true);
    setTelegramMessage("");
    try {
      const chatIds = [...new Set(telegramChatIds.split(/[\n,;]/).map((value) => value.trim()).filter(Boolean))];
      await setDoc(doc(db, `tenants/${tenantId}/privateSettings/notifications`), { telegramChatIds: chatIds }, { merge: true });
      setTelegramChatIds(chatIds.join(", "));
      setTelegramMessage("Chat ID Telegram tersimpan.");
    } catch (error) {
      setTelegramMessage(error instanceof Error ? error.message : "Gagal menyimpan chat ID Telegram.");
    } finally {
      setTelegramSaving(false);
    }
  }

  const filtered = notifs.filter((n) => filterCh === "ALL" || n.channel === filterCh).sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO));
  const queued = notifs.filter((n) => n.status === "QUEUED").length;
  const sent = notifs.filter((n) => n.status === "SENT").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">🔔 Notifikasi Multi-Channel</h1>
        <p className="text-ink-500 text-sm mt-0.5">Notifikasi sistem dikirim ke Telegram tenant yang terdaftar.</p>
      </div>

      <div className="card space-y-3">
        <div>
          <h2 className="font-semibold">Chat ID Telegram</h2>
          <p className="text-xs text-ink-500 mt-1">Masukkan satu atau beberapa chat ID, pisahkan dengan koma. Pengguna harus membuka bot dan menekan Start terlebih dahulu.</p>
        </div>
        <textarea className="input font-mono text-sm" rows={2} value={telegramChatIds}
          onChange={(event) => setTelegramChatIds(event.target.value)} placeholder="Contoh: 123456789, -1001234567890" />
        <div className="flex items-center justify-between gap-3">
          {telegramMessage && <div role="status" className="text-xs text-ink-600">{telegramMessage}</div>}
          <button className="btn-primary ml-auto" disabled={telegramSaving} onClick={() => void saveTelegramChatIds()}>
            {telegramSaving ? "Menyimpan…" : "Simpan Chat ID"}
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <div className="card !p-4"><div className="text-xs text-ink-500">Total Notifikasi</div><div className="text-2xl font-bold mt-1">{notifs.length}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Antrian</div><div className="text-2xl font-bold mt-1 text-warn-600">{queued}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Terkirim</div><div className="text-2xl font-bold mt-1 text-emerald-600">{sent}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Template Tersedia</div><div className="text-2xl font-bold mt-1">{TEMPLATES.length}</div></div>
      </div>

      <div className="flex gap-1 bg-surface-100 rounded-lg p-1 w-fit">
        {[{ k: "inbox", l: `📬 Inbox (${notifs.length})` }, { k: "compose", l: "✍ Broadcast" }, { k: "templates", l: `📝 Template (${TEMPLATES.length})` }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k as any)} className={`px-3 py-1.5 text-sm rounded-md ${tab === t.k ? "bg-white text-brand-700 font-semibold shadow-sm" : "text-ink-500"}`}>{t.l}</button>
        ))}
      </div>

      {tab === "inbox" && (
        <div className="card">
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={() => setFilterCh("ALL")} className={`text-xs px-3 py-1 rounded-full ${filterCh === "ALL" ? "bg-brand-600 text-white" : "bg-surface-100"}`}>Semua</button>
            {(["SMS", "EMAIL", "INAPP"] as DemoNotifChannel[]).map((c) => (
              <button key={c} onClick={() => setFilterCh(c)} className={`text-xs px-3 py-1 rounded-full ${filterCh === c ? "bg-brand-600 text-white" : "bg-surface-100"}`}>{CHANNEL_META[c].emoji} {CHANNEL_META[c].label}</button>
            ))}
          </div>
          {filtered.length === 0 && <div className="text-center py-10 text-ink-500"><div className="text-5xl mb-2">📭</div>Belum ada notifikasi.</div>}
          {filtered.length > 0 && (
            <div className="space-y-2">
              {filtered.map((n) => (
                <div key={n.id} className={`border rounded-lg p-3 ${n.status === "QUEUED" ? "border-warn-200 bg-warn-50/30" : n.status === "FAILED" ? "border-danger-200 bg-danger-50/30" : "border-surface-100"}`}>
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`badge text-[10px] ${CHANNEL_META[n.channel].cls}`}>{CHANNEL_META[n.channel].emoji} {CHANNEL_META[n.channel].label}</span>
                        <span className="text-xs text-ink-500">→ {n.recipientName} ({n.recipient})</span>
                        <span className={`badge text-[10px] ${n.status === "SENT" ? "bg-emerald-100 text-emerald-700" : n.status === "QUEUED" ? "bg-warn-100 text-warn-700" : n.status === "FAILED" ? "bg-danger-100 text-danger-700" : "bg-brand-100 text-brand-700"}`}>{n.status}</span>
                      </div>
                      {n.subject && <div className="font-semibold text-sm mt-1">{n.subject}</div>}
                      <div className="text-sm text-ink-700 mt-1 whitespace-pre-wrap">{n.body}</div>
                      <div className="text-[10px] text-ink-400 mt-1">{new Date(n.createdAtISO).toLocaleString("id-ID")} {n.sentISO && `· terkirim ${new Date(n.sentISO).toLocaleString("id-ID")}`}</div>
                    </div>
                    {n.status === "QUEUED" && <button onClick={() => markSent(n.id)} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded hover:bg-emerald-200">📤 Kirim</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "compose" && <ComposeBroadcast tenantId={tenantId} members={members} enqueue={enqueue} onDone={() => setTab("inbox")} />}

      {tab === "templates" && (
        <div className="card">
          <div className="text-xs text-ink-500 mb-3">Template siap pakai. Placeholder seperti <code>{"{nama}"}</code>, <code>{"{produk}"}</code> akan diganti otomatis saat trigger event.</div>
          <div className="space-y-2">
            {TEMPLATES.filter((template) => template.channel !== "WA").map((t) => (
              <div key={t.id} className="border border-surface-100 rounded-lg p-3">
                <div className="flex justify-between"><div><div className="font-semibold text-sm">{t.name}</div><div className="text-[10px] font-mono text-ink-400">{t.id}</div></div><span className={`badge text-[10px] ${CHANNEL_META[t.channel].cls}`}>{CHANNEL_META[t.channel].emoji} {CHANNEL_META[t.channel].label}</span></div>
                <div className="text-sm text-ink-700 mt-2 italic">"{t.body}"</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ComposeBroadcast({ tenantId, members, enqueue, onDone }: any) {
  const [channel, setChannel] = useState<DemoNotifChannel>("INAPP");
  const [audience, setAudience] = useState<"ALL" | "GOLD" | "PLATINUM" | "BIRTHDAY">("ALL");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tplId, setTplId] = useState("");

  const recipients = useMemo(() => {
    if (audience === "ALL") return members.filter((m: any) => m.active);
    if (audience === "GOLD") return members.filter((m: any) => m.active && (m.tier === "GOLD" || m.tier === "PLATINUM"));
    if (audience === "PLATINUM") return members.filter((m: any) => m.active && m.tier === "PLATINUM");
    if (audience === "BIRTHDAY") return members.filter((m: any) => m.active && m.birthDateISO && new Date(m.birthDateISO).getMonth() === new Date().getMonth());
    return [];
  }, [audience, members]);

  const applyTpl = (id: string) => {
    setTplId(id);
    const t = TEMPLATES.find((x) => x.id === id);
    if (t) { setBody(t.body); setChannel(t.channel); }
  };

  const send = () => {
    if (!body || recipients.length === 0) return;
    for (const m of recipients) {
      enqueue({
        tenantId, channel, template: tplId || "manual",
        recipient: channel === "EMAIL" ? (m.email ?? m.phone) : m.phone,
        recipientName: m.name,
        subject: subject || undefined,
        body: body.replace(/\{nama\}/g, m.name),
        refType: "MEMBER",
      });
    }
    alert(`✅ ${recipients.length} notifikasi masuk antrian.`);
    onDone();
  };

  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">✍ Broadcast Notifikasi</h2>
      <div className="grid md:grid-cols-3 gap-2">
        <div><label className="text-xs">Channel</label><select className="input" value={channel} onChange={(e) => setChannel(e.target.value as any)}>{(["SMS", "EMAIL", "INAPP"] as DemoNotifChannel[]).map((c) => <option key={c} value={c}>{CHANNEL_META[c].emoji} {CHANNEL_META[c].label}</option>)}</select></div>
        <div><label className="text-xs">Target</label><select className="input" value={audience} onChange={(e) => setAudience(e.target.value as any)}><option value="ALL">Semua Member ({members.filter((m: any) => m.active).length})</option><option value="GOLD">Gold + Platinum</option><option value="PLATINUM">Platinum saja</option><option value="BIRTHDAY">Ulang Tahun Bulan Ini</option></select></div>
        <div><label className="text-xs">Pakai Template</label><select className="input" value={tplId} onChange={(e) => applyTpl(e.target.value)}><option value="">— manual —</option>{TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      </div>
      {channel === "EMAIL" && <div><label className="text-xs">Subject</label><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>}
      <div><label className="text-xs">Pesan</label><textarea className="input" rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Halo {nama}, ..." /></div>
      <div className="bg-brand-50 border border-brand-200 rounded-lg p-3 text-sm"><b>{recipients.length}</b> penerima akan menerima notifikasi via <b>{CHANNEL_META[channel].label}</b>.</div>
      <div className="flex justify-end"><button onClick={send} disabled={!body || recipients.length === 0} className="btn-primary text-sm disabled:opacity-50">📤 Kirim Sekarang</button></div>
    </div>
  );
}
