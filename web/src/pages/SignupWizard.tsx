import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useDemoStore, type DemoTenant } from "../lib/demoStore";
import { useAuth } from "../lib/auth";
import { sendOtp, maskPhone, maskEmail, type OtpChannel } from "../lib/otp";

type PlanCode = "BASIC" | "PRO" | "YEARLY";
type Plan = {
  code: PlanCode;
  name: string;
  price: number;
  period: "bulan" | "tahun";
  highlight?: boolean;
  features: string[];
};

const PLANS: Plan[] = [
  {
    code: "BASIC", name: "Basic", price: 99000, period: "bulan",
    features: ["1 cabang", "POS + Inventory FEFO", "Notifikasi Telegram", "Hingga 500 produk"],
  },
  {
    code: "PRO", name: "Pro", price: 249000, period: "bulan", highlight: true,
    features: ["1 cabang + multi user", "Marketplace + QR pickup", "Payout otomatis IRIS", "AI Assistant", "Jadwal Dokter"],
  },
  {
    code: "YEARLY", name: "Yearly", price: 2490000, period: "tahun",
    features: ["Semua fitur Pro", "Priority support", "Onboarding manual", "Backup harian", "Hemat 17%"],
  },
];

const RESERVED_SLUGS = new Set([
  "www", "app", "admin", "api", "auth", "demo", "login", "signup", "store",
  "marketplace", "blog", "docs", "help", "support", "mail", "ftp", "test",
  "staging", "dev", "pharmaos", "batamfarma", "batam-farma", "dashboard",
]);

const fmtRp = (n: number) => "Rp " + n.toLocaleString("id-ID");
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

const ROOT_DOMAIN = "batam-farma.web.app";

type Step = "plan" | "form" | "otp" | "payment" | "success";

export function SignupWizard() {
  const [params] = useSearchParams();
  const initialPlan = (params.get("plan") as PlanCode) || "PRO";
  const tenants = useDemoStore((s) => s.tenants);
  const upsertTenant = useDemoStore((s) => s.upsertTenant);
  const nav = useNavigate();

  const [step, setStep] = useState<Step>(params.get("plan") ? "form" : "plan");
  const [planCode, setPlanCode] = useState<PlanCode>(initialPlan);
  const plan = PLANS.find((p) => p.code === planCode)!;

  // Form state
  const [aptName, setAptName] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [agree, setAgree] = useState(false);

  // Auto-derive slug from apotek name unless user manually edited
  useEffect(() => {
    if (!slugTouched) setSlugInput(slugify(aptName).slice(0, 30));
  }, [aptName, slugTouched]);

  const slug = slugify(slugInput).slice(0, 30);
  const slugStatus = useMemo(() => {
    if (!slug) return { ok: false, msg: "" };
    if (slug.length < 3) return { ok: false, msg: "Minimal 3 karakter" };
    if (RESERVED_SLUGS.has(slug)) return { ok: false, msg: "Subdomain ini dicadangkan, pilih lain" };
    if (tenants.some((t) => t.slug === slug)) return { ok: false, msg: "Subdomain sudah dipakai apotek lain" };
    if (!/^[a-z][a-z0-9-]+[a-z0-9]$/.test(slug)) return { ok: false, msg: "Hanya huruf kecil, angka, dan -. Awali dengan huruf." };
    return { ok: true, msg: "Tersedia ?" };
  }, [slug, tenants]);

  const formValid =
    aptName.trim().length >= 3 &&
    slugStatus.ok &&
    ownerName.trim().length >= 3 &&
    /^08\d{8,12}$/.test(phone.replace(/\D/g, "")) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    city.trim().length >= 2 &&
    agree;

  // OTP step state
  const [otpChannel, setOtpChannel] = useState<OtpChannel>("email");
  const [otpCode, setOtpCode] = useState<string>("");           // generated (demo only)
  const [otpSentAt, setOtpSentAt] = useState<number | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);

  // Payment step
  const [paying, setPaying] = useState(false);
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null);

  async function startOtp(channel: OtpChannel = otpChannel) {
    setOtpChannel(channel);
    setStep("otp");
    setOtpInput("");
    setOtpError(null);
    setOtpVerified(false);
    setOtpSending(true);
    try {
      const dest = channel === "whatsapp" ? phone : email;
      const r = await sendOtp(channel, dest);
      setOtpCode(r.demoCode);
      setOtpSentAt(r.sentAt);
    } finally {
      setOtpSending(false);
    }
  }

  async function resendOtp() {
    if (otpSending) return;
    setOtpError(null);
    setOtpSending(true);
    try {
      const dest = otpChannel === "whatsapp" ? phone : email;
      const r = await sendOtp(otpChannel, dest);
      setOtpCode(r.demoCode);
      setOtpSentAt(r.sentAt);
    } finally {
      setOtpSending(false);
    }
  }

  function verifyOtp() {
    if (otpInput.trim() === otpCode) {
      setOtpVerified(true);
      setOtpError(null);
      // Auto-advance ke payment setelah 600ms
      setTimeout(() => setStep("payment"), 600);
    } else {
      setOtpError("Kode OTP salah. Coba lagi atau kirim ulang.");
    }
  }

  // Google sign-in shortcut: ambil identitas dari Google, skip OTP.
  const signInGoogle = useAuth((s) => s.signInGoogle);
  const googleUser = useAuth((s) => s.user);
  const [googleBusy, setGoogleBusy] = useState(false);
  async function startGoogleSignup() {
    setGoogleBusy(true);
    try {
      await signInGoogle();
      // Setelah popup, useEffect di bawah akan auto-fill dari googleUser
    } finally {
      setGoogleBusy(false);
    }
  }
  useEffect(() => {
    if (!googleUser) return;
    if (!ownerName && googleUser.displayName) setOwnerName(googleUser.displayName);
    if (!email && googleUser.email) setEmail(googleUser.email);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleUser]);

  async function startTrial() {
    setPaying(true);
    const id = "t-" + slug + "-" + Math.random().toString(36).slice(2, 6);
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);
    const newTenant: DemoTenant = {
      id,
      name: aptName,
      slug,
      logoEmoji: "??",
      primaryColor: "#10b981",
      city,
      address: city,
      lat: -6.2,
      lng: 106.8,
      phone,
      whatsapp: phone,
      distanceKm: 0,
      rating: 5,
      marketplaceEnabled: true,
      bank: { bankName: "BCA", accountNumber: "", accountHolder: ownerName },
      plan: planCode === "YEARLY" ? "PRO" : (planCode as any),
      subscriptionStatus: "TRIAL",
      subscribedAtISO: new Date().toISOString().slice(0, 10),
      nextBillingISO: trialEnd.toISOString().slice(0, 10),
      mrr: 0,
    };
    upsertTenant(newTenant);
    setCreatedTenantId(id);
    setPaying(false);
    setStep("success");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-50 via-brand-50/30 to-accent-50/30">
      <header className="bg-white/80 backdrop-blur border-b border-surface-100 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="font-bold text-brand-600 text-lg">Batam Farma</Link>
          <Link to="/login" className="text-sm text-ink-600 hover:text-brand-600">Sudah punya akun? Masuk ?</Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <Stepper step={step} />

        {step === "plan" && (
          <PlanStep
            plans={PLANS}
            selected={planCode}
            onSelect={setPlanCode}
            onNext={() => setStep("form")}
          />
        )}

        {step === "form" && (
          <FormStep
            plan={plan}
            aptName={aptName} setAptName={setAptName}
            slugInput={slugInput} setSlugInput={(v) => { setSlugInput(v); setSlugTouched(true); }}
            slug={slug} slugStatus={slugStatus}
            ownerName={ownerName} setOwnerName={setOwnerName}
            phone={phone} setPhone={setPhone}
            email={email} setEmail={setEmail}
            city={city} setCity={setCity}
            agree={agree} setAgree={setAgree}
            valid={formValid}
            onBack={() => setStep("plan")}
            onSendOtp={(ch) => startOtp(ch)}
            googleAvailable={!!googleUser}
            googleBusy={googleBusy}
            onGoogleSignup={startGoogleSignup}
          />
        )}

        {step === "otp" && (
          <OtpStep
            channel={otpChannel}
            phone={phone}
            email={email}
            sending={otpSending}
            sentAt={otpSentAt}
            otpInput={otpInput}
            setOtpInput={setOtpInput}
            error={otpError}
            verified={otpVerified}
            demoCode={otpCode}
            onVerify={verifyOtp}
            onResend={resendOtp}
            onBack={() => setStep("form")}
          />
        )}

        {step === "payment" && (
          <PaymentStep
            plan={plan}
            slug={slug}
            aptName={aptName}
            paying={paying}
            onPay={startTrial}
            onBack={() => setStep("form")}
          />
        )}

        {step === "success" && createdTenantId && (
          <SuccessStep
            slug={slug}
            aptName={aptName}
            plan={plan}
            tenantId={createdTenantId}
            onGoToApp={() => nav("/demo")}
          />
        )}
      </div>
    </div>
  );
}

// ---------- Stepper ----------

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string; icon: string }[] = [
    { key: "plan", label: "Pilih Paket", icon: "??" },
    { key: "form", label: "Data Apotek", icon: "??" },
    { key: "otp", label: "Verifikasi WA", icon: "??" },
    { key: "payment", label: "Bayar QRIS", icon: "??" },
    { key: "success", label: "Selesai", icon: "?" },
  ];
  const currentIdx = steps.findIndex((s) => s.key === step);

  return (
    <div className="flex items-center justify-between mb-8">
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={s.key} className="flex-1 flex items-center">
            <div className={`flex flex-col items-center text-center ${i === 0 ? "" : "flex-1"}`}>
              <div className={`w-10 h-10 rounded-full grid place-items-center text-base font-bold transition ${
                done ? "bg-brand-500 text-white" : active ? "bg-brand-500 text-white ring-4 ring-brand-200" : "bg-surface-200 text-ink-400"
              }`}>
                {done ? "?" : i + 1}
              </div>
              <div className={`text-[10px] mt-1 font-medium ${active ? "text-brand-700" : "text-ink-500"}`}>{s.label}</div>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-1 mx-2 rounded ${i < currentIdx ? "bg-brand-500" : "bg-surface-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Step 1: Plan ----------

function PlanStep({ plans, selected, onSelect, onNext }: {
  plans: Plan[]; selected: PlanCode; onSelect: (c: PlanCode) => void; onNext: () => void;
}) {
  return (
    <div>
      <h1 className="text-3xl font-bold text-center">Pilih Paket Berlangganan</h1>
      <p className="text-center text-ink-500 mt-2">Mulai gratis trial 30 hari. Bisa upgrade/downgrade kapan saja.</p>

      <div className="grid md:grid-cols-3 gap-4 mt-8">
        {plans.map((p) => (
          <button
            key={p.code}
            onClick={() => onSelect(p.code)}
            className={`text-left rounded-3xl p-6 border-2 transition relative ${
              selected === p.code ? "border-brand-500 bg-white shadow-lg scale-[1.02]" : "border-surface-200 bg-white hover:border-brand-300"
            } ${p.highlight ? "" : ""}`}
          >
            {p.highlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-[10px] font-bold uppercase px-3 py-1 rounded-full">
                ? Populer
              </div>
            )}
            <div className="text-xs text-ink-500 uppercase tracking-wider">{p.name}</div>
            <div className="mt-2">
              <span className="text-3xl font-bold">{fmtRp(p.price)}</span>
              <span className="text-sm text-ink-500"> /{p.period}</span>
            </div>
            <ul className="mt-4 space-y-1.5 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2"><span className="text-brand-500">?</span><span>{f}</span></li>
              ))}
            </ul>
            {selected === p.code && (
              <div className="mt-4 text-center text-xs font-bold text-brand-700 bg-brand-50 rounded-lg py-2">? Dipilih</div>
            )}
          </button>
        ))}
      </div>

      <div className="flex justify-end mt-8">
        <button onClick={onNext} className="btn-primary text-base h-12 px-8">Lanjut ?</button>
      </div>
    </div>
  );
}

// ---------- Step 2: Form ----------

function FormStep(props: {
  plan: Plan;
  aptName: string; setAptName: (v: string) => void;
  slugInput: string; setSlugInput: (v: string) => void;
  slug: string; slugStatus: { ok: boolean; msg: string };
  ownerName: string; setOwnerName: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  city: string; setCity: (v: string) => void;
  agree: boolean; setAgree: (v: boolean) => void;
  valid: boolean;
  onBack: () => void;
  onSendOtp: (channel: OtpChannel) => void;
  googleAvailable: boolean;
  googleBusy: boolean;
  onGoogleSignup: () => void;
}) {
  const { plan, aptName, setAptName, slugInput, setSlugInput, slug, slugStatus,
    ownerName, setOwnerName, phone, setPhone, email, setEmail, city, setCity,
    agree, setAgree, valid, onBack, onSendOtp,
    googleAvailable, googleBusy, onGoogleSignup } = props;

  const [legalModal, setLegalModal] = useState<"terms" | "privacy" | null>(null);

  return (
    <div>
      <h1 className="text-2xl font-bold text-center">Data Apotek Anda</h1>
      <p className="text-center text-ink-500 mt-1">
        Paket: <strong className="text-brand-700">{plan.name}</strong> � {fmtRp(plan.price)}/{plan.period}
      </p>

      {/* Quick auth: Google */}
      <div className="mt-5 rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/40 p-4 flex items-center gap-3">
        <div className="text-3xl">??</div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-ink-900">Daftar instan dengan Google</div>
          <div className="text-xs text-ink-500">
            {googleAvailable
              ? "? Akun Google sudah terhubung � nama & email otomatis terisi."
              : "Lewati ketik nama & email � Google sudah diverifikasi sehingga tidak perlu OTP."}
          </div>
        </div>
        <button
          type="button"
          onClick={onGoogleSignup}
          disabled={googleBusy || googleAvailable}
          className="btn-secondary text-sm px-3 py-2 disabled:opacity-60 whitespace-nowrap"
        >
          {googleBusy ? "Membuka�" : googleAvailable ? "Tersambung ?" : "?? Pakai Google"}
        </button>
      </div>

      <div className="card mt-4 space-y-4">
        <div>
          <label className="label">Nama Apotek *</label>
          <input className="input" value={aptName} onChange={(e) => setAptName(e.target.value)} placeholder="Apotek Yuyun" />
        </div>

        {/* Subdomain */}
        <div>
          <label className="label flex items-center justify-between">
            <span>Alamat Web (Subdomain) *</span>
            {slug && (
              <span className={`text-xs font-medium ${slugStatus.ok ? "text-emerald-600" : "text-danger-500"}`}>
                {slugStatus.msg}
              </span>
            )}
          </label>
          <div className="flex items-stretch rounded-xl border-2 border-surface-200 focus-within:border-brand-400 overflow-hidden bg-white">
            <span className="bg-surface-50 px-3 grid place-items-center text-ink-400 text-sm">https://</span>
            <input
              className="flex-1 px-2 py-2 outline-none text-sm font-mono"
              value={slugInput}
              onChange={(e) => setSlugInput(e.target.value.toLowerCase())}
              placeholder="apotekyuyun"
              maxLength={30}
            />
            <span className="bg-surface-50 px-3 grid place-items-center text-ink-500 text-sm font-mono">.{ROOT_DOMAIN}</span>
          </div>
          {slug && slugStatus.ok && (
            <div className="text-xs text-ink-500 mt-1">
              ? Storefront Anda akan live di:{" "}
              <span className="font-mono font-bold text-brand-700">https://{slug}.{ROOT_DOMAIN}</span>
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Nama Pemilik *</label>
            <input className="input" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Nama lengkap" />
          </div>
          <div>
            <label className="label">No. WhatsApp *</label>
            <input className="input font-mono" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} placeholder="08xxxxxxxxxx" />
          </div>
          <div>
            <label className="label">Email *</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@apotek.com" />
          </div>
          <div>
            <label className="label">Kota *</label>
            <input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Batam" />
          </div>
        </div>

        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" className="mt-1 w-5 h-5 accent-brand-500" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span className="text-xs text-ink-600">
            Saya setuju dengan{" "}
            <button type="button" onClick={(e) => { e.preventDefault(); setLegalModal("terms"); }}
              className="text-brand-600 underline hover:text-brand-700">
              Syarat &amp; Ketentuan
            </button>{" "}
            serta{" "}
            <button type="button" onClick={(e) => { e.preventDefault(); setLegalModal("privacy"); }}
              className="text-brand-600 underline hover:text-brand-700">
              Kebijakan Privasi
            </button>{" "}
            Batam Farma. Saya memahami bahwa data apotek dan transaksi akan tersimpan di server Batam Farma.
          </span>
        </label>
      </div>

      {legalModal && (
        <LegalModal kind={legalModal} onClose={() => setLegalModal(null)} onAccept={() => { setAgree(true); setLegalModal(null); }} />
      )}

      <div className="mt-6 space-y-2">
        <button
          onClick={() => onSendOtp("email")}
          disabled={!valid}
          className="btn-primary text-sm h-12 w-full disabled:opacity-50 flex items-center justify-center gap-2"
        >
          ✉️ Kirim OTP ke Email
        </button>
        <button onClick={onBack} className="text-xs text-ink-500 hover:text-ink-900 mx-auto block mt-2">? Kembali pilih paket</button>
      </div>
    </div>
  );
}

// ---------- Step 3: Payment ----------

function PaymentStep({ plan, slug, aptName, paying, onPay, onBack }: {
  plan: Plan; slug: string; aptName: string; paying: boolean; onPay: () => void; onBack: () => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-center">Pembayaran QRIS</h1>
      <p className="text-center text-ink-500 mt-1">Bayar sekali untuk aktifkan akun (free trial 30 hari).</p>

      <div className="grid md:grid-cols-2 gap-4 mt-6">
        {/* Order summary */}
        <div className="card">
          <h3 className="font-semibold">?? Ringkasan Order</h3>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-500">Apotek</span>
              <span className="font-semibold">{aptName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-500">Subdomain</span>
              <span className="font-mono text-xs">{slug}.{ROOT_DOMAIN}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-500">Paket</span>
              <span className="font-semibold">{plan.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-500">Periode</span>
              <span>{plan.period === "bulan" ? "1 bulan" : "1 tahun"}</span>
            </div>
            <hr className="border-surface-200" />
            <div className="flex justify-between text-lg">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-brand-600">{fmtRp(plan.price)}</span>
            </div>
            <div className="bg-emerald-50 text-emerald-700 text-xs rounded-lg p-2 mt-2">
              ?? Free trial 30 hari pertama. Tagihan pertama setelah trial berakhir.
            </div>
          </div>
        </div>

        <div className="card text-center">
          <h3 className="font-semibold">Trial 30 hari</h3>
          <p className="text-sm text-ink-500 mt-2">Pembayaran online sementara dinonaktifkan. Tidak ada tagihan yang dibuat saat pendaftaran.</p>
          <button
            onClick={onPay}
            disabled={paying}
            className="btn-primary w-full mt-4 h-12 disabled:opacity-50"
          >
            {paying ? "Menyiapkan trial…" : "Mulai Trial 30 Hari"}
          </button>
        </div>
      </div>

      <div className="flex justify-between mt-6">
        <button onClick={onBack} disabled={paying} className="btn-secondary disabled:opacity-50">? Kembali</button>
      </div>
    </div>
  );
}

// Faux QR code that looks random but is deterministic per seed
function FauxQR({ seed, size = 200 }: { seed: string; size?: number }) {
  const grid = useMemo(() => {
    const n = 25;
    const cells: boolean[] = [];
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    for (let i = 0; i < n * n; i++) {
      h = (h * 1103515245 + 12345) & 0x7fffffff;
      cells.push((h & 1) === 1);
    }
    // Force position markers (3 corners)
    const stamp = (cx: number, cy: number) => {
      for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
        const px = cx + x, py = cy + y;
        if (px < 0 || px >= n || py < 0 || py >= n) continue;
        const inOuter = Math.max(Math.abs(x), Math.abs(y)) === 3;
        const inMid = Math.max(Math.abs(x), Math.abs(y)) === 2;
        const inInner = Math.max(Math.abs(x), Math.abs(y)) <= 1;
        cells[py * n + px] = inOuter || inInner;
        if (inMid) cells[py * n + px] = false;
      }
    };
    stamp(3, 3);
    stamp(n - 4, 3);
    stamp(3, n - 4);
    return { n, cells };
  }, [seed]);

  const cs = size / grid.n;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${grid.n} ${grid.n}`} className="block">
      <rect width={grid.n} height={grid.n} fill="white" />
      {grid.cells.map((on, i) => on ? (
        <rect key={i} x={i % grid.n} y={Math.floor(i / grid.n)} width={1.05} height={1.05} fill="#0f172a" />
      ) : null)}
    </svg>
  );
}

// ---------- Step 2.5: WhatsApp OTP ----------

function OtpStep(props: {
  channel: OtpChannel;
  phone: string;
  email: string;
  sending: boolean;
  sentAt: number | null;
  otpInput: string;
  setOtpInput: (v: string) => void;
  error: string | null;
  verified: boolean;
  demoCode: string;
  onVerify: () => void;
  onResend: () => void;
  onBack: () => void;
}) {
  const { channel, phone, email, sending, sentAt, otpInput, setOtpInput,
    error, verified, demoCode, onVerify, onResend, onBack } = props;

  // Cooldown 30 detik untuk resend
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const cooldownLeft = sentAt ? Math.max(0, 30 - Math.floor((now - sentAt) / 1000)) : 0;

  const dest = channel === "whatsapp" ? phone : email;
  const masked = channel === "whatsapp" ? maskPhone(phone) : maskEmail(email);
  const channelLabel = channel === "whatsapp" ? "WhatsApp" : "Email";
  const channelIcon = channel === "whatsapp" ? "??" : "??";

  return (
    <div>
      <h1 className="text-2xl font-bold text-center">Verifikasi {channelLabel}</h1>
      <p className="text-center text-ink-500 mt-1">
        {channelIcon} Kami mengirim kode 6-digit ke <strong className="text-ink-700">{masked}</strong>
      </p>

      <div className="card mt-6 max-w-md mx-auto space-y-5">
        {/* Demo notice � production: hapus / sembunyikan */}
        {demoCode && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <strong>?? Demo mode:</strong> Kode OTP-mu{" "}
            <code className="font-mono font-bold text-amber-900 text-base bg-amber-100 px-2 py-0.5 rounded">
              {demoCode}
            </code>
            <div className="mt-1 text-[11px] leading-snug">
              OTP email di halaman pendaftaran ini masih simulasi lokal; pendaftaran akun live belum aktif.
            </div>
          </div>
        )}

        <div>
          <label className="label text-center block">Masukkan 6-digit kode</label>
          <input
            className="input text-center text-2xl font-mono tracking-[0.5em] py-3"
            value={otpInput}
            onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="������"
            disabled={verified || sending}
          />
          {error && <div className="text-xs text-danger-600 mt-2 text-center">? {error}</div>}
          {verified && <div className="text-sm text-emerald-600 mt-2 text-center font-semibold">? Terverifikasi! Lanjut ke pembayaran�</div>}
        </div>

        <button
          onClick={onVerify}
          disabled={otpInput.length !== 6 || sending || verified}
          className="btn-primary w-full text-base h-12 disabled:opacity-50"
        >
          {verified ? "? Berhasil" : sending ? "Mengirim�" : "Verifikasi Kode"}
        </button>

        <div className="text-center text-xs text-ink-500">
          Tidak menerima kode?{" "}
          {cooldownLeft > 0 ? (
            <span className="text-ink-400">Kirim ulang dalam {cooldownLeft}s</span>
          ) : (
            <button
              onClick={onResend}
              disabled={sending}
              className="text-brand-600 hover:underline font-medium disabled:opacity-50"
            >
              {sending ? "Mengirim�" : `?? Kirim ulang via ${channelLabel}`}
            </button>
          )}
        </div>
      </div>

      <div className="flex justify-between mt-6 max-w-md mx-auto">
        <button onClick={onBack} className="btn-secondary" disabled={verified}>? Kembali</button>
        <div className="text-xs text-ink-400 self-center">
          ?? Cek juga folder <em>Spam / Lainnya</em>
        </div>
      </div>
    </div>
  );
}

// ---------- Step 4: Success ----------

function SuccessStep({ slug, aptName, plan, tenantId, onGoToApp }: {
  slug: string; aptName: string; plan: Plan; tenantId: string; onGoToApp: () => void;
}) {
  const subdomain = `${slug}.${ROOT_DOMAIN}`;
  const storefrontUrl = `${window.location.origin}/store/${slug}`;

  return (
    <div>
      <div className="text-center">
        <div className="text-7xl mb-3">??</div>
        <h1 className="text-3xl font-bold">Selamat, {aptName}!</h1>
        <p className="text-ink-500 mt-2">Akun Anda sudah aktif. Trial 30 hari dimulai sekarang.</p>
      </div>

      <div className="card mt-6 bg-gradient-to-br from-brand-50 to-accent-50 border-2 border-brand-200">
        <div className="text-xs uppercase tracking-wider text-brand-700 font-semibold">?? Subdomain Apotek</div>
        <div className="font-mono font-bold text-2xl text-brand-800 mt-1 break-all">https://{subdomain}</div>
        <div className="text-xs text-ink-600 mt-1">
          Subdomain ini akan jadi storefront publik apotek Anda. Pasien bisa belanja & booking dokter dari sini.
        </div>
        <div className="mt-3 flex gap-2 flex-wrap">
          <button
            onClick={() => navigator.clipboard.writeText(`https://${subdomain}`)}
            className="btn-secondary text-xs h-8"
          >?? Salin URL</button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Apotek kami sekarang online: https://${subdomain}`)}`}
            target="_blank" rel="noreferrer"
            className="btn-secondary text-xs h-8"
          >?? Share via WA</a>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3 mt-4">
        <div className="card">
          <div className="font-semibold text-sm">?? Paket Aktif</div>
          <div className="font-bold text-lg mt-1">{plan.name}</div>
          <div className="text-xs text-ink-500">{fmtRp(plan.price)} / {plan.period}</div>
        </div>
        <div className="card">
          <div className="font-semibold text-sm">?? Tenant ID</div>
          <div className="font-mono text-xs mt-1 break-all">{tenantId}</div>
        </div>
      </div>

      <div className="card mt-4">
        <div className="font-semibold">?? Langkah Selanjutnya</div>
        <ol className="mt-3 space-y-2 text-sm text-ink-700 list-decimal list-inside">
          <li>Login ke dashboard apotek dan lengkapi profil & alamat lengkap.</li>
          <li>Tambahkan produk obat & set stok awal di menu Inventory.</li>
          <li>Tambahkan dokter praktik & jadwal di menu Dokter.</li>
          <li>Bagikan link storefront <span className="font-mono">{storefrontUrl}</span> ke pelanggan.</li>
        </ol>
      </div>

      <div className="mt-6 flex gap-2 flex-wrap justify-center">
        <button onClick={onGoToApp} className="btn-primary text-base h-12 px-8">
          ?? Buka Dashboard
        </button>
        <Link to={`/store/${slug}`} className="btn-secondary h-12 px-6 grid place-items-center">
          ??? Lihat Storefront
        </Link>
      </div>

      <div className="mt-6 text-center text-xs text-ink-500">
        ?? <strong>Catatan demo:</strong> Tenant tersimpan di localStorage browser ini.{" "}
        Untuk reset, klik tombol "Reset Data Demo" di sidebar.
      </div>
    </div>
  );
}

// ---------- Legal Modal (Terms & Privacy) ----------

function LegalModal({ kind, onClose, onAccept }: {
  kind: "terms" | "privacy"; onClose: () => void; onAccept: () => void;
}) {
  const isTerms = kind === "terms";

  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-900/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
          <h2 className="text-lg font-bold flex items-center gap-2">
            {isTerms ? "📜" : "🔒"} {isTerms ? "Syarat & Ketentuan" : "Kebijakan Privasi"} Batam Farma
          </h2>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="text-ink-400 hover:text-ink-900 text-2xl leading-none w-8 h-8 grid place-items-center rounded-lg hover:bg-surface-100"
          >�</button>
        </div>

        <div className="overflow-y-auto px-6 py-5 text-sm text-ink-700 leading-relaxed space-y-4">
          {isTerms ? <TermsContent /> : <PrivacyContent />}
        </div>

        <div className="px-6 py-4 border-t border-surface-100 bg-surface-50/50 rounded-b-2xl flex items-center justify-between gap-3">
          <div className="text-xs text-ink-500">Versi 1.0 � Berlaku sejak 1 Januari 2026</div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm px-4 py-2">Tutup</button>
            <button onClick={onAccept} className="btn-primary text-sm px-4 py-2">? Saya Setuju</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TermsContent() {
  return (
    <>
      <LegalSection title="1. Penerimaan Syarat">
        Dengan mendaftar dan menggunakan Batam Farma ("Layanan"), Anda menyetujui untuk terikat oleh Syarat &amp; Ketentuan ini.
        Jika tidak setuju, mohon tidak menggunakan Layanan.
      </LegalSection>
      <LegalSection title="2. Akun & Tanggung Jawab Pengguna">
        Anda bertanggung jawab penuh atas akurasi data apotek, izin operasional (SIA/SIPA), kerahasiaan kredensial,
        serta seluruh aktivitas yang terjadi melalui akun Anda.
      </LegalSection>
      <LegalSection title="3. Lisensi Penggunaan">
        Batam Farma memberikan lisensi terbatas, non-eksklusif, dan tidak dapat dialihkan untuk menggunakan Layanan
        sesuai paket berlangganan yang aktif.
      </LegalSection>
      <LegalSection title="4. Pembayaran & Langganan">
        Biaya berlangganan ditagih sesuai paket yang dipilih (Basic / Pro / Yearly). Free trial 30 hari pertama.
        Pembatalan dapat dilakukan kapan saja; akses tetap aktif hingga akhir periode yang sudah dibayar.
      </LegalSection>
      <LegalSection title="5. Konten & Data Apotek">
        Anda tetap memiliki seluruh data apotek, transaksi, dan konten yang Anda input. Batam Farma hanya bertindak
        sebagai penyedia infrastruktur dan dapat memproses data sesuai Kebijakan Privasi.
      </LegalSection>
      <LegalSection title="6. Larangan Penggunaan">
        Dilarang menggunakan Layanan untuk: aktivitas ilegal, distribusi obat tanpa izin, melanggar regulasi BPOM/Kemenkes,
        reverse-engineering sistem, atau merugikan tenant lain.
      </LegalSection>
      <LegalSection title="7. Batasan Tanggung Jawab">
        Layanan disediakan "as is". Batam Farma tidak bertanggung jawab atas kerugian tidak langsung,
        kehilangan keuntungan, atau gangguan operasional di luar kendali wajar (force majeure, downtime cloud).
      </LegalSection>
      <LegalSection title="8. Pengakhiran">
        Batam Farma dapat menangguhkan / mengakhiri akun yang melanggar Syarat ini, dengan notifikasi minimal 7 hari
        kecuali untuk pelanggaran berat yang dapat diakhiri segera.
      </LegalSection>
      <LegalSection title="9. Hukum yang Berlaku">
        Syarat ini diatur oleh hukum Republik Indonesia. Sengketa diselesaikan melalui musyawarah, atau jika tidak tercapai,
        di Pengadilan Negeri Jakarta Selatan.
      </LegalSection>
      <LegalSection title="10. Kontak">
        Pertanyaan: <a className="text-brand-600 underline" href="mailto:legal@pharmaos.co.id">legal@pharmaos.co.id</a>
      </LegalSection>
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <LegalSection title="1. Data yang Kami Kumpulkan">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Data akun:</strong> nama apotek, nama pemilik, email, nomor telepon, kota, alamat.</li>
          <li><strong>Data operasional:</strong> produk, batch, transaksi POS, resep, pembelian, akuntansi.</li>
          <li><strong>Data login:</strong> Google ID / email (untuk autentikasi).</li>
          <li><strong>Data teknis:</strong> log akses, IP, jenis perangkat � untuk keamanan.</li>
        </ul>
      </LegalSection>
      <LegalSection title="2. Cara Kami Menggunakan Data">
        Untuk menyediakan Layanan, autentikasi Google/Email, notifikasi pesanan Telegram jika dikonfigurasi,
        analitik internal (tanpa profiling individu), serta kepatuhan regulasi (SIPNAP, pajak).
      </LegalSection>
      <LegalSection title="3. Penyimpanan Data">
        Data disimpan di Google Cloud (Firebase) region <strong>asia-southeast2 (Jakarta)</strong>.
        Backup harian otomatis. Retensi: aktif selama langganan + 90 hari setelah pengakhiran (untuk recovery).
      </LegalSection>
      <LegalSection title="4. Pembagian Data">
        Kami <strong>TIDAK</strong> menjual data Anda. Data dibagi hanya kepada:
        <ul className="list-disc pl-5 mt-1 space-y-1">
          <li>Penyedia infrastruktur (Google Cloud) � sesuai DPA.</li>
          <li>Penyedia pembayaran hanya jika pembayaran online diaktifkan dan Anda melakukan transaksi.</li>
          <li>Telegram Bot yang dikonfigurasi tenant untuk pengiriman notifikasi.</li>
          <li>Otoritas hukum � bila ada permintaan resmi.</li>
        </ul>
      </LegalSection>
      <LegalSection title="5. Hak Anda">
        Mengakses data, meminta koreksi, ekspor (CSV/JSON), penghapusan akun &amp; data terkait,
        menarik persetujuan kapan saja melalui menu Pengaturan.
      </LegalSection>
      <LegalSection title="6. Keamanan">
        Enkripsi TLS 1.3 saat transit, AES-256 saat rest. Akses terbatas dengan role-based permission.
        Audit log untuk semua aksi sensitif (penghapusan, narkotika, dll).
      </LegalSection>
      <LegalSection title="7. Cookie & Tracking">
        Cookie esensial (session) dan analitik agregat (Firebase Analytics).
        Tidak ada tracking pihak ketiga untuk iklan.
      </LegalSection>
      <LegalSection title="8. Perubahan Kebijakan">
        Perubahan akan diumumkan via email/dashboard minimal 14 hari sebelum berlaku.
      </LegalSection>
      <LegalSection title="9. Kontak DPO">
        Data Protection Officer: <a className="text-brand-600 underline" href="mailto:privacy@pharmaos.co.id">privacy@pharmaos.co.id</a>
      </LegalSection>
    </>
  );
}

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-semibold text-ink-900 mb-1">{title}</h3>
      <div className="text-ink-600">{children}</div>
    </div>
  );
}

