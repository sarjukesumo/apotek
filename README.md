# PharmaOS AI

Platform SaaS multi-tenant untuk apotek: POS, Inventory FEFO, Marketplace, Jadwal Dokter, Subscription Midtrans, Payout IRIS otomatis, QR pickup, WhatsApp & AI Assistant.

## Struktur

```
/firebase.json, firestore.rules, firestore.indexes.json
/functions   → Cloud Functions (TypeScript, Node 20)
/web         → React + Vite + Tailwind + Framer Motion (PWA)
```

## Setup Cepat

### 1. Prerequisites
- Node.js 20+
- Firebase CLI: `npm i -g firebase-tools`
- Akun Midtrans (sandbox) + Server/Client Key
- (Opsional) IRIS Sandbox Creator/Approver Key

### 2. Install
```powershell
npm install
npm --workspace web install
npm --workspace functions install
```

### 3. Konfigurasi
- `web/.env` ← copy dari `web/.env.example`, isi konfigurasi Firebase Web (dari console).
- `functions/.env` ← copy dari `functions/.env.example`, isi credential dev.
- Buat dokumen `systemConfig/global` di Firestore (struktur ada di README di bawah). Untuk dev tanpa Secret Manager, set `serverKeyRef: "ENV:MIDTRANS_SERVER_KEY"` agar dibaca dari env file.

### 4. Jalankan emulator
```powershell
npm run emulators
npm run dev:web
```

### 5. Bootstrap Admin & Tenant
- Login Google sebagai `sarju.kesumo@gmail.com` → otomatis dideteksi sebagai admin.
- Super admin password: username `masipul` (email internal `masipul@u.batam-farma.app`, hardcoded sebagai admin di `firestore.rules` dan `web/src/lib/access.ts`). Akun Auth + dokumen `usernameAccounts/masipul` harus dibuat sekali per project (lihat bagian Login username di bawah).
- Untuk tenant: panggil `POST /api/admin/claims` dengan body:
  ```json
  { "uid": "<USER_UID>", "claims": { "tenantId": "tnt_1", "role": "OWNER" } }
  ```
  User harus logout/login ulang agar token claims diperbarui.

### 6. Login username & password aplikasi
- Provider **Email/Password** harus aktif di Firebase Authentication.
- Setiap username dipetakan ke email internal `username.<suffix acak>@u.batam-farma.app` melalui dokumen `usernameAccounts/{username}` (boleh `get` publik untuk lookup pra-login, `list` ditutup). Password hanya tersimpan di Firebase Authentication, tidak pernah di Firestore.
- Admin (menu `/admin/users`) dan Owner (menu `/app/users`) membuat akun password: akun Auth dibuat lewat app sekunder (sesi admin tidak berubah), lalu `usernameAccounts` + `userAccess` ditulis satu batch yang divalidasi Rules (Owner hanya Staf/Kasir untuk tenant sendiri).
- **Reset password** (Admin/Owner): kredensial Auth baru diterbitkan (email internal + password baru), mapping username dialihkan, dan `userAccess` lama dinonaktifkan. Akun Auth lama menjadi yatim tanpa akses.
- Kebijakan password: minimal 6 karakter, memuat huruf dan angka.

## Konfigurasi Midtrans

### Snap (frontend)
`index.html` sudah memuat snap.js sandbox. Untuk production, ganti:
```html
<script src="https://app.midtrans.com/snap/snap.js" data-client-key="<CLIENT_KEY>"></script>
```

### Webhook
Set **Payment Notification URL** di Midtrans Dashboard:
```
https://<your-domain>/api/midtrans/webhook
```
Handler:
- Selalu balas HTTP 200
- Verifikasi `signature_key = SHA512(order_id + status_code + gross_amount + ServerKey)`
- Dedupe via `sha256(rawBody)` di koleksi `webhookEvents/{dedupeKey}`
- Dispatch ke `processMidtransWebhookTask`
- Verifikasi ulang via Core API `GET /v2/{order_id}/status`

### Order ID
- Subscription: `SUB-{tenantShort}-{YYYYMM}-{plan}-{rand6}` (≤50 char)
- Marketplace: `ORD-{tenantShort}-{YYYYMMDDHHmm}-{seq4}`

### IRIS Payout
- `POST /iris/api/v1/payouts` (Creator Key)
- `POST /iris/api/v1/payouts/approve` (Approver Key) — auto bila `iris.autoApprove=true`
- Idempotency key: `payout_<tenantId>_<orderId>`
- Lock & retry via Firestore transaction (max 5 attempts, exponential backoff)

## Routing Web

| Path | Akses |
|---|---|
| `/` | Public landing |
| `/login` | Google + Email magic link |
| `/admin/*` | SaaS Admin (allowlist) |
| `/app/*` | Tenant (POS, Inventory, Orders, Verify, Subscription) |
| `/marketplace` | Aggregator semua tenant |
| `/store/:tenantSlug` | Storefront tenant |
| `/checkout` | Login wajib, lock 1 tenant per order |
| `/order/:orderId` | Status + QR pickup |

## Contoh dokumen `systemConfig/global`

```jsonc
{
  "adminAllowlist": ["sarju.kesumo@gmail.com"],
  "midtrans": {
    "isProduction": false,
    "serverKeyRef": "ENV:MIDTRANS_SERVER_KEY",
    "clientKeyRef": "ENV:MIDTRANS_CLIENT_KEY",
    "notificationUrl": "https://localhost:5173/api/midtrans/webhook",
    "platformFee": { "type": "PERCENT", "value": 2.5 }
  },
  "iris": {
    "isProduction": false,
    "creatorKeyRef": "ENV:IRIS_CREATOR_KEY",
    "approverKeyRef": "ENV:IRIS_APPROVER_KEY",
    "autoApprove": true
  },
  "qr":       { "secretRef": "ENV:QR_SECRET" },
  "whatsapp": {
    "provider": "FONNTE",
    "apiKeyRef": "ENV:WA_API_KEY",
    "senderId": "628xxxx",
    "templates": {
      "orderPaid": "Pesanan {{orderId}} sudah dibayar.",
      "subscriptionActive": "Langganan {{plan}} aktif.",
      "subscriptionReminder": "Langganan {{plan}} berakhir {{endAt}}."
    }
  },
  "featureFlags": { "marketplaceEnabled": true, "aiAssistantEnabled": false }
}
```

## Deploy

```powershell
firebase login
firebase use <project-id>
npm run deploy
```

## Catatan Keamanan

- Semua kunci sensitif HARUS di Secret Manager (production).
- Snap.js client key bersifat publik, tapi server key & IRIS key TIDAK boleh ada di frontend.
- Firestore rules: deny-by-default. Lihat `firestore.rules`.
- Webhook handler menyimpan rawBody hash untuk dedupe; tidak menerima request tanpa signature valid.
- QR menggunakan HMAC-SHA256 dengan secret server-side; verifikasi selalu di backend.

## Pilot internal D'Farma

### Katalog besar dan QA performa

- Foto produk dapat dipilih dari PC (JPG/PNG/WebP, input maksimal 5 MB). Browser merasterisasi ke JPEG maksimal 256 px dan data URL maksimal 24 KiB; disimpan pada `imageUrl` setelah Simpan Produk, tanpa bucket/upload Storage tambahan. Foto ikut cache/backup dan ukuran pembacaan katalog, sehingga tetap pantau bandwidth bila ribuan produk memiliki foto.
- Thumbnail bersama tampil pada kartu POS (112 px), keranjang (56 px) dan Inventory (80 px), dengan placeholder eksplisit jika kosong/gagal dimuat. Foto eksternal dimuat lazy dan tidak dijamin tersedia offline.
- Pencarian foto internet hanya ditampilkan untuk Owner, dipicu manual, dan mempertahankan merek/dosis/kemasan dalam query. Openverse dibatasi kandidat CC0/public domain dengan tautan sumber dan lisensi; Owner harus memeriksa serta menyetujui sebelum URL dipasang dan produk disimpan. Tidak ada pemasangan foto hasil pencarian otomatis. Kegagalan layanan/timeout ditampilkan, bukan dianggap hasil kosong.
- Produk `sampleOnly: true` selalu disimpan `active: false`, disembunyikan dari katalog POS, dan ditolak checkout online/offline. CSV mempertahankan kode/status SAMPLE/nonaktif. Harga/batch/ED contoh tidak boleh dipakai untuk penjualan; stok SAMPLE tetap ikut ringkasan inventory.
- POS menyediakan **Mode latihan (SAMPLE)** terpisah: hanya produk SAMPLE, ledger/stok simulasi di localStorage per tenant/browser dengan Web Locks, tidak memanggil checkout Firestore atau antrean sinkronisasi. Nota layar/cetak/teks diberi tanda LATIHAN dan ID `LATIHAN-...`. Reset latihan tidak mengubah database, laporan atau antrean nyata; mode kembali ke operasional saat halaman dimuat ulang.
- Tautan `/app/pos?mode=training` membuka latihan secara eksplisit; POS operasional kosong menyediakan tombol ke katalog SAMPLE. Gambar bawaan pada `public/sample-images` merupakan ilustrasi orisinal berlabel SAMPLE, bukan foto merek/kemasan sebenarnya; gunakan foto asli terverifikasi untuk produk operasional.
- Pembaruan PWA diperiksa saat aplikasi dibuka, kembali fokus/online, dan setiap lima menit saat tab terlihat. Versi baru menampilkan tombol Perbarui aplikasi; selesaikan transaksi dan simpan pekerjaan di semua tab sebelum menekannya. Tidak menghapus login, antrean offline, atau latihan lokal. Untuk tab versi lama yang belum mempunyai pemberitahuan ini, muat ulang setelah pekerjaan selesai. Halaman/rute HTML wajib revalidasi cache; aset bernama hash tetap memakai cache jangka panjang.
- Tombol nota PDF + Buka WhatsApp memerlukan nomor valid (bisa diisi setelah checkout), membuat PDF A4 lokal dengan `pdf-lib` dan canvas, meminta unduhan `Nota-{id}.pdf`, lalu membuka chat `web.whatsapp.com/send?phone=...` tanpa teks nota. Kasir memilih Lampiran > Dokumen di WhatsApp, memilih PDF unduhan, memeriksa penerima, lalu Kirim. File tidak otomatis dilampirkan/dikirim; browser dapat meminta izin unduhan/pop-up. Memakai sesi WhatsApp yang sudah login, atau scan QR jika diminta. PDF mempertahankan teks Unicode dan tanda LATIHAN/OFFLINE, dengan pagination; berupa gambar teks sehingga bukan dokumen searchable, tanpa logo. Tidak memakai gateway atau layanan berbayar. Email/Salin Teks dinonaktifkan.
- POS > Info Pelanggan memuat kontak aktif saat dibuka, mencari nama/nomor, dan mengisi nama serta nomor WA ke nota dari pelanggan yang dipilih (field `whatsapp`, atau `phone` untuk kontak lama). Kasir boleh membaca kontak tenant sendiri untuk pemilihan POS; tambah/ubah pelanggan dan pemasok dapat dilakukan Owner dan Staf, hapus/nonaktif permanen tetap hanya Owner. Kasir tidak mendapat halaman pengelolaan pelanggan. Nomor bisa diperbaiki manual sebelum membuka WhatsApp. Jika memilih pelanggan tanpa nomor, nomor sebelumnya dikosongkan.
- Print thermal mempertahankan 58/80mm; Print / Simpan PDF memakai A4 lewat dialog browser dan memerlukan pilihan Save as PDF dari pengguna. Dokumen cetak memakai kloning DOM React (bukan interpolasi HTML), tanpa inline script dan tidak menutup tab otomatis, sehingga pengguna dapat menyimpan PDF/cetak ulang. Tanda LATIHAN/OFFLINE ikut tercetak.

- POS dan Inventory menampilkan maksimal 48 produk per halaman; pencarian tetap mencakup seluruh katalog yang dimuat, bukan hanya halaman aktif.
- Selama sesi aplikasi tenant terbuka, produk/batch dibaca melalui listener Firestore bersama. Pemanggilan ulang repository memakai snapshot di memori; tidak ada lagi pemuatan penuh POS setiap lima menit atau setelah setiap checkout. Perubahan stok/harga/batch diterima lewat listener.
- HPP tetap hanya diminta untuk Owner dan tidak disertakan pada hasil repository tanpa izin HPP. Listener dan data memori dilepas saat sesi tenant ditutup; IndexedDB Firestore tetap mengikuti kebijakan cache browser.
- Pemuatan awal, buka ulang aplikasi, reconnect tertentu, tiap PC/tab, backup dan perubahan dokumen tetap dapat memakai kuota Firestore. Ini penghematan baca berulang, bukan jaminan bebas kuota atau biaya.
- Tes skala memakai 3.000 produk + 3.000 batch, 25 pembacaan ulang snapshot tanpa listener baru, dan 20 checkout berurutan. Batas regresi emulator lokal: load awal <10 detik, 25 pembacaan memori <250 ms, checkout p95 <3 detik; tes CPU mencakup pencarian katalog dan ringkasan stok. Angka ini bukan SLA internet produksi.
- QA transaksi mencakup Tunai/Debit/Transfer, diskon, stok terakhir berebut, retry request yang sama, penerimaan batch, retur pemasok, obat resep/ED, antrean offline, laporan dan backup. Uji akun nyata, printer/scanner serta internet putus-sambung pada PC apotek tetap diperlukan.

- Marketplace, katalog publik, dan checkout online ditutup pada rute aplikasi selama pilot. Cloud Functions belum menjadi dependensi POS: checkout menggunakan transaksi Firestore client yang divalidasi Rules.
- Mulai dari satu PC dengan internet aktif. `posSettings.offlineEnabled` default `false`; Owner dapat mengaktifkannya di Profil & Nota hanya setelah uji lapangan putus-sambung, reload, nota, serta rekonsiliasi lulus.
- Uji akun Google Owner/Staf/Kasir, stok masuk, penjualan empat produk, tunai kurang, diskon, stok habis, batch kedaluwarsa, retur, printer dan scanner fisik sebelum menggantikan pencatatan utama.
- Rekap penjualan bulan berjalan berlangganan seluruh baris bulan tersebut tanpa batas 200/500. Tanggal bisnis memakai Asia/Jakarta. HPP/laba belum terverifikasi untuk transaksi baru dan bukan laporan laba final.
- Jangan mengubah harga/stok atau berganti akun saat masih ada antrean offline. Dukungan dua PC yang sama-sama offline belum tersedia.
- Checkout online juga menulis intent ke antrean lokal sebelum mengirim ke server, sehingga reload setelah konfirmasi jaringan hilang masih dapat menyinkronkan intent yang sama. Ledger request immutable mencegah ID yang sama dipakai untuk keranjang berbeda; retry mengembalikan nota tersimpan tanpa mengurangi stok lagi.

### Backup manual tanpa upgrade paket

1. Tutup kasir dan hentikan semua perubahan dari seluruh PC. Sinkronkan semua transaksi offline.
2. Owner membuka Profil & Nota, lalu **Unduh backup JSON**. Pastikan unduhan benar-benar tersimpan dan jumlah dokumen masuk akal.
3. Simpan salinan di media/lokasi aman terpisah dari PC kasir dengan akses terbatas; file tidak dienkripsi oleh aplikasi dan dapat berisi data pribadi.
4. Ekspor membaca server per halaman dan bukan snapshot satu waktu. Jangan bertransaksi selama ekspor. Koleksi yang dicakup serta pengecualian dicatat dalam file.
5. Tidak mencakup akun Firebase Auth/Google, Storage/gambar, profil publik, konfigurasi global, atau antrean browser. Ini bukan pengganti backup penuh Firebase.

Pemulihan tidak disediakan sebagai tombol produksi agar tidak menimpa data secara tidak sengaja. Pengelola teknis memvalidasi `format`, `version`, `tenantId`, cakupan/path setiap record dan menghentikan penulisan, kemudian menguji pemulihan ke emulator/proyek terpisah dahulu. Nilai Firestore menggunakan codec bertipe di `web/src/lib/manualBackup.ts`; Timestamp mempertahankan nanodetik. Jangan memulihkan akses pengguna tanpa meninjau ulang peran/akun; akun Auth harus disiapkan terpisah. Ambil backup kondisi terkini, cocokkan jumlah dokumen/stok/omzet, dan minta persetujuan Owner sebelum pemulihan produksi.

Validasi regresi:

```powershell
npm run build:web
npm run build:functions
npm exec --yes --package firebase-tools@13.35.1 -- firebase emulators:exec --only firestore --project demo-apotek-operations "npm --workspace web run test:rules:run"
node --test functions\test\pos-checkout.test.cjs functions\test\pos-api.test.cjs
```

Tes repository mencakup stok, retry serentak, empat produk, pembatasan akses nota, laporan lebih dari 500 baris, serta ekspor/pemulihan backup dalam emulator. Tes HTTP backend hanya memeriksa kontrak API yang tersedia, bukan checkout client.
