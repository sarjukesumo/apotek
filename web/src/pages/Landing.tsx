import { Link } from "react-router-dom";
import { AnimatePresence, motion, useScroll, useTransform } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.2, 0.8, 0.2, 1] } },
};
const stagger = { show: { transition: { staggerChildren: 0.08 } } };

type Feature = {
  icon: string;
  title: string;
  desc: string;
  long: string;
  benefits: string[];
  sampleLabel: string;
  preview: ReactNode;
};

// ---------- Sample previews (mockup laporan / menu untuk awam) ----------
const PosPreview = () => (
  <div className="rounded-xl border border-surface-100 bg-white overflow-hidden text-xs">
    <div className="flex items-center justify-between px-3 py-2 bg-surface-50 border-b border-surface-100">
      <div className="font-semibold text-ink-900">Kasir — Transaksi #1042</div>
      <div className="text-ink-500">06 Mei 2026 · 14:32</div>
    </div>
    <div className="p-3 space-y-2">
      {[
        ["Paracetamol 500mg", "2 strip", "Rp 8.000", "EXP 2027-03"],
        ["Amoxicillin 500mg", "1 strip", "Rp 15.000", "EXP 2026-08 ⚡"],
        ["Vitamin C 1000mg", "1 botol", "Rp 45.000", "EXP 2028-01"],
      ].map((r) => (
        <div key={r[0]} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center py-1 border-b border-dashed border-surface-100 last:border-0">
          <div>
            <div className="font-medium text-ink-900">{r[0]}</div>
            <div className="text-[10px] text-ink-500">{r[3]} · batch otomatis (FEFO)</div>
          </div>
          <div className="text-ink-500">{r[1]}</div>
          <div className="font-semibold text-ink-900">{r[2]}</div>
        </div>
      ))}
      <div className="flex justify-between pt-2 text-sm font-bold">
        <span>Total</span><span className="text-brand-600">Rp 68.000</span>
      </div>
      <div className="flex gap-2 pt-1">
        <div className="flex-1 h-8 rounded-md bg-brand-500 text-white grid place-items-center text-xs font-semibold">Bayar Tunai</div>
        <div className="flex-1 h-8 rounded-md bg-surface-100 grid place-items-center text-xs">QRIS</div>
      </div>
    </div>
  </div>
);

const MarketplacePreview = () => (
  <div className="rounded-xl border border-surface-100 bg-white overflow-hidden text-xs">
    <div className="px-3 py-2 bg-surface-50 border-b border-surface-100 flex items-center gap-2">
      <span>🛒</span><span className="font-semibold">Marketplace · 3 Apotek terdekat</span>
    </div>
    <div className="p-3 grid grid-cols-3 gap-2">
      {[
        { obat: "Paracetamol 500mg", emoji: "💊", gradient: "from-brand-100 to-accent-100", apotek: "Apotek Sehat", harga: "Rp 8.000", jarak: "0.8 km" },
        { obat: "Amoxicillin 500mg", emoji: "💉", gradient: "from-accent-100 to-warn-100", apotek: "Apotek Maju", harga: "Rp 15.000", jarak: "1.2 km" },
        { obat: "Vitamin C 1000mg", emoji: "🍊", gradient: "from-warn-100 to-brand-100", apotek: "Apotek Mitra", harga: "Rp 45.000", jarak: "2.0 km" },
      ].map((p) => (
        <div key={p.apotek} className="rounded-lg border border-surface-100 p-2">
          <div className={`aspect-square rounded-md bg-gradient-to-br ${p.gradient} grid place-items-center text-2xl`}>{p.emoji}</div>
          <div className="font-semibold mt-1.5 text-[11px] leading-tight text-ink-900 line-clamp-2 min-h-[26px]">{p.obat}</div>
          <div className="text-brand-600 font-bold text-[12px] mt-0.5">{p.harga}</div>
          <div className="text-ink-700 text-[10px] mt-1 truncate">🏥 {p.apotek}</div>
          <div className="text-ink-500 text-[10px]">📍 {p.jarak}</div>
        </div>
      ))}
    </div>
    <div className="px-3 pb-3">
      <div className="h-8 rounded-md bg-brand-500 text-white grid place-items-center text-xs font-semibold">Pesan & Bayar</div>
    </div>
  </div>
);

const DoctorPreview = () => (
  <div className="rounded-xl border border-surface-100 bg-white overflow-hidden text-xs">
    <div className="px-3 py-2 bg-surface-50 border-b border-surface-100 font-semibold">📅 Dr. Anita — Jumat, 8 Mei 2026</div>
    <div className="p-3 grid grid-cols-4 gap-1.5">
      {[
        ["09:00","ok"],["09:30","full"],["10:00","ok"],["10:30","ok"],
        ["11:00","full"],["11:30","ok"],["13:00","ok"],["13:30","ok"],
      ].map(([t, s]) => (
        <div key={t} className={`h-9 rounded-md grid place-items-center font-medium ${s==="full" ? "bg-surface-100 text-ink-500 line-through" : "bg-brand-50 text-brand-700 border border-brand-200"}`}>
          {t}
        </div>
      ))}
    </div>
    <div className="px-3 pb-3 text-[11px] text-ink-500">✓ Pasien booking sendiri lewat link · konfirmasi WhatsApp otomatis</div>
  </div>
);

const PaymentPreview = () => (
  <div className="rounded-xl border border-surface-100 bg-white overflow-hidden text-xs">
    <div className="px-3 py-2 bg-surface-50 border-b border-surface-100 font-semibold">💳 Laporan Payout — Mei 2026</div>
    <div className="p-3 space-y-2">
      {[
        ["02 Mei","BCA ••3421","Rp 1.250.000","✓ Sukses"],
        ["03 Mei","BCA ••3421","Rp 980.000","✓ Sukses"],
        ["04 Mei","BCA ••3421","Rp 1.640.000","✓ Sukses"],
        ["05 Mei","BCA ••3421","Rp 2.100.000","⏳ Proses"],
      ].map((r) => (
        <div key={r[0]} className="grid grid-cols-[60px_1fr_auto_auto] gap-2 items-center py-1.5 border-b border-dashed border-surface-100 last:border-0">
          <div className="text-ink-500">{r[0]}</div>
          <div className="text-ink-700">{r[1]}</div>
          <div className="font-semibold">{r[2]}</div>
          <div className={r[3].includes("Sukses") ? "text-brand-600" : "text-warn-500"}>{r[3]}</div>
        </div>
      ))}
      <div className="flex justify-between pt-1 font-bold">
        <span>Total cair bulan ini</span><span className="text-brand-600">Rp 5.970.000</span>
      </div>
    </div>
  </div>
);

const QrPreview = () => (
  <div className="rounded-xl border border-surface-100 bg-white overflow-hidden text-xs">
    <div className="px-3 py-2 bg-surface-50 border-b border-surface-100 font-semibold">📱 QR Pickup Pesanan #ORD-7781</div>
    <div className="p-4 grid grid-cols-[auto_1fr] gap-4 items-center">
      <div className="w-28 h-28 rounded-lg bg-white p-2 border border-surface-200">
        <div className="w-full h-full" style={{
          backgroundImage: "linear-gradient(45deg, #0f172a 25%, transparent 25%), linear-gradient(-45deg, #0f172a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #0f172a 75%), linear-gradient(-45deg, transparent 75%, #0f172a 75%)",
          backgroundSize: "12px 12px",
          backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0",
        }} />
      </div>
      <div className="space-y-1.5">
        <div><span className="text-ink-500">Pelanggan:</span> <span className="font-semibold">Budi S.</span></div>
        <div><span className="text-ink-500">Item:</span> 3 produk · Rp 124.500</div>
        <div><span className="text-ink-500">Berlaku sampai:</span> <span className="font-semibold">14:45</span></div>
        <div className="inline-flex items-center gap-1 text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full text-[10px] font-semibold">🔐 Token HMAC aktif · anti-palsu</div>
      </div>
    </div>
  </div>
);

const AiPreview = () => (
  <div className="rounded-xl border border-surface-100 bg-white overflow-hidden text-xs">
    <div className="px-3 py-2 bg-surface-50 border-b border-surface-100 font-semibold">🤖 AI Assistant</div>
    <div className="p-3 space-y-2">
      <div className="flex justify-end">
        <div className="bg-brand-500 text-white rounded-2xl rounded-tr-sm px-3 py-1.5 max-w-[80%]">Berapa stok Paracetamol & kapan habis?</div>
      </div>
      <div className="flex justify-start">
        <div className="bg-surface-100 text-ink-900 rounded-2xl rounded-tl-sm px-3 py-2 max-w-[85%] space-y-1">
          <div>Saat ini stok <b>Paracetamol 500mg = 240 strip</b>.</div>
          <div>Rata-rata terjual 18 strip/hari → diperkirakan habis dalam <b>13 hari</b>.</div>
          <div className="text-brand-700">💡 Saya sarankan restock minggu depan (300 strip).</div>
        </div>
      </div>
      <div className="flex justify-end">
        <div className="bg-brand-500 text-white rounded-2xl rounded-tr-sm px-3 py-1.5">Total omzet bulan ini?</div>
      </div>
      <div className="flex justify-start">
        <div className="bg-surface-100 text-ink-900 rounded-2xl rounded-tl-sm px-3 py-2 max-w-[85%]">
          Omzet Mei 2026: <b className="text-brand-600">Rp 38.450.000</b> ▲ 14% vs April.
        </div>
      </div>
    </div>
  </div>
);

const FakturAiPreview = () => (
  <div className="rounded-xl border border-violet-200 bg-white overflow-hidden text-xs">
    <div className="px-3 py-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold flex items-center justify-between">
      <span>📸 Faktur AI — Review</span>
      <span className="text-[9px] bg-white/20 px-1.5 py-0.5 rounded uppercase">Beta</span>
    </div>
    <div className="grid grid-cols-[80px_1fr] gap-2 p-3">
      <div className="bg-ink-900 rounded grid place-items-center text-white text-2xl h-24">📄</div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5"><span className="text-[10px] text-ink-500 w-14">Supplier</span><span className="text-xs font-semibold flex-1">PT Kimia Farma</span><span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 rounded">✓ yakin</span></div>
        <div className="flex items-center gap-1.5"><span className="text-[10px] text-ink-500 w-14">No Faktur</span><span className="text-xs font-mono flex-1">INV/2026/0512</span><span className="text-[9px] bg-warn-100 text-warn-700 px-1 rounded">⚠ cek</span></div>
        <div className="flex items-center gap-1.5"><span className="text-[10px] text-ink-500 w-14">5 item</span><span className="text-xs font-semibold flex-1 text-violet-700">Rp 4.250.000</span></div>
      </div>
    </div>
    <div className="px-3 py-2 bg-emerald-50 border-t border-emerald-100 text-[10px] text-emerald-700">⚡ Hemat 8 menit vs input manual</div>
  </div>
);

const MultiHargaPreview = () => (
  <div className="rounded-xl border border-surface-100 bg-white overflow-hidden text-xs">
    <div className="px-3 py-2 bg-surface-50 border-b border-surface-100 font-semibold">🏷️ Paracetamol 500mg — Harga per Tier</div>
    <table className="w-full">
      <thead className="text-[10px] text-ink-500 bg-surface-50/60">
        <tr><th className="p-2 text-left">Tier</th><th className="p-2 text-right">Harga</th><th className="p-2 text-right">Margin</th></tr>
      </thead>
      <tbody className="divide-y divide-surface-100">
        <tr><td className="p-2">Umum</td><td className="p-2 text-right font-semibold">Rp 1.500</td><td className="p-2 text-right text-emerald-600">+50%</td></tr>
        <tr><td className="p-2">Grosir (≥10 strip)</td><td className="p-2 text-right font-semibold">Rp 1.350</td><td className="p-2 text-right text-emerald-600">+35%</td></tr>
        <tr><td className="p-2">Klinik Mitra</td><td className="p-2 text-right font-semibold">Rp 1.250</td><td className="p-2 text-right text-warn-600">+25%</td></tr>
        <tr><td className="p-2">BPJS</td><td className="p-2 text-right font-semibold">Rp 1.100</td><td className="p-2 text-right text-warn-600">+10%</td></tr>
      </tbody>
    </table>
  </div>
);

const KonsinyasiPreview = () => (
  <div className="rounded-xl border border-surface-100 bg-white overflow-hidden text-xs">
    <div className="px-3 py-2 bg-surface-50 border-b border-surface-100 font-semibold">🤝 Konsinyasi PT Mitra Sehat</div>
    <div className="p-3 space-y-2">
      <div className="flex justify-between"><span className="text-ink-500">Stok titipan</span><span className="font-semibold">120 unit</span></div>
      <div className="flex justify-between"><span className="text-ink-500">Sudah terjual</span><span className="font-semibold text-emerald-600">38 unit</span></div>
      <div className="flex justify-between"><span className="text-ink-500">Hutang dibentuk</span><span className="font-semibold text-orange-600">Rp 760.000</span></div>
      <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-[10px] text-emerald-700">💡 82 unit sisa belum jadi hutang. Cash flow aman.</div>
    </div>
  </div>
);

const SoapPreview = () => (
  <div className="rounded-xl border border-surface-100 bg-white overflow-hidden text-xs">
    <div className="px-3 py-2 bg-surface-50 border-b border-surface-100 font-semibold">📋 RME — Pasien: Budi (35th)</div>
    <div className="p-3 space-y-1.5">
      <div className="flex gap-2"><span className="font-bold text-brand-600 w-4">S</span><span>Demam 3 hari, batuk berdahak, sakit kepala.</span></div>
      <div className="flex gap-2"><span className="font-bold text-brand-600 w-4">O</span><span>TD 120/80, suhu 38.5°C, nadi 92x/m</span></div>
      <div className="flex gap-2"><span className="font-bold text-brand-600 w-4">A</span><span>ISPA dengan demam</span></div>
      <div className="flex gap-2"><span className="font-bold text-brand-600 w-4">P</span><span>Puyer Racikan-A 3x1 (5 hari)</span></div>
      <div className="bg-brand-50 border border-brand-200 rounded p-1.5 text-[10px] text-brand-700">📦 Racikan-A: PCT 250mg + CTM 2mg + GG 50mg</div>
    </div>
  </div>
);

const ParetoPreview = () => (
  <div className="rounded-xl border border-surface-100 bg-white overflow-hidden text-xs">
    <div className="px-3 py-2 bg-surface-50 border-b border-surface-100 font-semibold">📊 Analisis Pareto (ABC)</div>
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-2"><span className="bg-emerald-500 text-white font-bold w-6 h-6 rounded grid place-items-center">A</span><div className="flex-1"><div className="font-semibold">42 produk</div><div className="text-[10px] text-ink-500">80% omzet · fokus utama</div></div><span className="text-emerald-600 font-bold">Rp 30.4jt</span></div>
      <div className="flex items-center gap-2"><span className="bg-warn-500 text-white font-bold w-6 h-6 rounded grid place-items-center">B</span><div className="flex-1"><div className="font-semibold">128 produk</div><div className="text-[10px] text-ink-500">15% omzet</div></div><span className="text-warn-600 font-bold">Rp 5.7jt</span></div>
      <div className="flex items-center gap-2"><span className="bg-ink-400 text-white font-bold w-6 h-6 rounded grid place-items-center">C</span><div className="flex-1"><div className="font-semibold">317 produk</div><div className="text-[10px] text-ink-500">5% omzet · slow mover</div></div><span className="text-ink-500 font-bold">Rp 1.9jt</span></div>
    </div>
  </div>
);

const MutasiPreview = () => (
  <div className="rounded-xl border border-surface-100 bg-white overflow-hidden text-xs">
    <div className="px-3 py-2 bg-surface-50 border-b border-surface-100 font-semibold">🔄 Mutasi MUT-2026-0042</div>
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-2 text-[11px]"><span className="bg-surface-100 px-2 py-0.5 rounded">Outlet Pusat</span><span>→</span><span className="bg-brand-100 text-brand-700 px-2 py-0.5 rounded font-semibold">Cabang Bekasi</span></div>
      <div className="flex justify-between"><span className="text-ink-500">3 produk · 85 unit</span><span className="font-semibold">Rp 1.275.000</span></div>
      <div className="flex items-center gap-1.5">
        <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[10px]">✓ Request</span>
        <span className="text-ink-300">→</span>
        <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[10px]">✓ Approve</span>
        <span className="text-ink-300">→</span>
        <span className="bg-warn-100 text-warn-700 px-1.5 py-0.5 rounded text-[10px]">🚚 In-Transit</span>
        <span className="text-ink-300">→</span>
        <span className="bg-surface-100 text-ink-400 px-1.5 py-0.5 rounded text-[10px]">Received</span>
      </div>
    </div>
  </div>
);

const FEATURES: Feature[] = [
  {
    icon: "💊",
    title: "POS + Inventory FEFO",
    desc: "Penjualan cepat, batch otomatis sesuai kadaluarsa.",
    long: "Kasir digital yang otomatis pilih obat dengan kadaluarsa terdekat dulu (FEFO = First Expired First Out). Anda tidak perlu cek satu-satu — sistem yang urus, jadi obat tidak terbuang & laporan rugi minimal.",
    benefits: [
      "Scan barcode → otomatis pilih batch yang hampir kadaluarsa",
      "Cetak struk, kirim e-receipt via WhatsApp",
      "Stok berkurang real-time, tidak ada bentrok antar kasir",
      "Notifikasi otomatis kalau ada produk mau habis / mau kadaluarsa",
    ],
    sampleLabel: "Contoh layar kasir",
    preview: <PosPreview />,
  },
  {
    icon: "🛒",
    title: "Marketplace Multi-Apotek",
    desc: "Storefront per tenant + aggregator global.",
    long: "Apotek Anda otomatis punya toko online sendiri, sekaligus tampil di marketplace bersama. Pelanggan bisa cari obat, bandingkan harga & jarak, lalu pesan langsung tanpa pasang aplikasi.",
    benefits: [
      "Halaman toko otomatis dengan foto, harga, & stok terbaru",
      "Pelanggan dekat duluan yang muncul (cari berdasarkan lokasi)",
      "Bayar online (QRIS, transfer, kartu) lalu ambil di apotek",
      "Tidak ada biaya komisi tambahan dari marketplace pihak ketiga",
    ],
    sampleLabel: "Contoh tampilan marketplace",
    preview: <MarketplacePreview />,
  },
  {
    icon: "👨‍⚕️",
    title: "Jadwal & Booking Dokter",
    desc: "Slot otomatis, booking publik tanpa ribet.",
    long: "Dokter & apoteker bisa atur jam praktik, lalu pasien booking sendiri lewat link. Tidak perlu lagi catat manual atau angkat telepon — semua reminder dikirim WhatsApp otomatis.",
    benefits: [
      "Pasien lihat slot kosong & pilih sendiri",
      "Konfirmasi & pengingat H-1 lewat WhatsApp",
      "Bisa batal / reschedule mandiri (tidak ganggu staf)",
      "Riwayat kunjungan tersimpan rapi per pasien",
    ],
    sampleLabel: "Contoh halaman pilih jam",
    preview: <DoctorPreview />,
  },
  {
    icon: "💳",
    title: "Midtrans + IRIS Payout",
    desc: "Bayar via Snap, pencairan otomatis ke bank.",
    long: "Pelanggan bayar pakai semua metode (QRIS, GoPay, OVO, kartu, transfer) lewat halaman aman Midtrans. Uang masuk lalu dicairkan otomatis ke rekening apotek Anda — tidak perlu klik manual setiap hari.",
    benefits: [
      "Terima semua metode pembayaran populer di Indonesia",
      "Pencairan otomatis harian ke rekening bank Anda",
      "Laporan pemasukan & biaya admin transparan",
      "Tidak perlu rekonsiliasi manual — semua tercatat per transaksi",
    ],
    sampleLabel: "Contoh laporan pencairan",
    preview: <PaymentPreview />,
  },
  {
    icon: "📱",
    title: "QR Pickup Aman",
    desc: "Token HMAC, scan kamera mobile, anti-palsu.",
    long: "Setelah pesan online, pelanggan dapat QR code unik. Staf apotek tinggal scan pakai HP — sistem langsung verifikasi pesanan asli, sudah dibayar, dan belum pernah diambil. Tidak bisa dipalsukan.",
    benefits: [
      "QR code expired otomatis (anti screenshot lama)",
      "Tidak bisa diambil 2 kali (sekali scan langsung selesai)",
      "Scan pakai kamera HP biasa, tidak butuh alat khusus",
      "Riwayat pengambilan tercatat — siapa, kapan, oleh staf siapa",
    ],
    sampleLabel: "Contoh tiket pickup",
    preview: <QrPreview />,
  },
  {
    icon: "🤖",
    title: "AI Assistant",
    desc: "Tanya stok, payout, expiry — jawab instan.",
    long: "Tanya apa saja tentang apotek Anda pakai bahasa sehari-hari. Tidak perlu buka 5 menu untuk lihat 1 angka — cukup ketik pertanyaan, AI langsung jawab dengan data terbaru.",
    benefits: [
      "“Berapa omzet hari ini?” → langsung dapat angkanya",
      "“Obat apa yang mau habis?” → daftar + saran restock",
      "“Pasien terbanyak bulan ini?” → ranking otomatis",
      "Bisa dipakai sambil di luar apotek (mobile-friendly)",
    ],
    sampleLabel: "Contoh percakapan AI",
    preview: <AiPreview />,
  },
  {
    icon: "📸",
    title: "Faktur AI (OCR)",
    desc: "Foto faktur supplier → otomatis input GRN.",
    long: "Tidak perlu lagi mengetik ulang faktur supplier. Cukup foto, upload, sistem AI yang baca: supplier, no faktur, item, batch, ED, qty, dan HPP terisi otomatis. Anda tinggal verifikasi & posting.",
    benefits: [
      "Hemat waktu hingga 70% per faktur (5–10 menit jadi 1 menit)",
      "Auto-match ke master supplier & produk Anda",
      "Field rendah keyakinan ditandai untuk diverifikasi (anti error)",
      "Mendukung foto JPG/PNG dan PDF scan",
    ],
    sampleLabel: "Contoh upload faktur",
    preview: <FakturAiPreview />,
  },
  {
    icon: "🏷️",
    title: "Multi-Harga per Pelanggan",
    desc: "Tier harga umum / grosir / klinik / asuransi.",
    long: "Satu produk bisa punya banyak harga sekaligus. Pelanggan grosir, klinik mitra, atau pasien BPJS otomatis dapat harga sesuai tier-nya — kasir tidak perlu menghitung diskon manual.",
    benefits: [
      "Tier harga: Umum, Grosir, Klinik Mitra, Asuransi/BPJS",
      "Auto-pilih harga saat pelanggan terdaftar di tier tertentu",
      "Margin per tier ditampilkan ke kasir (anti rugi)",
      "Riwayat perubahan harga ter-audit per user",
    ],
    sampleLabel: "Contoh tabel harga",
    preview: <MultiHargaPreview />,
  },
  {
    icon: "🤝",
    title: "Konsinyasi Supplier",
    desc: "Barang titipan — bayar setelah laku.",
    long: "Kelola produk konsinyasi terpisah dari stok beli putus. Hutang ke supplier baru muncul saat barang terjual, bukan saat diterima. Cocok untuk produk baru atau alkes mahal.",
    benefits: [
      "Stok konsinyasi tampil terpisah di kartu stok",
      "AP otomatis dibuat saat penjualan, bukan saat penerimaan",
      "Laporan rekap konsinyasi per supplier per periode",
      "Retur konsinyasi tanpa potong cash flow",
    ],
    sampleLabel: "Contoh dashboard konsinyasi",
    preview: <KonsinyasiPreview />,
  },
  {
    icon: "📋",
    title: "RME SOAP + Racikan",
    desc: "Rekam medis Permenkes + template puyer/sirup.",
    long: "Rekam medis elektronik format SOAP (Subjective/Objective/Assessment/Plan) sesuai Permenkes. Apoteker simpan resep racikan reusable — sekali bikin, pakai berkali-kali tanpa input ulang komposisi.",
    benefits: [
      "Format SOAP standar Permenkes 24/2022",
      "Template racikan (puyer, kapsul, sirup) auto-pecah komponen",
      "Riwayat resep & konseling per pasien tersimpan",
      "Print/share PDF ke pasien lewat WhatsApp",
    ],
    sampleLabel: "Contoh form SOAP",
    preview: <SoapPreview />,
  },
  {
    icon: "📊",
    title: "Dashboard + Pareto ABC",
    desc: "Dashboard terpisah penjualan, beli, persediaan.",
    long: "Bukan satu dashboard penuh chart yang bingung — tapi 4 dashboard fokus: Umum, Pembelian, Penjualan, dan Persediaan. Plus analisis Pareto ABC untuk fokus ke 20% produk yang menghasilkan 80% omzet.",
    benefits: [
      "Dashboard Penjualan: jam sibuk, top kasir, top produk",
      "Dashboard Persediaan: turnover, slow-mover, dead stock",
      "Analisis Pareto ABC otomatis (kelas A/B/C)",
      "Peringatan margin tipis & produk berpotensi rugi",
    ],
    sampleLabel: "Contoh analisis ABC",
    preview: <ParetoPreview />,
  },
  {
    icon: "🔄",
    title: "Workflow Mutasi Antar Outlet",
    desc: "Request → approve → kirim, terlacak penuh.",
    long: "Outlet kekurangan stok bisa request mutasi ke outlet lain. Outlet pengirim approve & kirim, sistem catat in-transit. Master produk & harga tetap sinkron antar outlet.",
    benefits: [
      "Alur request → approve → in-transit → received",
      "Central catalog: master produk berbagi antar outlet",
      "Laporan saldo antar outlet & nilai mutasi per periode",
      "Notifikasi WhatsApp ke PIC outlet penerima",
    ],
    sampleLabel: "Contoh permintaan mutasi",
    preview: <MutasiPreview />,
  },
];

function FeatureModal({ feature, onClose }: { feature: Feature; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-ink-900/60 backdrop-blur-sm grid place-items-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
      >
        <button
          onClick={onClose}
          aria-label="Tutup"
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-surface-100 hover:bg-surface-200 grid place-items-center text-ink-700 transition-colors z-10"
        >✕</button>
        <div className="p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="text-4xl shrink-0">{feature.icon}</div>
            <div>
              <h3 className="text-2xl font-bold">{feature.title}</h3>
              <p className="text-ink-500 mt-1">{feature.desc}</p>
            </div>
          </div>

          <p className="mt-5 text-ink-700 leading-relaxed">{feature.long}</p>

          <div className="mt-6 grid md:grid-cols-2 gap-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">Manfaat untuk Anda</div>
              <ul className="space-y-2 text-sm">
                {feature.benefits.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <span className="text-brand-500 mt-0.5 shrink-0">✓</span><span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">{feature.sampleLabel}</div>
              <div className="rounded-2xl bg-surface-50 p-3 border border-surface-100">
                {feature.preview}
              </div>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/signup" className="btn-primary h-11 px-5">🚀 Coba Gratis 30 Hari</Link>
            <Link to="/demo" className="btn-secondary h-11 px-5 border-warn-300 text-warn-700 bg-warn-50 hover:bg-warn-100">🎬 Lihat Demo Live</Link>
            <button onClick={onClose} className="btn-secondary h-11 px-5">Tutup</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

const PLANS = [
  {
    code: "BASIC", name: "Basic", price: "99rb", period: "/bulan",
    tagline: "Untuk apotek baru",
    features: [
      "1 cabang · 2 user kasir",
      "POS + Inventory FEFO + ED warning",
      "Tunda penjualan & retur",
      "Shift jaga + selisih kas otomatis",
      "Kartu stok digital",
      "Notifikasi WhatsApp dasar",
      "Hingga 500 produk",
    ],
    cta: "Mulai Basic",
  },
  {
    code: "PRO", name: "Pro", price: "249rb", period: "/bulan", popular: true,
    tagline: "Paling populer",
    features: [
      "1 cabang + multi user (unlimited)",
      "Faktur AI (OCR upload) — hemat 70% waktu",
      "Multi-harga (umum/grosir/klinik/asuransi)",
      "Konsinyasi + supplier returns",
      "Resep & RME SOAP + template racikan",
      "Marketplace + QR pickup + payout IRIS",
      "AI Assistant + forecast + anomaly",
      "Dashboard Pembelian/Penjualan/Persediaan",
      "Analisis Pareto ABC + margin alert",
      "Jadwal Dokter + Telemedicine lite",
      "Loyalty, Promo Engine, Klaim BPJS",
    ],
    cta: "Pilih Pro",
  },
  {
    code: "YEARLY", name: "Yearly", price: "2.49jt", period: "/tahun",
    tagline: "Hemat 17%",
    features: [
      "Semua fitur Pro (unlimited produk)",
      "Multi-outlet + workflow mutasi (request/approve)",
      "Central catalog antar outlet",
      "Audit trail + permission matrix + 2FA",
      "Webhook & API integrasi",
      "Hardware mode (barcode/thermal/cash drawer)",
      "Priority support + onboarding manual",
      "Backup harian + export Excel/PDF",
    ],
    cta: "Bayar Tahunan",
  },
];

function Header() {
  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.4 }}
      className="sticky top-0 z-40 backdrop-blur bg-white/70 border-b border-surface-100"
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-brand-600 text-lg">
          <span className="w-8 h-8 rounded-xl bg-brand-500 text-white grid place-items-center">P</span>
          Batam Farma
        </Link>
        <nav className="hidden md:flex gap-7 text-sm text-ink-700">
          <a href="#fitur" className="hover:text-brand-600">Fitur</a>
          <a href="#harga" className="hover:text-brand-600">Harga</a>
          <a href="#faq" className="hover:text-brand-600">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/demo" className="hidden sm:inline-flex btn-secondary h-9 border-warn-300 text-warn-700 bg-warn-50 hover:bg-warn-100">🎬 Demo</Link>
          <Link to="/login" className="btn-secondary h-9">Masuk</Link>
          <Link to="/signup" className="btn-primary h-9">Free Trial</Link>
        </div>
      </div>
    </motion.header>
  );
}

function HeroVisual() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="relative"
    >
      <motion.div
        className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-brand-500/20 to-accent-500/20 blur-2xl"
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 4, repeat: Infinity }}
      />
      <div className="relative bg-white rounded-3xl shadow-2xl border border-surface-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-3 h-3 rounded-full bg-danger-500" />
          <div className="w-3 h-3 rounded-full bg-warn-500" />
          <div className="w-3 h-3 rounded-full bg-brand-500" />
          <div className="ml-2 text-xs text-ink-500 font-mono">app.batam-farma.web.app/dashboard</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <motion.div
            className="card !p-4 bg-gradient-to-br from-brand-500 to-brand-600 text-white !shadow-none"
            initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}
          >
            <div className="text-xs opacity-80">Penjualan Hari Ini</div>
            <motion.div
              className="text-2xl font-bold mt-1"
              initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ delay: 0.6, type: "spring" }}
            >
              Rp 4.250.000
            </motion.div>
            <div className="text-xs mt-1 opacity-80">▲ 12% vs kemarin</div>
          </motion.div>
          <motion.div
            className="card !p-4 !shadow-none border border-surface-100"
            initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }}
          >
            <div className="text-xs text-ink-500">Pesanan Marketplace</div>
            <div className="text-2xl font-bold mt-1">37</div>
            <div className="text-xs text-brand-600 mt-1">+8 baru</div>
          </motion.div>
          <motion.div
            className="col-span-2 card !p-4 !shadow-none border border-surface-100"
            initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }}
          >
            <div className="flex justify-between text-xs text-ink-500">
              <span>Stok 7 Hari</span><span>FEFO Aktif ✓</span>
            </div>
            <div className="mt-3 flex items-end gap-1.5 h-20">
              {[40, 65, 50, 80, 70, 90, 75].map((h, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{ delay: 0.7 + i * 0.05, duration: 0.6, ease: "easeOut" }}
                  className="flex-1 rounded-t-md bg-gradient-to-t from-brand-500 to-accent-500"
                />
              ))}
            </div>
          </motion.div>
          <motion.div
            className="col-span-2 card !p-4 !shadow-none border border-surface-100 flex items-center gap-3"
            initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.8 }}
          >
            <div className="w-10 h-10 rounded-xl bg-accent-500/10 grid place-items-center">🤖</div>
            <div className="text-sm">
              <div className="font-medium">AI: 3 produk akan habis dalam 2 hari.</div>
              <div className="text-ink-500 text-xs">Rekomendasi: restock Paracetamol, Amoxicillin, Vitamin C.</div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full bg-brand-500/20 blur-3xl"
        animate={{ x: [0, 60, 0], y: [0, 30, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-10 -right-24 w-[420px] h-[420px] rounded-full bg-accent-500/20 blur-3xl"
        animate={{ x: [0, -40, 0], y: [0, 40, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-24 md:pt-24 md:pb-32 grid md:grid-cols-2 gap-10 items-center">
        <motion.div initial="hidden" animate="show" variants={stagger}>
          <motion.div variants={fadeUp} className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 px-3 py-1 rounded-full text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
            🎉 Free Trial 30 Hari — tanpa kartu kredit
          </motion.div>
          <motion.h1 variants={fadeUp} className="mt-5 text-4xl md:text-6xl font-bold tracking-tight leading-tight">
            Sistem Apotek Modern.<br />
            <span className="bg-gradient-to-r from-brand-600 via-brand-500 to-accent-500 bg-clip-text text-transparent">
              Cerdas. Otomatis.
            </span>
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-5 text-ink-500 text-lg">
            POS, Inventory FEFO, Marketplace, Jadwal Dokter, pembayaran Midtrans, dan AI Assistant — satu platform untuk seluruh apotek Anda.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-3">
            <Link to="/signup" className="btn-primary text-base h-12 px-6 shadow-lg shadow-brand-500/20">
              🚀 Mulai Free Trial 30 Hari
            </Link>
            <a href="#harga" className="btn-secondary h-12 px-6">Lihat Harga</a>
          </motion.div>
          <motion.div variants={fadeUp} className="mt-4 text-sm text-ink-500">
            ✓ Data tetap tersimpan & bisa dilanjutkan setelah trial &nbsp;·&nbsp; ✓ Tanpa setup biaya &nbsp;·&nbsp; ✓ Cancel kapan saja
          </motion.div>

          <motion.div variants={fadeUp} className="mt-8 grid grid-cols-3 gap-4 max-w-md">
            {[["500+","Apotek"],["50rb+","Transaksi/hari"],["99.9%","Uptime"]].map(([n,l]) => (
              <div key={l} className="text-center">
                <div className="text-2xl font-bold text-brand-600">{n}</div>
                <div className="text-xs text-ink-500">{l}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        <HeroVisual />
      </div>
    </section>
  );
}

function Features() {
  const [active, setActive] = useState<Feature | null>(null);
  return (
    <section id="fitur" className="py-20 bg-surface-50">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="text-center max-w-2xl mx-auto"
        >
          <div className="badge bg-brand-50 text-brand-700">Fitur Lengkap</div>
          <h2 className="text-3xl md:text-4xl font-bold mt-3">Semua yang Apotek Anda Butuhkan</h2>
          <p className="text-ink-500 mt-2">Dari kasir sampai laporan, marketplace sampai AI — terintegrasi penuh.</p>
          <p className="text-xs text-ink-500 mt-2">👆 Klik kartu untuk lihat detail & contoh tampilan</p>
        </motion.div>

        <motion.div
          initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={stagger}
          className="grid md:grid-cols-3 gap-4 mt-12"
        >
          {FEATURES.map((f) => (
            <motion.button
              key={f.title} variants={fadeUp}
              type="button"
              onClick={() => setActive(f)}
              whileHover={{ y: -6, transition: { duration: 0.2 } }}
              className="card cursor-pointer text-left hover:ring-2 hover:ring-brand-500/40 transition-all group"
            >
              <div className="text-3xl">{f.icon}</div>
              <div className="font-bold text-lg mt-3">{f.title}</div>
              <div className="text-ink-500 text-sm mt-1">{f.desc}</div>
              <div className="text-brand-600 text-xs font-semibold mt-3 inline-flex items-center gap-1 opacity-70 group-hover:opacity-100">
                Lihat detail <span className="transition-transform group-hover:translate-x-1">→</span>
              </div>
            </motion.button>
          ))}
        </motion.div>
      </div>

      <AnimatePresence>
        {active && <FeatureModal feature={active} onClose={() => setActive(null)} />}
      </AnimatePresence>
    </section>
  );
}

function Pricing() {
  return (
    <section id="harga" className="py-20 relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="text-center max-w-2xl mx-auto"
        >
          <div className="badge bg-brand-50 text-brand-700">Harga Transparan</div>
          <h2 className="text-3xl md:text-4xl font-bold mt-3">Pilih Paket yang Pas</h2>
          <p className="text-ink-500 mt-2">
            Mulai gratis 30 hari. <span className="font-semibold text-ink-900">Data Anda tetap aman</span> — semua produk, transaksi, & pelanggan otomatis tersimpan dan bisa dilanjutkan setelah upgrade.
          </p>
        </motion.div>

        <motion.div
          initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={stagger}
          className="grid md:grid-cols-3 gap-5 mt-12"
        >
          {PLANS.map((p) => (
            <motion.div
              key={p.code} variants={fadeUp}
              whileHover={{ y: -6 }}
              className={`card relative ${p.popular ? "ring-2 ring-brand-500 md:scale-[1.03]" : ""}`}
            >
              {p.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                  ⭐ POPULER
                </div>
              )}
              <div className="text-sm text-ink-500">{p.tagline}</div>
              <div className="text-2xl font-bold mt-1">{p.name}</div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">Rp {p.price}</span>
                <span className="text-ink-500">{p.period}</span>
              </div>
              <ul className="mt-5 space-y-2 text-sm">
                {p.features.map((f) => {
                  const isNew = /Faktur AI|Multi-harga|Konsinyasi|RME SOAP|Pareto|Shift jaga|workflow mutasi|Kartu stok/i.test(f);
                  return (
                    <li key={f} className="flex items-start gap-2">
                      <span className="text-brand-500 mt-0.5">✓</span>
                      <span className="flex-1">
                        {f}
                        {isNew && <span className="ml-1.5 text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold uppercase">Baru</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <Link
                to={`/signup?plan=${p.code}`}
                className={`mt-6 w-full ${p.popular ? "btn-primary" : "btn-secondary"}`}
              >
                {p.cta}
              </Link>
              <div className="text-xs text-ink-500 text-center mt-3">Free trial 30 hari · Cancel kapan saja</div>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
          className="mt-12 relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-500 text-white p-8 md:p-12"
        >
          <motion.div
            aria-hidden
            className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white/10 blur-3xl"
            animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 6, repeat: Infinity }}
          />
          <div className="relative grid md:grid-cols-[1fr_auto] gap-6 items-center">
            <div>
              <div className="text-sm opacity-80">🎁 Spesial untuk Apotek Baru</div>
              <h3 className="text-3xl md:text-4xl font-bold mt-2">Coba Gratis 30 Hari Penuh</h3>
              <p className="mt-3 opacity-90 max-w-xl">
                Akses semua fitur Pro tanpa biaya. <strong>Data Anda tetap tersimpan</strong> selama 14 hari setelah trial — Anda bisa langsung melanjutkan dengan upgrade kapan saja tanpa kehilangan satu transaksi pun.
              </p>
            </div>
            <Link to="/signup" className="bg-white text-brand-700 hover:bg-surface-50 btn h-14 px-8 text-base font-bold shadow-xl whitespace-nowrap">
              Mulai Trial Sekarang →
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function FAQ() {
  const items = [
    { q: "Apa yang terjadi setelah trial 30 hari berakhir?", a: "Akun beralih ke mode read-only. Semua data Anda (produk, stok, transaksi, pelanggan) tetap aman tersimpan hingga 14 hari. Setelah upgrade ke paket berbayar, semua data otomatis aktif kembali tanpa perlu setup ulang." },
    { q: "Apakah perlu kartu kredit untuk trial?", a: "Tidak. Anda hanya perlu daftar dengan akun Google. Tidak ada biaya tersembunyi." },
    { q: "Bisakah pindah paket?", a: "Bisa. Upgrade/downgrade kapan saja, perhitungan prorata otomatis." },
    { q: "Bagaimana dengan keamanan data?", a: "Data dienkripsi end-to-end di Firestore, backup harian, akses berbasis role tenant. Compliant dengan UU PDP Indonesia." },
  ];
  return (
    <section id="faq" className="py-20 bg-surface-50">
      <div className="max-w-3xl mx-auto px-6">
        <motion.h2
          initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="text-3xl md:text-4xl font-bold text-center"
        >Pertanyaan Umum</motion.h2>
        <div className="mt-8 space-y-3">
          {items.map((it, i) => (
            <motion.details
              key={it.q}
              initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="card group"
            >
              <summary className="cursor-pointer font-medium flex items-center justify-between">
                {it.q}
                <span className="text-brand-500 transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-ink-500 text-sm leading-relaxed">{it.a}</p>
            </motion.details>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
        className="max-w-4xl mx-auto px-6 text-center"
      >
        <h2 className="text-3xl md:text-5xl font-bold">Siap modernisasi apotek Anda?</h2>
        <p className="text-ink-500 mt-3 text-lg">Setup &lt; 5 menit. Tanpa kartu kredit. Data aman selamanya.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/signup" className="btn-primary text-base h-12 px-8 shadow-lg shadow-brand-500/30">
            🚀 Mulai Free Trial 30 Hari
          </Link>
          <Link to="/demo" className="btn-secondary h-12 px-6 border-warn-300 text-warn-700 bg-warn-50 hover:bg-warn-100">
            🎬 Lihat Demo Live
          </Link>
        </div>
      </motion.div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-surface-100 py-10 text-center text-sm text-ink-500">
      <div>© 2026 Batam Farma · Made with 💚 in Indonesia</div>
    </footer>
  );
}

export function Landing() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref });
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <div ref={ref} className="min-h-screen bg-white">
      <motion.div style={{ scaleX }} className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-500 to-accent-500 origin-left z-50" />
      <Header />
      <Hero />
      <Features />
      <Pricing />
      <FAQ />
      <CTA />
      <Footer />
    </div>
  );
}
