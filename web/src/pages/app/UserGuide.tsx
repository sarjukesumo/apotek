import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth";

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

type GuidePreviewKind = "owner-access" | "staff-return" | "cashier-payment";
type GuideSection = { title: string; steps: string[]; link?: { to: string; label: string }; preview?: GuidePreviewKind };

type Tutorial = {
  title: string;
  image: string;
  alt: string;
  image2?: string;
  alt2?: string;
  intro?: string;
  steps: string[];
  tip?: string;
  roles: Array<"OWNER" | "STAFF" | "CASHIER">;
  link?: { to: string; label: string };
};

const tutorials: Tutorial[] = [
  {
    title: "1. Membuka aplikasi dan masuk (login)",
    image: "/guide/01-login.png",
    alt: "Halaman login dengan kolom Username dan Password",
    intro: "Lakukan ini setiap kali mulai bekerja.",
    steps: [
      "Nyalakan komputer, lalu buka browser internet (Chrome atau Edge — ikonnya bulat warna-warni atau biru).",
      "Klik kolom alamat di bagian paling atas browser, ketik: batam-farma.web.app lalu tekan tombol Enter di keyboard.",
      "Muncul halaman seperti gambar di bawah. Pastikan tombol \"Username\" yang berwarna putih/aktif (biasanya sudah otomatis).",
      "Klik kotak di bawah tulisan Username, lalu ketik username pemberian Owner/Admin. Gunakan huruf kecil semua, tanpa spasi.",
      "Klik kotak di bawah tulisan Password, lalu ketik password Anda. Klik tulisan \"Lihat\" di kanan kotak untuk memastikan ketikan benar.",
      "Klik tombol hijau besar \"Masuk\". Tunggu beberapa detik sampai layar utama terbuka.",
    ],
    tip: "Jika muncul tulisan merah \"Username atau password salah\", ulangi pelan-pelan — password membedakan huruf besar dan kecil. Lupa password? Minta Owner meresetnya dari menu Pengguna & Akses; Anda tidak perlu membuat akun baru.",
    roles: ["OWNER", "STAFF", "CASHIER"],
  },
  {
    title: "2. Mengenal layar utama (Dashboard)",
    image: "/guide/02-dashboard.png",
    alt: "Dashboard dengan menu di kiri dan kartu angka ringkasan",
    steps: [
      "Setelah masuk, Anda melihat Dashboard: ucapan selamat datang, nama apotek, dan kartu-kartu berisi angka.",
      "Di sisi KIRI ada daftar menu (POS, Inventory, dan lainnya). Di HP, menu berada di BAWAH layar. Klik nama menu untuk berpindah.",
      "Kartu angka (contoh: Produk, Unit stok tersedia) BISA DIKLIK. Klik satu kartu untuk melihat daftar rinciannya; klik \"Tutup\" untuk kembali.",
      "Garis berjalan berwarna hijau di atas kartu berisi pengingat penting, misalnya batch yang mendekati kedaluwarsa.",
      "Tombol \"Keluar\" ada di bagian bawah menu kiri (di HP: pojok kanan atas). Gunakan saat selesai bekerja.",
    ],
    roles: ["OWNER", "STAFF", "CASHIER"],
    link: { to: "/app", label: "Buka Dashboard" },
  },
  {
    title: "3. Menjual obat di kasir (POS)",
    image: "/guide/03-pos.png",
    alt: "Halaman POS dengan kotak pencarian dan kartu produk",
    intro: "Gambar di bawah menunjukkan POS dalam Mode Latihan (bingkai kuning). POS sungguhan tampilannya sama, tanpa bingkai kuning.",
    steps: [
      "Klik menu \"POS\" di sebelah kiri.",
      "Klik kotak pencarian bertuliskan \"Cari nama / kategori / gejala\", lalu ketik nama obat (contoh: ketik \"para\" untuk Parasetamol).",
      "Klik kartu obat yang dicari — obat langsung masuk ke KERANJANG di sisi kanan layar.",
      "Di keranjang, atur jumlah dengan tombol + dan −. Salah pilih? Klik tanda silang/hapus pada baris obat itu.",
      "Periksa TOTAL harga di bagian bawah keranjang, lalu sebutkan ke pembeli.",
      "Pilih cara bayar: Tunai, Debit, atau Transfer. Untuk Tunai, ketik jumlah uang yang diterima — kembalian dihitung otomatis.",
      "Klik tombol konfirmasi/bayar. Transaksi tersimpan dan nota siap dicetak (printer) atau dikirim lewat WhatsApp.",
    ],
    tip: "Ingin berlatih tanpa takut salah? Klik \"Mode latihan (SAMPLE)\" di bagian atas POS. Semua transaksi latihan TIDAK sungguhan: stok dan omzet asli tidak berubah. Jangan menerima uang sungguhan saat latihan. Klik \"Kembali ke POS operasional\" untuk berjualan sungguhan.",
    roles: ["OWNER", "CASHIER"],
    link: { to: "/app/pos", label: "Buka POS" },
  },
  {
    title: "4. Memeriksa dan menambah stok (Inventory)",
    image: "/guide/04-inventory.png",
    alt: "Halaman Inventory berisi daftar produk dan stok",
    steps: [
      "Klik menu \"Inventory\" di sebelah kiri.",
      "Untuk memeriksa stok: ketik nama obat di kotak pencarian. Terlihat jumlah stok, harga, dan tanggal kedaluwarsanya.",
      "Untuk menambah obat baru: klik tombol hijau \"+ Produk Baru\", isi nama obat, harga jual, dan satuan, lalu simpan.",
      "Saat barang datang dari pemasok: buka produknya, tambahkan BATCH baru — isi jumlah, tanggal kedaluwarsa (lihat tulisan EXP/ED di kemasan), dan nama pemasok.",
      "Selalu periksa tanggal kedaluwarsa sebelum menyimpan. Tanggal ini dipakai aplikasi untuk mengingatkan obat yang hampir kedaluwarsa.",
      "Untuk memasukkan banyak produk sekaligus: klik \"Template impor\" untuk mengunduh file Excel contoh, isi di Excel, lalu klik \"Impor Excel\". Tombol \"Ekspor Excel\" mengunduh seluruh daftar stok.",
    ],
    roles: ["OWNER", "STAFF"],
    link: { to: "/app/inventory", label: "Buka Inventory" },
  },
  {
    title: "5. Impor & ekspor stok lewat Excel (pindahan data / stok banyak)",
    image: "/guide/04-inventory.png",
    alt: "Tombol Ekspor Excel, Template impor, dan Impor Excel di bagian atas halaman Inventory",
    image2: "/guide/05c-template-excel.png",
    alt2: "Tampilan file template di Excel: baris 1 nama kolom, baris 2-3 contoh, kolom penting disorot kuning",
    intro: "Gunakan ini untuk memindahkan data dari aplikasi lama atau memasukkan ratusan obat sekaligus. Gambar pertama: letak tombolnya di Inventory. Gambar kedua: tampilan file template saat dibuka di Excel — kolom KUNING adalah yang penting diisi, baris 2–3 hanya contoh.",
    steps: [
      "Klik \"Ekspor Excel\" untuk MENGUNDUH seluruh stok sebagai file Excel — berguna untuk arsip atau memeriksa data di komputer.",
      "Untuk MEMASUKKAN data: klik \"Template impor\". File bernama template-impor-stok.xlsx terunduh ke folder Download.",
      "Buka file itu di Excel. Di bagian bawah ada 2 lembar (sheet): \"Stok\" berisi 2 baris contoh yang bisa ditiru, dan \"Petunjuk\" berisi penjelasan setiap kolom dalam bahasa Indonesia.",
      "Isi SATU BARIS untuk SATU OBAT di sheet Stok, meniru baris contoh (lihat gambar kedua — kolom kuning). Kolom terpenting: name = nama obat, salePrice = HARGA JUAL per satuan (bukan harga beli!), rxRequired = true untuk obat resep / false untuk lainnya, marketplaceEnabled = false.",
      "Kolom stok: qty = jumlah stok, batchNo = isi MIGRASI, sourceType = isi OPENING_STOCK, expiryISO = tanggal kedaluwarsa dengan format 2027-06-30. Belum tahu ED-nya? Isi 2030-12-31 dulu, nanti dikoreksi di Inventory.",
      "Kolom pelengkap (boleh kosong): code = kode obat, unit = satuan (TABLET/PCS/STRIP), supplierName = nama PBF/pemasok (otomatis didaftarkan ke menu Pemasok), purchasePrice = harga beli/HPP, minStock = batas stok minimum.",
      "Selesai mengisi: HAPUS 2 baris contoh bawaan template agar tidak ikut masuk, lalu simpan file (Ctrl+S).",
      "Kembali ke aplikasi, klik \"Impor Excel\", pilih file tadi, tunggu sampai muncul pesan hijau \"... produk berhasil diimpor\".",
      "Jika muncul pesan merah, baca nomor barisnya (contoh: \"Baris 5: ...\"), perbaiki baris itu di Excel, simpan, lalu impor ulang. Impor boleh diulang — data yang sama diperbarui, tidak menjadi dobel.",
    ],
    tip: "Satu obat dengan beberapa batch (ED berbeda) ditulis dalam beberapa baris dengan kolom name yang sama. Tanggal boleh diketik sebagai tanggal Excel biasa — aplikasi mengerti keduanya.",
    roles: ["OWNER", "STAFF"],
    link: { to: "/app/inventory", label: "Buka Inventory" },
  },
  {
    title: "6. Menambah pengguna dan reset password",
    image: "/guide/05-users.png",
    alt: "Halaman Pengguna dan Akses berisi daftar anggota apotek",
    image2: "/guide/05b-users-form.png",
    alt2: "Formulir tambah pengguna dengan pilihan Username & password terisi contoh",
    intro: "Hanya Owner yang bisa melakukan ini. Gambar pertama: daftar pengguna. Gambar kedua: formulir tambah pengguna dengan username & password aplikasi.",
    steps: [
      "Klik menu \"Pengguna & Akses\" di sebelah kiri.",
      "Klik tombol hijau \"+ Tambah pengguna\" di kanan atas — muncul formulir seperti gambar kedua.",
      "Pastikan pilihan \"Username & password\" yang tercentang (paling mudah untuk karyawan; tidak perlu email).",
      "Isi Username: huruf kecil semua tanpa spasi, contoh: kasir1 atau budi.",
      "Isi Password: minimal 6 karakter dan harus ada huruf serta angka, contoh: Budi123. Klik \"Lihat\" untuk memeriksa ketikan.",
      "Isi Nama karyawan, lalu pilih perannya: \"Kasir\" untuk yang melayani penjualan, \"Staf Apotek\" untuk yang mengurus stok.",
      "Klik tombol hijau \"Buat akun\". Nama karyawan langsung muncul di daftar dengan tulisan \"Username: ...\".",
      "Beritahukan username dan password itu ke karyawan — mereka langsung bisa masuk di batam-farma.web.app memakai tab Username.",
      "Karyawan lupa password? Cari namanya di daftar, klik \"Reset password\", ketik password baru, klik \"Simpan\", lalu beritahukan password barunya.",
      "Karyawan berhenti bekerja? Klik \"Nonaktifkan\" (bisa diaktifkan lagi) atau \"Hapus akun\" (permanen, riwayat transaksi tetap tersimpan).",
    ],
    tip: "Satu karyawan satu akun — jangan berbagi username. Dengan begitu setiap transaksi tercatat atas nama kasir yang benar.",
    roles: ["OWNER"],
    link: { to: "/app/users", label: "Kelola pengguna" },
  },
  {
    title: "7. Menyimpan data pelanggan dan pemasok",
    image: "/guide/06-customers.png",
    alt: "Halaman Pelanggan berisi daftar kontak",
    steps: [
      "Klik menu \"Pelanggan\" (atau \"Pemasok\") di sebelah kiri.",
      "SEBELUM menambah, ketik dulu namanya di kotak pencarian — supaya tidak membuat data ganda.",
      "Jika belum ada, klik tombol hijau \"+ Tambah pelanggan\" / \"+ Tambah pemasok\".",
      "Isi nama dan nomor telepon/WhatsApp, lalu klik \"Simpan\". Kolom lain boleh dikosongkan dulu.",
      "Pelanggan tersimpan bisa dipilih di POS (tombol Info Pelanggan) agar nama dan nomor WA otomatis terisi di nota.",
      "Jangan menulis resep, penyakit, atau data kesehatan pasien di catatan.",
    ],
    roles: ["OWNER", "STAFF"],
    link: { to: "/app/customers", label: "Buka Pelanggan" },
  },
  {
    title: "8. Mengembalikan barang ke pemasok (Retur)",
    image: "/guide/07-returns.png",
    alt: "Halaman Retur Pemasok dengan formulir retur",
    steps: [
      "Klik menu \"Retur Pemasok\" di sebelah kiri.",
      "Pilih nama pemasok dari daftar. Hanya pemasok yang ditandai \"menerima retur\" yang muncul — penandaan diatur di menu Pemasok.",
      "Pilih batch barang yang mau dikembalikan, lalu isi jumlahnya.",
      "Pilih alasan (contoh: Mendekati kedaluwarsa, Rusak), tambahkan catatan jika perlu.",
      "Cocokkan dengan barang fisik di tangan, lalu klik \"Keluarkan stok & catat retur\". Stok otomatis berkurang dan retur tercatat di riwayat.",
    ],
    roles: ["OWNER", "STAFF"],
    link: { to: "/app/returns", label: "Buka Retur Pemasok" },
  },
  {
    title: "9. Selesai bekerja: keluar dari aplikasi",
    image: "/guide/02-dashboard.png",
    alt: "Letak tombol Keluar di bagian bawah menu kiri",
    steps: [
      "Pastikan tidak ada transaksi yang sedang berjalan di POS.",
      "Klik tombol \"Keluar\" di bagian paling bawah menu kiri (di HP: pojok kanan atas).",
      "Layar kembali ke halaman login — artinya Anda sudah keluar dengan aman.",
      "Jangan hanya menutup browser tanpa Keluar jika komputer dipakai bersama orang lain.",
    ],
    roles: ["OWNER", "STAFF", "CASHIER"],
  },
];

const ownerGuide: GuideSection[] = [
  {
    title: "Dashboard",
    steps: [
      "Gunakan ringkasan operasional untuk memantau persediaan, batch berisiko, dan transaksi hari ini.",
      "Tindak lanjuti stok minimum dan kedaluwarsa dari menu Inventory sebelum melayani transaksi.",
    ],
    link: { to: "/app", label: "Buka Dashboard" },
  },
  {
    title: "POS",
    steps: [
      "Pilih produk dan jumlah, periksa total, lalu pilih Tunai, Debit, atau Transfer.",
      "Untuk mencoba produk SAMPLE, buka Mode latihan (SAMPLE) di POS. Kosongkan keranjang sebelum berpindah mode. Simulasi bayar mencetak nota LATIHAN, mengurangi stok latihan browser saja, dan tidak menambah omzet atau mengubah stok database.",
      "Jika POS operasional kosong tetapi Inventory berisi SAMPLE, klik Tampilkan obat SAMPLE untuk latihan POS atau tautan latihan dari Inventory. Ilustrasi SAMPLE bukan foto kemasan asli dan tidak boleh dipakai mengidentifikasi obat nyata.",
      "Reset latihan mengembalikan stok latihan dan menghapus transaksi latihan di browser ini saja. Jangan menerima uang atau menyerahkan obat pada mode latihan.",
      "Di Info Pelanggan, pilih pelanggan terdaftar untuk mengisi nama/nomor otomatis, atau isi manual. Pada nota, isi nomor valid lalu klik PDF + Buka WhatsApp: PDF dibuat dan unduhan diminta, kemudian chat pelanggan dibuka tanpa teks nota. Di WhatsApp pilih Lampiran > Dokumen, ambil PDF dari folder unduhan, periksa penerima, lalu Kirim sendiri. Memakai sesi login WhatsApp browser; scan QR jika diminta. Tanpa gateway: file tidak dilampirkan atau dikirim otomatis.",
      "Print 58mm/80mm membuka dialog printer thermal. Print / Simpan PDF (A4) membuka dialog cetak: pilih Save as PDF/Simpan sebagai PDF, lalu Simpan. Nota latihan/offline tetap membawa tanda status. Email dan Salin Teks sementara dinonaktifkan.",
      "Katalog menampilkan 48 produk per halaman agar ringan. Pencarian mencakup seluruh daftar obat; gunakan Berikutnya/Sebelumnya untuk berpindah halaman.",
      "Pilot dimulai dengan satu PC dan internet aktif. Transaksi offline default nonaktif; Owner hanya mengaktifkannya di Profil & Nota setelah uji lapangan lulus.",
      "Pada paket Spark, satu produk harus terpenuhi dari satu batch dan satu transaksi dibatasi empat produk.",
      "Obat wajib resep belum dapat dijual. Periksa total sebelum konfirmasi karena transaksi tersimpan tidak dapat diedit.",
      "Agar siap offline, buka aplikasi dan POS saat internet tersedia; pasang aplikasi dari menu Chrome/Edge bila tersedia. Gunakan PC dan profil browser yang sama.",
      "Jangan gunakan mode samaran atau hapus data browser. Aplikasi menyimpan cache stok dan transaksi tertunda secara lokal di profil browser ini.",
      "Saat offline, stok yang dipakai adalah salinan terakhir di PC. Transaksi tersimpan lokal dan baru terlihat Owner setelah status sinkronisasi berhasil.",
      "Gunakan satu PC untuk transaksi offline. Jangan berjualan offline dari dua PC karena stoknya tidak dapat saling diperbarui.",
    ],
    link: { to: "/app/pos", label: "Buka POS" },
  },
  {
    title: "Inventory",
    steps: [
      "Tambah produk satu per satu atau impor daftar produk, lalu isi harga jual dan stok minimum.",
      "Untuk foto dari komputer: Kelola produk, Upload dari PC, pilih JPG/PNG/WebP maks. 5 MB, tunggu pratinjau lalu Simpan Produk. Foto diperkecil maks. 256 px / 24 KB dan tersedia di PC lain setelah sinkronisasi.",
      "Thumbnail foto muncul di kartu POS, keranjang dan daftar stok. Belum ada foto berarti gambar produk belum disimpan; jangan menganggap ikon/placeholder sebagai foto kemasan.",
      "Owner dapat membuka Tambah foto/Ganti foto, mengisi nama merek, dosis dan kemasan lalu Cari foto internet. Pilih kandidat, periksa sumber/lisensi serta kesesuaian kemasan, centang persetujuan lalu Setujui dan gunakan foto, kemudian Simpan Produk. Hasil pencarian tidak otomatis benar; jika tidak cocok, upload foto asli.",
      "Produk bertanda SAMPLE hanya untuk contoh: tidak muncul di POS dan tidak boleh dijual. Harga/batch/ED contoh bukan data asli; stok contoh ikut laporan sampai dibersihkan.",
      "Catat batch beserta tanggal kedaluwarsa dan pemasoknya. Periksa tanggal sebelum menyimpan.",
      "Saat online dan aplikasi terbuka, perubahan stok dan batch diterima otomatis. Tidak perlu memuat ulang seluruh aplikasi setelah setiap penjualan.",
      "Untuk data lama, jalankan Migrasi data batch sebelum transaksi pertama.",
    ],
    link: { to: "/app/inventory", label: "Buka Inventory" },
  },
  {
    title: "Pesanan Online",
    steps: [
      "Periksa daftar pesanan dan statusnya sebelum menindaklanjuti permintaan pelanggan.",
      "Checkout online saat ini dinonaktifkan pada paket Spark; pelanggan belum dapat menyelesaikan pembayaran online.",
    ],
    link: { to: "/app/orders", label: "Buka Pesanan Online" },
  },
  {
    title: "Retur Pemasok",
    steps: [
      "Pastikan pemasok menerima retur dan batch masih memenuhi kebijakan retur.",
      "Pilih pemasok, batch, jumlah, dan alasan. Cocokkan kembali dengan barang fisik sebelum menyimpan.",
      "Jika stok batch berbeda, minta pemeriksaan sebelum melanjutkan agar jumlah tidak makin keliru.",
    ],
    link: { to: "/app/returns", label: "Buka Retur Pemasok" },
    preview: "staff-return",
  },
  {
    title: "Keuangan",
    steps: [
      "Tinjau transaksi dan pembayaran sesuai periode yang dipilih.",
      "Cocokkan pembayaran Tunai, Debit, dan Transfer dengan bukti penerimaan sebelum membuat rekap.",
      "HPP yang belum lengkap ditandai sebagai data yang perlu dilengkapi, bukan dihitung nol.",
    ],
    link: { to: "/app/accounting", label: "Buka Keuangan" },
  },
  {
    title: "Laporan Apotek",
    steps: [
      "Pilih periode laporan, lalu tinjau penjualan, persediaan, dan indikator yang tersedia.",
      "Periksa kelengkapan HPP sebelum memakai angka laba untuk evaluasi atau keputusan bisnis.",
    ],
    link: { to: "/app/reports", label: "Buka Laporan Apotek" },
  },
  {
    title: "Pengguna & Akses",
    steps: [
      "Undang pengguna dengan email yang akan dipakai untuk masuk.",
      "Pilih peran dengan tepat: Staf membantu inventory/retur; Kasir menjalankan POS.",
      "Jangan berbagi akun. Cabut akses pengguna yang sudah tidak bekerja.",
    ],
    link: { to: "/app/users", label: "Kelola pengguna" },
    preview: "owner-access",
  },
  {
    title: "Pemasok",
    steps: [
      "Cari pemasok sebelum menambah data agar tidak membuat entri ganda.",
      "Lengkapi nama dan kontak yang diperlukan; pilih data pemasok saat mencatat batch pembelian atau retur.",
    ],
    link: { to: "/app/suppliers", label: "Buka Pemasok" },
  },
  {
    title: "Pelanggan",
    steps: [
      "Cari pelanggan sebelum menambah kontak baru dan perbarui informasi yang memang diperlukan.",
      "Jangan menaruh resep, diagnosis, atau data pasien pada catatan umum.",
    ],
    link: { to: "/app/customers", label: "Buka Pelanggan" },
  },
  {
    title: "Profil & Nota",
    steps: [
      "Lengkapi identitas dan informasi apotek yang akan dicetak pada nota.",
      "Setelah tutup kasir, hentikan perubahan di semua PC, sinkronkan antrean, lalu Unduh backup JSON. Pastikan file tersimpan di lokasi aman terpisah dari PC kasir.",
      "Backup manual berisi data pribadi dan tidak mencakup akun Google/Firebase Auth, file gambar, atau antrean offline. Bukan snapshot satu waktu; pemulihan dilakukan pengelola teknis dan harus diuji di emulator sebelum produksi.",
      "Simpan perubahan lalu periksa tampilan nota sebelum digunakan untuk transaksi.",
    ],
    link: { to: "/app/settings", label: "Buka Profil & Nota" },
  },
  {
    title: "Printer & Perangkat",
    steps: [
      "Pilih pengaturan printer yang sesuai dengan perangkat kasir.",
      "Cetak percobaan dan pastikan hasilnya terbaca sebelum melayani pembeli.",
    ],
    link: { to: "/app/hardware", label: "Atur Printer & Perangkat" },
  },
  {
    title: "Petunjuk",
    steps: [
      "Gunakan halaman ini untuk melihat langkah dan batasan menu sesuai peran Owner.",
      "Pilih tautan di tiap bagian untuk langsung membuka menu yang dibahas.",
    ],
  },
  {
    title: "Keluar",
    steps: [
      "Pilih tombol Keluar di bawah sidebar saat selesai menggunakan aplikasi.",
      "Jika ada transaksi offline, transaksi tetap tersimpan di PC. Masuk kembali dengan akun kasir pembuat transaksi untuk menyinkronkannya.",
      "Untuk masuk kembali, gunakan akun Google yang telah diundang Owner.",
    ],
  },
];

const staffGuide: GuideSection[] = [
  {
    title: "Dashboard",
    steps: [
      "Periksa ringkasan operasional dan pemberitahuan stok sebelum mulai bekerja.",
      "Tanyakan kepada Owner jika ada data yang tidak sesuai dengan kondisi apotek.",
    ],
    link: { to: "/app", label: "Buka Dashboard" },
  },
  {
    title: "Inventory",
    steps: [
      "Cari produk untuk melihat jumlah stok dan batch yang tersedia.",
      "Saat menerima barang, catat jumlah dan tanggal kedaluwarsa sesuai kemasan.",
      "HPP dan harga beli hanya dapat dilihat Owner. Hubungi Owner jika data pembelian perlu diperbaiki.",
    ],
    link: { to: "/app/inventory", label: "Buka Inventory" },
  },
  {
    title: "Pesanan Online",
    steps: [
      "Periksa daftar pesanan dan statusnya sebelum menindaklanjuti permintaan pelanggan.",
      "Checkout online saat ini dinonaktifkan pada paket Spark.",
      "Jangan menuliskan diagnosis atau informasi medis di catatan umum.",
    ],
    link: { to: "/app/orders", label: "Buka Pesanan Online" },
  },
  {
    title: "Retur Pemasok",
    steps: [
      "Pastikan pemasok menerima retur dan batch masih memenuhi kebijakan retur.",
      "Periksa nomor batch dan jumlah barang sebelum menyimpan retur.",
      "Jika stok batch berbeda dari barang fisik, minta Owner memeriksa sebelum melanjutkan.",
    ],
    link: { to: "/app/returns", label: "Buka Retur Pemasok" },
    preview: "staff-return",
  },
  {
    title: "Pemasok",
    steps: [
      "Cari pemasok sebelum menambah data baru agar tidak terjadi duplikasi.",
      "Gunakan informasi kontak yang tersedia saat memeriksa batch atau menyiapkan retur.",
    ],
    link: { to: "/app/suppliers", label: "Buka Pemasok" },
  },
  {
    title: "Pelanggan",
    steps: [
      "Cari pelanggan untuk memeriksa kontak yang sudah tersimpan sebelum membuat entri baru.",
      "Simpan informasi seperlunya dan jangan mencatat resep atau diagnosis di catatan umum.",
    ],
    link: { to: "/app/customers", label: "Buka Pelanggan" },
  },
  {
    title: "Printer & Perangkat",
    steps: [
      "Pilih pengaturan printer yang cocok dengan perangkat kasir.",
      "Cetak percobaan untuk memastikan nota terbaca sebelum printer digunakan.",
    ],
    link: { to: "/app/hardware", label: "Atur Printer & Perangkat" },
  },
  {
    title: "Petunjuk",
    steps: [
      "Gunakan halaman ini untuk melihat langkah menu yang tersedia bagi Staf.",
      "Pilih tautan di tiap bagian untuk langsung membuka menu yang dibahas.",
    ],
  },
  {
    title: "Keluar",
    steps: [
      "Pilih tombol Keluar di bawah sidebar saat selesai menggunakan aplikasi.",
      "Jika ada transaksi offline, transaksi tetap tersimpan di PC. Masuk kembali dengan akun kasir pembuat transaksi untuk menyinkronkannya.",
      "Untuk masuk kembali, gunakan akun Google yang terdaftar pada undangan Owner.",
    ],
  },
];

const cashierGuide: GuideSection[] = [
  {
    title: "Dashboard",
    steps: [
      "Periksa ringkasan dan pemberitahuan stok sebelum mulai melayani transaksi.",
      "Laporkan stok menipis atau batch kedaluwarsa kepada Owner.",
    ],
    link: { to: "/app", label: "Buka Dashboard" },
  },
  {
    title: "POS",
    steps: [
      "Cari produk, masukkan jumlah, lalu periksa nama dan total sebelum pembayaran.",
      "Selama pilot online, jika internet putus jangan ulangi pembayaran. Tunggu koneksi dan coba keranjang yang sama agar transaksi yang sudah tersimpan dapat dikenali.",
      "Pada paket Spark, satu produk harus diambil dari satu batch; satu transaksi maksimal empat produk.",
      "Jika jumlah melewati stok batch FEFO pertama, kurangi jumlah atau minta Owner merapikan batch.",
      "Pilih Tunai, Debit, atau Transfer sesuai pembayaran yang benar-benar diterima.",
      "Untuk Tunai, masukkan uang yang diterima; transaksi ditolak jika jumlahnya kurang dari total.",
      "Obat wajib resep belum dapat dijual. Jangan konfirmasi sebelum pembayaran diterima dan total cocok.",
      "Buka aplikasi dan POS saat internet tersedia sebelum digunakan offline; pasang aplikasi dari menu Chrome/Edge bila tersedia.",
      "Gunakan PC dan profil browser yang sama. Jangan gunakan mode samaran atau hapus data browser karena cache stok dan antrean transaksi tersimpan di sana.",
      "Saat internet putus, POS memakai stok terakhir yang tersimpan di PC. Transaksi tersimpan lokal dan Owner baru melihatnya setelah sinkronisasi berhasil.",
      "Jangan melakukan penjualan offline dari PC lain. Jika ada transaksi yang perlu ditinjau, hentikan transaksi baru dan hubungi Owner.",
    ],
    link: { to: "/app/pos", label: "Buka POS" },
    preview: "cashier-payment",
  },
  {
    title: "Pesanan",
    steps: [
      "Periksa pesanan dan status sebelum menjawab pertanyaan pelanggan.",
      "Checkout online dinonaktifkan pada paket Spark; jangan menjanjikan pembayaran online tersedia.",
    ],
    link: { to: "/app/orders", label: "Buka Pesanan" },
  },
  {
    title: "Printer & Perangkat",
    steps: [
      "Gunakan pengaturan printer yang disiapkan Owner untuk perangkat kasir.",
      "Lakukan cetak percobaan sebelum mencetak nota transaksi.",
    ],
    link: { to: "/app/hardware", label: "Atur Printer & Perangkat" },
  },
  {
    title: "Petunjuk",
    steps: [
      "Gunakan halaman ini untuk melihat langkah menu yang tersedia bagi Kasir.",
      "Jika transaksi atau stok bermasalah, jangan mengulang tindakan; hubungi Owner.",
    ],
  },
  {
    title: "Keluar",
    steps: [
      "Pilih tombol Keluar di bawah sidebar saat selesai menggunakan aplikasi.",
      "Jika ada transaksi offline, transaksi tetap tersimpan di PC. Masuk kembali dengan akun kasir pembuat transaksi untuk menyinkronkannya.",
      "Untuk masuk kembali, gunakan akun Google yang terdaftar pada undangan Owner.",
    ],
  },
];

export function UserGuide() {
  const role = useAuth((state) => state.claims?.role);
  const isAdmin = useAuth((state) => state.isAdmin);
  const owner = role === "OWNER" || isAdmin;
  const guide = owner ? ownerGuide : role === "CASHIER" ? cashierGuide : staffGuide;
  const roleName = owner ? "Owner" : role === "CASHIER" ? "Kasir" : "Staf";
  const roleKey: "OWNER" | "STAFF" | "CASHIER" = owner ? "OWNER" : role === "CASHIER" ? "CASHIER" : "STAFF";
  const visibleTutorials = tutorials.filter((tutorial) => tutorial.roles.includes(roleKey));
  const [search, setSearch] = useState("");

  const needle = search.trim().toLowerCase();
  const matchesText = (parts: Array<string | undefined>) =>
    !needle || parts.some((part) => (part || "").toLowerCase().includes(needle));
  const filteredTutorials = visibleTutorials.filter((tutorial) =>
    matchesText([tutorial.title, tutorial.intro, tutorial.tip, ...tutorial.steps]));
  const filteredGuide = guide.filter((section) => matchesText([section.title, ...section.steps]));
  const searching = needle.length > 0;

  function jumpTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-sm font-medium text-brand-700">Pusat bantuan · {roleName}</p>
        <h1 className="mt-1 text-2xl font-bold">Petunjuk penggunaan</h1>
        <p className="mt-2 text-sm text-ink-500">Panduan bergambar langkah demi langkah, diikuti rincian setiap menu untuk peranmu.</p>
      </header>

      {/* Pencarian + daftar isi klik */}
      <section className="card p-5">
        <label className="block text-sm font-medium text-ink-700">🔎 Cari bantuan
          <input
            className="input mt-2 w-full"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ketik kata kunci, contoh: password, impor, retur, nota…"
          />
        </label>
        {searching && filteredTutorials.length === 0 && filteredGuide.length === 0 && (
          <p className="mt-3 text-sm text-ink-500">Tidak ada panduan yang cocok dengan "{search}". Coba kata lain, misalnya "stok" atau "login".</p>
        )}
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Panduan bergambar</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {filteredTutorials.map((tutorial) => (
              <button
                key={tutorial.title}
                type="button"
                className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm text-brand-800 hover:bg-brand-100 transition-colors"
                onClick={() => jumpTo(`tut-${slugify(tutorial.title)}`)}
              >
                {tutorial.title}
              </button>
            ))}
            {filteredTutorials.length === 0 && <span className="text-sm text-ink-400">—</span>}
          </div>
        </div>
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Rincian per menu</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {filteredGuide.map((section) => (
              <button
                key={section.title}
                type="button"
                className="rounded-full border border-surface-200 bg-surface-50 px-3 py-1.5 text-sm text-ink-700 hover:bg-surface-100 transition-colors"
                onClick={() => jumpTo(`menu-${slugify(section.title)}`)}
              >
                {section.title}
              </button>
            ))}
            {filteredGuide.length === 0 && <span className="text-sm text-ink-400">—</span>}
          </div>
        </div>
      </section>

      <section className="space-y-5">
        {!searching && (
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
            <strong>Baru pertama kali?</strong> Ikuti panduan bergambar di bawah ini urut dari nomor 1. Setiap gambar adalah tampilan asli aplikasi.
          </div>
        )}
        {filteredTutorials.map((tutorial) => (
          <article key={tutorial.title} id={`tut-${slugify(tutorial.title)}`} className="card p-5 scroll-mt-16">
            <h2 className="text-lg font-bold">{tutorial.title}</h2>
            {tutorial.intro && <p className="mt-1 text-sm text-ink-500">{tutorial.intro}</p>}
            <img
              src={tutorial.image}
              alt={tutorial.alt}
              loading="lazy"
              className="mt-4 w-full rounded-lg border border-surface-200 shadow-sm"
            />
            {tutorial.image2 && (
              <img
                src={tutorial.image2}
                alt={tutorial.alt2 || ""}
                loading="lazy"
                className="mt-3 w-full rounded-lg border border-surface-200 shadow-sm"
              />
            )}
            <ol className="mt-4 space-y-3">
              {tutorial.steps.map((step, index) => (
                <li key={index} className="flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{index + 1}</span>
                  <span className="text-[15px] leading-7 text-ink-800">{step}</span>
                </li>
              ))}
            </ol>
            {tutorial.tip && (
              <p className="mt-4 rounded-lg border border-warn-200 bg-warn-50 px-3 py-2 text-sm leading-6 text-warn-800">
                💡 {tutorial.tip}
              </p>
            )}
            {tutorial.link && (
              <Link to={tutorial.link.to} className="btn-primary mt-4 inline-flex">{tutorial.link.label} →</Link>
            )}
          </article>
        ))}
      </section>

      <header className="pt-2">
        <h2 className="text-xl font-bold">Rincian dan aturan setiap menu</h2>
        <p className="mt-1 text-sm text-ink-500">Bacaan lanjutan: batasan dan hal yang perlu diperhatikan per menu.</p>
      </header>

      {!searching && <section className="card p-5">
        <h2 className="font-semibold">Checklist pilot satu PC</h2>
        <ul className="mt-3 list-disc pl-5 text-sm leading-6 text-ink-700">
          <li>Uji login Owner, Staf, dan Kasir menggunakan akun masing-masing; cek menu dan batas aksesnya.</li>
          <li>Masukkan produk serta batch, jual satu unit, cocokkan stok fisik, nota, dan omzet Owner.</li>
          <li>Uji tunai pas/kurang, diskon, stok habis, batch kedaluwarsa, dan empat produk dalam satu nota.</li>
          <li>Uji cetak di printer fisik, ukuran kertas, dan scanner PC apotek.</li>
          <li>Uji putus-sambung internet dan pemuatan ulang di lingkungan uji sebelum mengaktifkan offline.</li>
          <li>Rekonsiliasi kas dan stok setiap tutup hari, unduh backup, dan simpan pencatatan pembanding selama pilot.</li>
          <li>Marketplace, pembayaran online, dan penjualan obat wajib resep belum tersedia. HPP/laba belum terverifikasi; jangan gunakan sebagai laporan laba final.</li>
        </ul>
      </section>}

      {!searching && <section className="card p-5">
        <h2 className="font-semibold">Ringkasan akses setiap peran</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <div>
            <h3 className="text-sm font-semibold text-brand-700">Owner</h3>
            <p className="mt-1 text-sm leading-6 text-ink-700">
              Semua menu: Dashboard, POS, Inventory, Pesanan, Retur, Keuangan, Laporan, Pengguna &amp; Akses,
              Pemasok, Pelanggan, Profil &amp; Nota, Printer &amp; Perangkat, dan Petunjuk.
              Owner dapat melihat harga beli/HPP.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-brand-700">Staf</h3>
            <p className="mt-1 text-sm leading-6 text-ink-700">
              Dashboard, Inventory, Pesanan, Retur, Pemasok, Pelanggan, Printer &amp; Perangkat, dan Petunjuk.
              Staf tidak dapat membuka POS atau menu keuangan/pengaturan Owner, dan tidak melihat harga beli/HPP.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-brand-700">Kasir</h3>
            <p className="mt-1 text-sm leading-6 text-ink-700">
              Dashboard, POS, Pesanan, Printer &amp; Perangkat, dan Petunjuk.
              Kasir dapat membaca dan memilih pelanggan terdaftar di POS, tetapi tidak mengelola kontak. Kasir tidak mendapat akses Inventory, halaman pelanggan/pemasok, laporan, atau pengaturan Owner.
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-ink-500">
          Owner mengatur akun Staf dan Kasir melalui menu Pengguna &amp; Akses. Menu yang tidak termasuk peranmu
          akan ditolak meskipun alamat halamannya dibuka langsung.
        </p>
      </section>}

      <div className="grid gap-4 md:grid-cols-2">
        {filteredGuide.map((section) => (
          <section key={section.title} id={`menu-${slugify(section.title)}`} className="card p-5 scroll-mt-16">
            <h2 className="font-semibold">{section.title}</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-ink-700">
              {section.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
            {section.preview && <GuidePreview kind={section.preview} />}
            {section.link && <Link to={section.link.to} className="mt-4 inline-flex text-sm font-medium text-brand-700 hover:underline">{section.link.label} →</Link>}
          </section>
        ))}
      </div>
    </div>
  );
}

function GuidePreview({ kind }: { kind: GuidePreviewKind }) {
  return (
    <figure className="mt-4 overflow-hidden rounded-lg border border-surface-200 bg-white shadow-sm">
      <figcaption className="border-b border-surface-100 bg-surface-50 px-3 py-2 text-[11px] font-medium text-ink-500">
        Contoh tampilan langkah 2
      </figcaption>
      {kind === "owner-access" && (
        <div className="space-y-3 p-3">
          <div className="flex items-center justify-between gap-2">
            <div><p className="text-xs font-semibold text-ink-900">Pengguna & Akses</p><p className="text-[10px] text-ink-500">Kelola akses Staf Apotek dan Kasir</p></div>
            <span className="rounded-md bg-brand-500 px-2 py-1 text-[10px] font-medium text-white">+ Tambah pengguna</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <PreviewField label="Email akun" value="nama@email.com" />
            <PreviewField label="Nama" value="Nama pengguna" />
            <PreviewField label="Peran" value="Staf Apotek ▾" />
            <div className="flex items-end justify-end"><span className="rounded-md bg-brand-500 px-3 py-2 text-[10px] font-medium text-white">Simpan akses</span></div>
          </div>
        </div>
      )}
      {kind === "staff-return" && (
        <div className="grid gap-2 p-3 sm:grid-cols-2">
          <PreviewField label="Pemasok" value="Pilih pemasok yang menerima retur ▾" />
          <PreviewField label="Batch pembelian" value="Pilih batch ▾" />
          <PreviewField label="Jumlah retur" value="1" />
          <PreviewField label="Alasan" value="Mendekati kedaluwarsa ▾" />
          <div className="sm:col-span-2 flex justify-end"><span className="rounded-md bg-brand-500 px-3 py-2 text-[10px] font-medium text-white">Keluarkan stok & catat retur</span></div>
        </div>
      )}
      {kind === "cashier-payment" && (
        <div className="space-y-3 p-3">
          <p className="text-xs font-semibold text-ink-900">Metode pembayaran</p>
          <div className="grid grid-cols-3 gap-2">
            {[["Tunai", true], ["Debit", false], ["Transfer", false]].map(([label, active]) => (
              <span key={String(label)} className={`rounded-md border px-2 py-2 text-center text-[10px] font-medium ${active ? "border-brand-500 bg-brand-50 text-brand-700" : "border-surface-200 text-ink-600"}`}>{String(label)}</span>
            ))}
          </div>
          <PreviewField label="Uang diterima" value="Masukkan nominal tunai" />
        </div>
      )}
    </figure>
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium text-ink-600">{label}</p>
      <div className="rounded-md border border-surface-200 bg-white px-2 py-2 text-[10px] text-ink-400">{value}</div>
    </div>
  );
}