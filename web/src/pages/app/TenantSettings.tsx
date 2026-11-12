import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { useDemoStore, type DemoTenant } from "../../lib/demoStore";
import { Link } from "react-router-dom";
import { LocationPicker } from "../../components/LocationPicker";

const BANKS = ["BCA", "Mandiri", "BNI", "BRI", "Permata", "CIMB Niaga", "Danamon", "OCBC NISP"];

export function TenantSettings() {
  const tenantId = useAuth((s) => s.claims?.tenantId) ?? "";
  const tenant = useDemoStore((s) => s.tenants.find((t) => t.id === tenantId));
  const upsertTenant = useDemoStore((s) => s.upsertTenant);

  const [form, setForm] = useState<DemoTenant | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (tenant) setForm({ ...tenant });
  }, [tenant?.id]);

  if (!form) {
    return (
      <div className="card text-center py-12">
        <div className="text-5xl mb-3">🏥</div>
        <div className="font-semibold">Profil apotek belum dibuat</div>
        <div className="text-sm text-ink-500 mt-1">Tenant <span className="font-mono">{tenantId}</span> belum terdaftar di demo store.</div>
      </div>
    );
  }

  function update<K extends keyof DemoTenant>(k: K, v: DemoTenant[K]) {
    setForm((cur) => (cur ? { ...cur, [k]: v } : cur));
  }
  function updateBank<K extends keyof DemoTenant["bank"]>(k: K, v: DemoTenant["bank"][K]) {
    setForm((cur) => (cur ? { ...cur, bank: { ...cur.bank, [k]: v } } : cur));
  }

  function save() {
    if (!form) return;
    upsertTenant(form);
    setSavedAt(Date.now());
    window.setTimeout(() => setSavedAt(null), 2500);
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">⚙️ Pengaturan Apotek</h1>
          <p className="text-ink-500 text-sm mt-1">
            Branding, alamat, dan rekening pencairan. Perubahan langsung tampil di <Link to={`/store/${form.slug}`} className="text-brand-600 underline">Storefront publik</Link>.
          </p>
        </div>
        {savedAt && <div className="text-sm text-brand-600 font-medium">✓ Tersimpan</div>}
      </div>

      {/* Brand preview */}
      <div className="card mt-5 flex items-center gap-4">
        <div
          className="w-20 h-20 rounded-2xl grid place-items-center text-4xl shrink-0"
          style={{ backgroundColor: form.primaryColor + "20", color: form.primaryColor }}
        >{form.logoEmoji}</div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-lg truncate">{form.name}</div>
          <div className="text-sm text-ink-500">{form.address}</div>
          <div className="text-xs text-ink-500 mt-1">📞 {form.phone} · 💬 {form.whatsapp} · 📍 {form.distanceKm} km · ⭐ {form.rating}</div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-xs px-2 py-1 rounded-full ${form.marketplaceEnabled ? "bg-brand-50 text-brand-700" : "bg-surface-100 text-ink-500"}`}>
            {form.marketplaceEnabled ? "✓ Tampil di Marketplace" : "Tidak tampil di Marketplace"}
          </div>
        </div>
      </div>

      {/* Branding */}
      <div className="card mt-4">
        <h2 className="font-semibold text-lg">🎨 Branding</h2>
        <div className="grid md:grid-cols-2 gap-4 mt-3">
          <div>
            <label className="label">Nama Apotek</label>
            <input className="input" value={form.name} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div>
            <label className="label">URL Slug</label>
            <input className="input font-mono text-sm" value={form.slug} onChange={(e) => update("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} />
            <div className="text-xs text-ink-500 mt-1">/store/{form.slug}</div>
          </div>
          <div>
            <label className="label">Logo (emoji)</label>
            <input className="input text-2xl" maxLength={2} value={form.logoEmoji} onChange={(e) => update("logoEmoji", e.target.value)} />
          </div>
          <div>
            <label className="label">Warna utama</label>
            <div className="flex gap-2">
              <input type="color" className="h-10 w-14 rounded border border-surface-200" value={form.primaryColor} onChange={(e) => update("primaryColor", e.target.value)} />
              <input className="input flex-1 font-mono" value={form.primaryColor} onChange={(e) => update("primaryColor", e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* Kontak & Lokasi */}
      <div className="card mt-4">
        <h2 className="font-semibold text-lg">📍 Kontak & Lokasi</h2>
        <div className="grid md:grid-cols-2 gap-4 mt-3">
          <div className="md:col-span-2">
            <label className="label">Alamat lengkap</label>
            <input className="input" value={form.address} onChange={(e) => update("address", e.target.value)} />
          </div>
          <div>
            <label className="label">Kota</label>
            <input className="input" value={form.city} onChange={(e) => update("city", e.target.value)} />
          </div>
          <div>
            <label className="label">Jarak dari pusat (km, untuk demo)</label>
            <input type="number" step="0.1" min="0.1" className="input" value={form.distanceKm}
              onChange={(e) => update("distanceKm", parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <label className="label">Telepon</label>
            <input className="input" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          </div>
          <div>
            <label className="label">WhatsApp</label>
            <input className="input" value={form.whatsapp} onChange={(e) => update("whatsapp", e.target.value)} />
          </div>
        </div>

        {/* Map picker */}
        <div className="mt-5 pt-4 border-t border-surface-100">
          <label className="label flex items-center justify-between">
            <span>🗺️ Titik lokasi di peta</span>
            <span className="text-[11px] text-ink-400 font-normal">
              Akurasi alamat untuk pengantaran & navigasi pelanggan
            </span>
          </label>
          <div className="mt-2">
            <LocationPicker
              lat={form.lat}
              lng={form.lng}
              address={form.address}
              onChange={(la, lo, addr) => {
                setForm((cur) => cur ? {
                  ...cur,
                  lat: la,
                  lng: lo,
                  // Only auto-update address if user didn't customize it (or it's empty)
                  address: addr && (!cur.address || cur.address === tenant?.address) ? addr : cur.address,
                } : cur);
              }}
            />
          </div>
        </div>
      </div>

      {/* Legal */}
      <div className="card mt-4">
        <h2 className="font-semibold text-lg">📄 Legalitas</h2>
        <div className="grid md:grid-cols-2 gap-4 mt-3">
          <div>
            <label className="label">NPWP</label>
            <input className="input font-mono" placeholder="XX.XXX.XXX.X-XXX.XXX" value={form.npwp ?? ""} onChange={(e) => update("npwp", e.target.value)} />
          </div>
          <div>
            <label className="label">SIA (Surat Ijin Apotek)</label>
            <input className="input font-mono" value={form.sia ?? ""} onChange={(e) => update("sia", e.target.value)} />
          </div>
        </div>
      </div>

      {/* Bank Account */}
      <div className="card mt-4 border-2 border-brand-100">
        <div className="flex items-start gap-2">
          <h2 className="font-semibold text-lg">🏦 Rekening Pencairan (IRIS Payout)</h2>
        </div>
        <p className="text-xs text-ink-500 mt-1">
          Hasil penjualan marketplace akan dicairkan otomatis ke rekening ini setelah dipotong fee platform.
        </p>
        <div className="grid md:grid-cols-3 gap-4 mt-3">
          <div>
            <label className="label">Bank</label>
            <select className="input" value={form.bank.bankName} onChange={(e) => updateBank("bankName", e.target.value)}>
              {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Nomor Rekening</label>
            <input className="input font-mono" value={form.bank.accountNumber} onChange={(e) => updateBank("accountNumber", e.target.value.replace(/\D/g, ""))} />
          </div>
          <div>
            <label className="label">Atas Nama</label>
            <input className="input uppercase" value={form.bank.accountHolder} onChange={(e) => updateBank("accountHolder", e.target.value)} />
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-surface-50 p-3 text-xs text-ink-500 border border-surface-100">
          <strong className="text-ink-900">⚠ Verifikasi rekening:</strong> Sistem akan transfer Rp 1 untuk validasi nama. Pastikan atas nama sesuai dokumen badan usaha (PT/CV) atau perorangan pemilik SIA.
        </div>
      </div>

      {/* Marketplace toggle */}
      <div className="card mt-4">
        <h2 className="font-semibold text-lg">🛍️ Marketplace</h2>
        <label className="mt-3 flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 w-5 h-5 accent-brand-500"
            checked={form.marketplaceEnabled}
            onChange={(e) => update("marketplaceEnabled", e.target.checked)}
          />
          <div>
            <div className="font-medium">Tampilkan apotek ini di Marketplace publik</div>
            <div className="text-xs text-ink-500 mt-0.5">Jika dimatikan, semua produk dari apotek ini disembunyikan dari pencarian publik. Stok internal tetap berjalan.</div>
          </div>
        </label>
      </div>

      {/* Actions */}
      <div className="sticky bottom-0 bg-surface-50/95 backdrop-blur border-t border-surface-100 mt-6 -mx-6 px-6 py-4 flex gap-3">
        <button className="btn-primary px-6" onClick={save}>💾 Simpan Perubahan</button>
        <button className="btn-secondary" onClick={() => tenant && setForm({ ...tenant })}>↩ Batalkan</button>
        <div className="flex-1" />
      </div>
    </div>
  );
}

// Quick-link cards to dedicated User & Doctor pages.
// Kept here (not in dedicated forms) so Settings stays a single-purpose page
// while still being discoverable for "tambah dokter / karyawan" intent.
function TeamShortcuts({ tenantId }: { tenantId: string }) {
  const users = useDemoStore((s) => s.users.filter((u) => u.tenantId === tenantId));
  const apoteker = users.filter((u) => u.role === "APOTEKER" && u.active).length;
  const kasir = users.filter((u) => u.role === "KASIR" && u.active).length;
  const staff = users.filter((u) => u.role === "STAFF" && u.active).length;
  const total = users.filter((u) => u.active).length;

  return (
    <div className="card mt-4">
      <h2 className="font-semibold text-lg">👥 Tim & Layanan</h2>
      <p className="text-xs text-ink-500 mt-1">
        Kelola dokter dan karyawan apotek dari halaman khusus berikut.
      </p>
      <div className="grid md:grid-cols-2 gap-3 mt-3">
        {/* Karyawan */}
        <Link
          to="../users"
          className="rounded-2xl border border-surface-200 hover:border-brand-300 hover:bg-brand-50/30 p-4 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div className="text-3xl">👨‍💼</div>
            <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">{total} aktif</span>
          </div>
          <div className="font-semibold mt-2 group-hover:text-brand-700">Karyawan & Role</div>
          <div className="text-xs text-ink-500 mt-1">
            {apoteker} Apoteker · {kasir} Kasir · {staff} Staff
          </div>
          <div className="text-xs text-brand-600 mt-2 font-medium">+ Tambah karyawan →</div>
        </Link>

        {/* Dokter */}
        <Link
          to="../doctor"
          className="rounded-2xl border border-surface-200 hover:border-accent-300 hover:bg-accent-50/30 p-4 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div className="text-3xl">👨‍⚕️</div>
            <span className="text-xs bg-accent-100 text-accent-700 px-2 py-0.5 rounded-full font-medium">Layanan</span>
          </div>
          <div className="font-semibold mt-2 group-hover:text-accent-700">Dokter Praktik</div>
          <div className="text-xs text-ink-500 mt-1">
            Atur jadwal & profil dokter yang praktik di apotek ini.
          </div>
          <div className="text-xs text-accent-700 mt-2 font-medium">+ Tambah dokter →</div>
        </Link>
      </div>
    </div>
  );
}
