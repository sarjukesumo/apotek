import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { authedFetch } from "../../lib/auth";

// ============================================================================
// Provider config UI — per-section structured form (IRIS / Telegram)
// Sensitive credentials use SECRET_REF format:
//   projects/<PROJECT_ID>/secrets/<NAME>/versions/latest
// or for emulator/dev: ENV:VAR_NAME (e.g. ENV:MIDTRANS_SERVER_KEY)
// ============================================================================

type Section = "iris" | "telegram";

const META: Record<Section, { title: string; icon: string; docs: string; tagline: string }> = {
  iris: {
    title: "Midtrans IRIS Payout",
    icon: "🏦",
    docs: "https://iris-docs.midtrans.com/",
    tagline: "Disbursement otomatis ke rekening tenant (settlement marketplace).",
  },
  telegram: {
    title: "Telegram Bot",
    icon: "✈️",
    docs: "https://core.telegram.org/bots/api",
    tagline: "Kirim notifikasi sistem ke chat Telegram yang terhubung ke tenant.",
  },
};

export function AdminConfig() {
  const { section: sectionParam = "telegram" } = useParams();
  const section: Section = sectionParam === "iris" ? "iris" : "telegram";
  const hiddenSection = sectionParam === "midtrans" || sectionParam === "whatsapp";
  const [raw, setRaw] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (hiddenSection) return;
    setLoading(true);
    setErr(null);
    setSavedAt(null);
    getDoc(doc(db, "systemConfig", "global"))
      .then((s) => {
        const data: any = s.data() || {};
        setRaw(data[section] ?? {});
      })
      .catch((e) => setErr(String(e?.message || e)))
      .finally(() => setLoading(false));
  }, [section, hiddenSection]);

  async function save(payload: any) {
    setSaving(true);
    setErr(null);
    try {
      const res = await authedFetch("/api/admin/config", {
        method: "POST",
        body: JSON.stringify({ [section]: payload }),
      });
      if (!res.ok) throw new Error(await res.text());
      setRaw(payload);
      setSavedAt(Date.now());
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  const meta = META[section];

  if (hiddenSection) return <Navigate to="/admin/config/telegram" replace />;

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span>{meta.icon}</span> {meta.title}
          </h1>
          <p className="text-ink-500 mt-1 text-sm">{meta.tagline}</p>
        </div>
        <a
          href={meta.docs}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-brand-600 hover:underline shrink-0 mt-2"
        >
          📖 Docs ↗
        </a>
      </div>

      <SecretRefHelp />

      {loading ? (
        <div className="card mt-4 text-ink-500">Memuat konfigurasi…</div>
      ) : (
        <>
          {section === "iris" && <IrisForm value={raw} onSave={save} saving={saving} />}
          {section === "telegram" && <TelegramForm value={raw} onSave={save} saving={saving} />}
        </>
      )}

      {err && (
        <div className="mt-4 rounded-xl border border-danger-200 bg-danger-50 text-danger-700 px-4 py-3 text-sm">
          ❌ Gagal: {err}
        </div>
      )}
      {savedAt && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">
          ✅ Tersimpan {new Date(savedAt).toLocaleTimeString("id-ID")}. Cache backend akan refresh ≤ 60 detik.
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Shared building blocks
// ----------------------------------------------------------------------------

function SecretRefHelp() {
  return (
    <details className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
      <summary className="cursor-pointer font-medium">🔐 Format SECRET_REF (klik untuk detail)</summary>
      <div className="mt-2 space-y-2">
        <p>
          Field bertanda <span className="font-mono text-xs bg-amber-100 px-1 rounded">SECRET_REF</span>{" "}
          tidak menyimpan nilai mentah, melainkan referensi ke <strong>Google Secret Manager</strong>:
        </p>
        <code className="block bg-white border border-amber-200 rounded p-2 text-xs">
          projects/&lt;PROJECT_ID&gt;/secrets/&lt;SECRET_NAME&gt;/versions/latest
        </code>
        <p>
          Untuk dev / emulator (tanpa GCP secret), pakai prefix{" "}
          <code className="font-mono bg-amber-100 px-1 rounded">ENV:</code>:
        </p>
        <code className="block bg-white border border-amber-200 rounded p-2 text-xs">
          ENV:TELEGRAM_BOT_TOKEN
        </code>
        <p className="text-xs text-amber-700">
          Buat secret bot Telegram di Secret Manager, lalu isi field referensinya. Pastikan service account Cloud Functions punya role <strong>Secret Manager Secret Accessor</strong>.
        </p>
      </div>
    </details>
  );
}

function Field({
  label, hint, required, children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-ink-700 mb-1">
        {label}
        {required && <span className="text-danger-500"> *</span>}
      </div>
      {children}
      {hint && <div className="text-[11px] text-ink-500 mt-1 leading-snug">{hint}</div>}
    </label>
  );
}

function Toggle({
  checked, onChange, leftLabel, rightLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <div className="inline-flex rounded-xl border border-surface-200 bg-surface-50 p-1 text-xs font-medium">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`px-3 py-1.5 rounded-lg transition ${!checked ? "bg-white shadow-sm text-ink-900" : "text-ink-500"}`}
      >
        {leftLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`px-3 py-1.5 rounded-lg transition ${checked ? "bg-white shadow-sm text-emerald-700" : "text-ink-500"}`}
      >
        {rightLabel}
      </button>
    </div>
  );
}

function SaveBar({ saving, onSave }: { saving: boolean; onSave: () => void }) {
  return (
    <div className="mt-5 flex items-center justify-end gap-2">
      <button type="button" className="btn-primary disabled:opacity-50" disabled={saving} onClick={onSave}>
        {saving ? "Menyimpan…" : "💾 Simpan"}
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// MIDTRANS
// ----------------------------------------------------------------------------

function MidtransForm({ value, onSave, saving }: { value: any; onSave: (v: any) => void; saving: boolean }) {
  const [isProduction, setIsProduction] = useState<boolean>(!!value.isProduction);
  const [serverKeyRef, setServerKeyRef] = useState<string>(value.serverKeyRef ?? "ENV:MIDTRANS_SERVER_KEY");
  const [clientKeyRef, setClientKeyRef] = useState<string>(value.clientKeyRef ?? "ENV:MIDTRANS_CLIENT_KEY");
  const [notificationUrl, setNotificationUrl] = useState<string>(value.notificationUrl ?? "");
  const [feeType, setFeeType] = useState<"PERCENT" | "FIXED">(value.platformFee?.type ?? "PERCENT");
  const [feeValue, setFeeValue] = useState<number>(value.platformFee?.value ?? 2);

  const env = isProduction ? "Production" : "Sandbox";

  return (
    <div className="card mt-4 space-y-5">
      <div className="flex items-center justify-between border-b border-surface-100 pb-4">
        <div>
          <div className="text-sm font-medium">Mode environment</div>
          <div className="text-xs text-ink-500 mt-0.5">
            Sandbox untuk test, Production untuk transaksi real. Key keduanya berbeda!
          </div>
        </div>
        <Toggle
          checked={isProduction}
          onChange={setIsProduction}
          leftLabel="🧪 Sandbox"
          rightLabel="🚀 Production"
        />
      </div>

      <Field label="Server Key (SECRET_REF)" required hint={`Server Key ${env}. Ambil di Midtrans Dashboard → Settings → Access Keys.`}>
        <input
          className="input font-mono text-xs"
          value={serverKeyRef}
          onChange={(e) => setServerKeyRef(e.target.value)}
          placeholder="ENV:MIDTRANS_SERVER_KEY"
        />
      </Field>

      <Field label="Client Key (SECRET_REF)" required hint={`Client Key ${env} (dipakai Snap.js di frontend).`}>
        <input
          className="input font-mono text-xs"
          value={clientKeyRef}
          onChange={(e) => setClientKeyRef(e.target.value)}
          placeholder="ENV:MIDTRANS_CLIENT_KEY"
        />
      </Field>

      <Field
        label="Notification URL (Webhook)"
        required
        hint="Set juga di Midtrans Dashboard → Settings → Configuration → Payment Notification URL."
      >
        <input
          className="input"
          value={notificationUrl}
          onChange={(e) => setNotificationUrl(e.target.value)}
          placeholder="https://<region>-<project>.cloudfunctions.net/api/midtrans/webhook"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipe Platform Fee">
          <select className="input" value={feeType} onChange={(e) => setFeeType(e.target.value as any)}>
            <option value="PERCENT">Persentase (%)</option>
            <option value="FIXED">Tetap (Rp)</option>
          </select>
        </Field>
        <Field
          label={feeType === "PERCENT" ? "Nilai (%)" : "Nilai (Rp)"}
          hint="Dipotong dari setiap transaksi marketplace untuk platform."
        >
          <input
            type="number"
            className="input"
            value={feeValue}
            min={0}
            step={feeType === "PERCENT" ? 0.5 : 1000}
            onChange={(e) => setFeeValue(Number(e.target.value))}
          />
        </Field>
      </div>

      <div className="rounded-xl bg-brand-50 border border-brand-100 px-3 py-2 text-xs text-brand-800 leading-relaxed">
        <strong>Checklist setelah simpan:</strong>
        <ol className="list-decimal pl-4 mt-1 space-y-0.5">
          <li>Verifikasi Notification URL di Midtrans dashboard match.</li>
          <li>Test transaksi 1× di sandbox sebelum switch Production.</li>
          <li>Cek log Cloud Functions: secret terbaca tanpa error.</li>
        </ol>
      </div>

      <SaveBar
        saving={saving}
        onSave={() =>
          onSave({
            isProduction,
            serverKeyRef: serverKeyRef.trim(),
            clientKeyRef: clientKeyRef.trim(),
            notificationUrl: notificationUrl.trim(),
            platformFee: { type: feeType, value: feeValue },
          })
        }
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// IRIS PAYOUT
// ----------------------------------------------------------------------------

function IrisForm({ value, onSave, saving }: { value: any; onSave: (v: any) => void; saving: boolean }) {
  const [isProduction, setIsProduction] = useState<boolean>(!!value.isProduction);
  const [creatorKeyRef, setCreatorKeyRef] = useState<string>(value.creatorKeyRef ?? "ENV:IRIS_CREATOR_KEY");
  const [approverKeyRef, setApproverKeyRef] = useState<string>(value.approverKeyRef ?? "ENV:IRIS_APPROVER_KEY");
  const [autoApprove, setAutoApprove] = useState<boolean>(!!value.autoApprove);

  return (
    <div className="card mt-4 space-y-5">
      <div className="flex items-center justify-between border-b border-surface-100 pb-4">
        <div>
          <div className="text-sm font-medium">Mode environment</div>
          <div className="text-xs text-ink-500 mt-0.5">IRIS punya base URL berbeda untuk sandbox / production.</div>
        </div>
        <Toggle
          checked={isProduction}
          onChange={setIsProduction}
          leftLabel="🧪 Sandbox"
          rightLabel="🚀 Production"
        />
      </div>

      <Field label="Creator API Key (SECRET_REF)" required hint="Dipakai untuk membuat payout request.">
        <input
          className="input font-mono text-xs"
          value={creatorKeyRef}
          onChange={(e) => setCreatorKeyRef(e.target.value)}
          placeholder="ENV:IRIS_CREATOR_KEY"
        />
      </Field>

      <Field
        label="Approver API Key (SECRET_REF)"
        required={autoApprove}
        hint="Diperlukan jika 'Auto-approve' aktif. Best practice: keep manual approval untuk audit."
      >
        <input
          className="input font-mono text-xs"
          value={approverKeyRef}
          onChange={(e) => setApproverKeyRef(e.target.value)}
          placeholder="ENV:IRIS_APPROVER_KEY"
        />
      </Field>

      <div className="flex items-start justify-between gap-4 rounded-xl border border-surface-200 p-3">
        <div>
          <div className="text-sm font-medium flex items-center gap-2">
            🤖 Auto-approve payout
            {autoApprove && (
              <span className="text-[10px] bg-warn-100 text-warn-700 px-1.5 py-0.5 rounded">RISKY</span>
            )}
          </div>
          <div className="text-xs text-ink-500 mt-1 leading-snug max-w-md">
            Jika ON: payout langsung di-approve setelah create. Jika OFF: butuh klik manual di IRIS dashboard
            (lebih aman, ada double-check).
          </div>
        </div>
        <input
          type="checkbox"
          className="mt-1 w-5 h-5 accent-brand-600"
          checked={autoApprove}
          onChange={(e) => setAutoApprove(e.target.checked)}
        />
      </div>

      <div className="rounded-xl bg-warn-50 border border-warn-200 px-3 py-2 text-xs text-warn-800 leading-relaxed">
        💡 <strong>Tips:</strong> Mulai dengan <em>auto-approve OFF</em> dan limit harian rendah di IRIS dashboard.
        Aktifkan auto-approve hanya setelah workflow stabil.
      </div>

      <SaveBar
        saving={saving}
        onSave={() =>
          onSave({
            isProduction,
            creatorKeyRef: creatorKeyRef.trim(),
            approverKeyRef: approverKeyRef.trim(),
            autoApprove,
          })
        }
      />
    </div>
  );
}

const TELEGRAM_DEFAULT_TEMPLATES: Record<string, string> = {
  orderPaid: "Pesanan {{orderId}} telah dibayar dan sedang diproses.",
  subscriptionReminder: "Langganan {{plan}} akan berakhir pada {{endAt}}.",
  subscriptionActive: "Langganan {{plan}} sudah aktif.",
};

function TelegramForm({ value, onSave, saving }: { value: any; onSave: (v: any) => void; saving: boolean }) {
  const [botTokenRef, setBotTokenRef] = useState<string>(value.botTokenRef ?? "ENV:TELEGRAM_BOT_TOKEN");
  const [templates, setTemplates] = useState<Record<string, string>>({
    ...TELEGRAM_DEFAULT_TEMPLATES,
    ...(value.templates ?? {}),
  });

  return (
    <div className="card mt-4 space-y-5">
      <Field label="Bot Token (SECRET_REF)" required hint="Buat bot lewat @BotFather, simpan token di Secret Manager, lalu masukkan referensinya di sini.">
        <input
          className="input font-mono text-xs"
          value={botTokenRef}
          onChange={(event) => setBotTokenRef(event.target.value)}
          placeholder="ENV:TELEGRAM_BOT_TOKEN"
        />
      </Field>
      <div className="rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
        Tambahkan chat ID masing-masing apotek di menu Notifikasi. Pengguna harus membuka bot dan menekan Start terlebih dahulu.
      </div>
      <div className="space-y-3">
        {Object.entries(templates).map(([key, template]) => (
          <Field key={key} label={`Template: ${key}`}>
            <textarea
              className="input font-mono text-sm"
              rows={2}
              value={template}
              onChange={(event) => setTemplates((current) => ({ ...current, [key]: event.target.value }))}
            />
          </Field>
        ))}
      </div>
      <SaveBar
        saving={saving}
        onSave={() => onSave({ botTokenRef: botTokenRef.trim(), templates })}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// WHATSAPP
// ----------------------------------------------------------------------------

const WA_PROVIDERS = [
  { id: "fonnte", label: "Fonnte (lokal, murah)", apiHint: "Token dari dashboard Fonnte → Devices" },
  { id: "wablas", label: "Wablas", apiHint: "Token dari Wablas dashboard" },
  { id: "twilio", label: "Twilio WhatsApp", apiHint: "Auth Token dari Twilio Console" },
  { id: "meta", label: "Meta Cloud API (resmi)", apiHint: "Permanent access token dari Meta Business" },
  { id: "starsender", label: "Starsender", apiHint: "API key dari panel Starsender" },
];

const DEFAULT_TEMPLATES: Record<string, string> = {
  otp: "Kode OTP Batam Farma Anda: {{code}}. Berlaku 5 menit. JANGAN bagikan ke siapa pun.",
  order_paid: "Halo {{name}}, pesanan #{{orderId}} sudah lunas ✅. Siap diambil dengan QR di app.",
  order_ready: "Pesanan #{{orderId}} sudah siap diambil di {{pharmacy}}. Tunjukkan QR di app.",
  doctor_reminder: "Reminder: Anda punya jadwal dengan dr. {{doctor}} jam {{time}} hari ini.",
};

function WhatsappForm({ value, onSave, saving }: { value: any; onSave: (v: any) => void; saving: boolean }) {
  const [provider, setProvider] = useState<string>(value.provider ?? "fonnte");
  const [apiKeyRef, setApiKeyRef] = useState<string>(value.apiKeyRef ?? "ENV:WA_API_KEY");
  const [senderId, setSenderId] = useState<string>(value.senderId ?? "");
  const [templates, setTemplates] = useState<Record<string, string>>({
    ...DEFAULT_TEMPLATES,
    ...(value.templates ?? {}),
  });

  const providerMeta = useMemo(
    () => WA_PROVIDERS.find((p) => p.id === provider) ?? WA_PROVIDERS[0],
    [provider]
  );

  function setTemplate(key: string, val: string) {
    setTemplates((prev) => ({ ...prev, [key]: val }));
  }
  function addTemplate() {
    const key = window.prompt("Nama template (contoh: low_stock_alert)?");
    if (!key) return;
    if (templates[key]) {
      alert("Template dengan nama ini sudah ada.");
      return;
    }
    setTemplates((prev) => ({ ...prev, [key]: "" }));
  }
  function removeTemplate(key: string) {
    if (!confirm(`Hapus template "${key}"?`)) return;
    const next = { ...templates };
    delete next[key];
    setTemplates(next);
  }

  return (
    <div className="card mt-4 space-y-5">
      <div className="grid grid-cols-2 gap-3 border-b border-surface-100 pb-4">
        <Field label="Provider Gateway" required hint="Pilih provider WhatsApp yang dipakai.">
          <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
            {WA_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Sender ID / Nomor pengirim" hint="Nomor WA yang sudah didaftarkan di provider (format: 628xxx).">
          <input
            className="input"
            value={senderId}
            onChange={(e) => setSenderId(e.target.value)}
            placeholder="6281234567890"
          />
        </Field>
      </div>

      <Field label="API Key / Token (SECRET_REF)" required hint={providerMeta.apiHint}>
        <input
          className="input font-mono text-xs"
          value={apiKeyRef}
          onChange={(e) => setApiKeyRef(e.target.value)}
          placeholder="ENV:WA_API_KEY"
        />
      </Field>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-sm font-medium">📝 Templates Pesan</div>
            <div className="text-xs text-ink-500">
              Variabel pakai format <code className="font-mono bg-surface-100 px-1 rounded">{"{{name}}"}</code>.
            </div>
          </div>
          <button type="button" className="btn-ghost text-xs" onClick={addTemplate}>+ Template</button>
        </div>

        <div className="space-y-3">
          {Object.entries(templates).map(([key, val]) => (
            <div key={key} className="rounded-xl border border-surface-200 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <code className="text-xs font-mono bg-brand-50 text-brand-700 px-2 py-0.5 rounded">{key}</code>
                {!DEFAULT_TEMPLATES[key] && (
                  <button
                    type="button"
                    className="text-xs text-danger-600 hover:underline"
                    onClick={() => removeTemplate(key)}
                  >
                    Hapus
                  </button>
                )}
              </div>
              <textarea
                className="input text-sm font-mono leading-relaxed"
                rows={2}
                value={val}
                onChange={(e) => setTemplate(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 leading-relaxed">
        💡 Setelah simpan, lakukan <strong>test send</strong> dari halaman <em>Notifikasi</em> tenant untuk
        memastikan kredensial valid.
      </div>

      <SaveBar
        saving={saving}
        onSave={() =>
          onSave({
            provider,
            apiKeyRef: apiKeyRef.trim(),
            senderId: senderId.trim(),
            templates,
          })
        }
      />
    </div>
  );
}
