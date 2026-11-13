import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/auth";
import { downloadManualBackup } from "../../lib/manualBackup";
import { getQueuedPosSales } from "../../lib/offlinePos";

type SettingsForm = {
  name: string;
  address: string;
  city: string;
  phone: string;
  whatsapp: string;
  npwp: string;
  sia: string;
  logoUrl: string;
  primaryColor: string;
  marketplaceEnabled: boolean;
  paperWidth: "58mm" | "80mm";
  receiptHeader: string;
  receiptFooter: string;
  showLogoOnReceipt: boolean;
  printerType: "THERMAL" | "BROWSER";
  scannerEnabled: boolean;
  cashDrawerEnabled: boolean;
  cashierMaxDiscountPct: number;
  offlineEnabled: boolean;
};

const DEFAULTS: SettingsForm = {
  name: "",
  address: "",
  city: "",
  phone: "",
  whatsapp: "",
  npwp: "",
  sia: "",
  logoUrl: "",
  primaryColor: "#10b981",
  marketplaceEnabled: false,
  paperWidth: "58mm",
  receiptHeader: "",
  receiptFooter: "Terima kasih telah berbelanja",
  showLogoOnReceipt: true,
  printerType: "THERMAL",
  scannerEnabled: true,
  cashDrawerEnabled: false,
  cashierMaxDiscountPct: 10,
  offlineEnabled: false,
};

export function PharmacySettings() {
  const tenantId = useAuth((state) => state.claims?.tenantId || "");
  const [form, setForm] = useState<SettingsForm>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupNotice, setBackupNotice] = useState("");

  async function backup() {
    if (!confirm("Hentikan transaksi dan perubahan data di semua PC. Pastikan antrean offline sudah tersinkron. File backup berisi data pribadi; simpan di lokasi aman. Lanjutkan?")) return;
    setBackupBusy(true);
    setBackupNotice("");
    try {
      if ((await getQueuedPosSales(tenantId)).length) throw new Error("Sinkronkan semua transaksi offline di PC ini sebelum backup.");
      const count = await downloadManualBackup(tenantId);
      setBackupNotice(`File backup ${count} dokumen disiapkan untuk diunduh. Pastikan file benar-benar tersimpan sebelum menutup halaman.`);
    } catch (backupError) {
      setError(backupError instanceof Error ? backupError.message : "Backup gagal. Jangan menganggap data sudah dicadangkan.");
    } finally { setBackupBusy(false); }
  }

  useEffect(() => {
    let active = true;
    if (!tenantId) {
      setLoading(false);
      return;
    }
    getDoc(doc(db, "tenants", tenantId)).then((snapshot) => {
      if (!active || !snapshot.exists()) return;
      const data = snapshot.data();
      const profile = data.profile || {};
      const branding = data.branding || {};
      const receipt = data.receipt || {};
      const hardware = data.hardware || {};
      const posSettings = data.posSettings || {};
      setForm({
        ...DEFAULTS,
        offlineEnabled: posSettings.offlineEnabled === true,
        name: profile.name || data.name || "",
        address: profile.address || "",
        city: profile.city || "",
        phone: profile.phone || "",
        whatsapp: profile.whatsapp || "",
        npwp: profile.npwp || "",
        sia: profile.sia || "",
        logoUrl: branding.logoUrl || "",
        primaryColor: branding.primaryColor || "#10b981",
        marketplaceEnabled: data.marketplaceEnabled === true,
        paperWidth: receipt.paperWidth === "80mm" ? "80mm" : "58mm",
        receiptHeader: receipt.header || "",
        receiptFooter: receipt.footer || DEFAULTS.receiptFooter,
        showLogoOnReceipt: receipt.showLogo !== false,
        printerType: hardware.printerType === "BROWSER" ? "BROWSER" : "THERMAL",
        scannerEnabled: hardware.scannerEnabled !== false,
        cashDrawerEnabled: hardware.cashDrawerEnabled === true,
        cashierMaxDiscountPct: Number.isFinite(posSettings.cashierMaxDiscountPct)
          ? Math.max(0, Math.min(100, posSettings.cashierMaxDiscountPct))
          : DEFAULTS.cashierMaxDiscountPct,
      });
    }).catch(() => {
      if (active) setError("Pengaturan apotek gagal dimuat.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tenantId]);

  function update<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!tenantId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const ref = doc(db, "tenants", tenantId);
      const existing = await getDoc(ref);
      const data = existing.data() || {};
      const tenantSlug = String(data.tenantSlug || tenantId);
      const publicRef = doc(db, "publicTenants", tenantSlug);
      const batch = writeBatch(db);
      batch.set(ref, {
        profile: {
          ...(data.profile || {}),
          name: form.name.trim(),
          address: form.address.trim(),
          city: form.city.trim(),
          phone: form.phone.trim(),
          whatsapp: form.whatsapp.trim(),
          npwp: form.npwp.trim(),
          sia: form.sia.trim(),
        },
        branding: {
          ...(data.branding || {}),
          logoUrl: form.logoUrl.trim(),
          primaryColor: form.primaryColor,
        },
        receipt: {
          paperWidth: form.paperWidth,
          header: form.receiptHeader.trim(),
          footer: form.receiptFooter.trim(),
          showLogo: form.showLogoOnReceipt,
        },
        hardware: {
          ...(data.hardware || {}),
          printerType: form.printerType,
          scannerEnabled: form.scannerEnabled,
          cashDrawerEnabled: form.cashDrawerEnabled,
        },
        posSettings: {
          ...(data.posSettings || {}),
          cashierMaxDiscountPct: form.cashierMaxDiscountPct,
          offlineEnabled: form.offlineEnabled,
        },
        name: form.name.trim(),
        marketplaceEnabled: form.marketplaceEnabled,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      batch.set(publicRef, {
        tenantId,
        tenantSlug,
        name: form.name.trim(),
        city: form.city.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        whatsapp: form.whatsapp.trim(),
        logoUrl: form.logoUrl.trim(),
        primaryColor: form.primaryColor,
        marketplaceEnabled: form.marketplaceEnabled,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await batch.commit();
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error && saveError.message.includes("permission")
        ? "Hanya Owner apotek yang bisa menyimpan pengaturan."
        : "Pengaturan gagal disimpan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6 text-sm text-ink-500">Memuat pengaturan…</div>;

  return (
    <form className="max-w-4xl space-y-4" onSubmit={save}>
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Pengaturan Apotek</h1>
          <p className="text-sm text-ink-500 mt-1">Profil, identitas, nota, dan perangkat tersimpan di Firebase.</p>
        </div>
        <button className="btn-primary" disabled={saving}>{saving ? "Menyimpan…" : "Simpan perubahan"}</button>
      </header>

      {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
      {saved && <p role="status" className="text-sm text-accent-700">Perubahan berhasil disimpan.</p>}

      <section className="card p-4 space-y-4">
        <h2 className="font-semibold">Profil & Branding</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Nama apotek"><input className="input w-full" required value={form.name} onChange={(event) => update("name", event.target.value)} /></Field>
          <Field label="Kota"><input className="input w-full" value={form.city} onChange={(event) => update("city", event.target.value)} /></Field>
          <Field label="Alamat"><input className="input w-full" value={form.address} onChange={(event) => update("address", event.target.value)} /></Field>
          <Field label="Telepon"><input className="input w-full" type="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} /></Field>
          <Field label="WhatsApp"><input className="input w-full" type="tel" value={form.whatsapp} onChange={(event) => update("whatsapp", event.target.value)} /></Field>
          <Field label="URL logo"><input className="input w-full" type="url" placeholder="https://…" value={form.logoUrl} onChange={(event) => update("logoUrl", event.target.value)} /></Field>
          <Field label="Warna utama">
            <div className="flex gap-2"><input aria-label="Pilih warna utama" type="color" className="h-10 w-14 rounded border border-surface-200" value={form.primaryColor} onChange={(event) => update("primaryColor", event.target.value)} /><input className="input flex-1 font-mono" value={form.primaryColor} onChange={(event) => update("primaryColor", event.target.value)} /></div>
          </Field>
          <Field label="NPWP"><input className="input w-full" value={form.npwp} onChange={(event) => update("npwp", event.target.value)} /></Field>
          <Field label="SIA"><input className="input w-full" value={form.sia} onChange={(event) => update("sia", event.target.value)} /></Field>
        </div>
        <p className="text-sm text-ink-500">Marketplace dan pembelian online dinonaktifkan selama pilot internal.</p>
        {form.logoUrl && <img src={form.logoUrl} alt="Pratinjau logo apotek" className="h-16 max-w-48 object-contain" />}
      </section>

      <section className="card p-4 space-y-4">
        <h2 className="font-semibold">Nota & Printer</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Ukuran kertas">
            <select className="input w-full" value={form.paperWidth} onChange={(event) => update("paperWidth", event.target.value as SettingsForm["paperWidth"])}>
              <option value="58mm">Thermal 58 mm (EC-POS58)</option>
              <option value="80mm">Thermal 80 mm</option>
            </select>
          </Field>
          <Field label="Mode printer">
            <select className="input w-full" value={form.printerType} onChange={(event) => update("printerType", event.target.value as SettingsForm["printerType"])}>
              <option value="THERMAL">Printer thermal</option>
              <option value="BROWSER">Cetak melalui browser</option>
            </select>
          </Field>
          <Field label="Teks header nota"><input className="input w-full" value={form.receiptHeader} onChange={(event) => update("receiptHeader", event.target.value)} placeholder="Contoh: Apotek resmi dan berizin" /></Field>
          <Field label="Teks footer nota"><input className="input w-full" value={form.receiptFooter} onChange={(event) => update("receiptFooter", event.target.value)} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.showLogoOnReceipt} onChange={(event) => update("showLogoOnReceipt", event.target.checked)} /> Tampilkan logo pada nota</label>
        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.scannerEnabled} onChange={(event) => update("scannerEnabled", event.target.checked)} /> Scanner barcode aktif</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.cashDrawerEnabled} onChange={(event) => update("cashDrawerEnabled", event.target.checked)} /> Cash drawer tersedia</label>
        </div>
        <Field label="Batas diskon Kasir (%)">
          <input className="input max-w-36" type="number" min="0" max="100" step="1" value={form.cashierMaxDiscountPct} onChange={(event) => update("cashierMaxDiscountPct", Math.max(0, Math.min(100, Number(event.target.value) || 0)))} />
        </Field>
        <p className="text-xs text-ink-500">Koneksi printer/scanner dilakukan pada perangkat kasir; ukuran dan format nota memakai setelan apotek ini. EC-POS58 menggunakan USB dan kertas 58 mm; pilih juga ukuran tersebut di driver dan dialog cetak browser.</p>
        <div className="rounded border border-surface-200 p-3 font-mono text-xs max-w-xs" style={{ borderTopColor: form.primaryColor, borderTopWidth: 3 }}>
          {form.showLogoOnReceipt && form.logoUrl && <img src={form.logoUrl} alt="" className="h-8 max-w-24 object-contain mx-auto mb-2" />}
          <div className="text-center font-bold">{form.name || "Nama Apotek"}</div>
          <div className="text-center">{form.address || "Alamat apotek"}</div>
          <hr className="my-2 border-dashed" />
          <div>{form.receiptHeader || "Pratinjau nota"}</div>
          <hr className="my-2 border-dashed" />
          <div className="text-center">{form.receiptFooter}</div>
          <div className="text-center text-ink-400 mt-2">Lebar {form.paperWidth}</div>
        </div>
      </section>
      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Pilot operasional</h2>
        <p className="text-sm text-ink-500">Mulai dengan satu PC dan internet aktif. Aktifkan transaksi offline hanya setelah uji putus-sambung, sinkronisasi, nota, dan rekonsiliasi stok di PC apotek lulus. Jangan ubah akun/harga/stok saat ada antrean offline.</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.offlineEnabled} onChange={(event) => update("offlineEnabled", event.target.checked)} /> Aktifkan transaksi offline satu PC (setelah uji lapangan)</label>
      </section>
      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Backup manual Owner</h2>
        <p className="text-sm text-ink-500">Unduh setelah tutup kasir setiap hari. Hentikan perubahan di semua PC dan sinkronkan transaksi offline terlebih dahulu. Ini ekspor data aplikasi, bukan backup Firebase Auth atau file gambar. Pemulihan harus diuji di emulator oleh pengelola teknis sebelum data produksi dipulihkan.</p>
        <button type="button" className="btn-secondary" disabled={backupBusy} onClick={() => void backup()}>{backupBusy ? "Menyiapkan backup..." : "Unduh backup JSON"}</button>
        {backupNotice && <p role="status" className="text-sm text-accent-700">{backupNotice}</p>}
      </section>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium">{label}<span className="block mt-1">{children}</span></label>;
}