// Excel (.xlsx) import/export for inventory, built on top of the CSV codec in
// inventoryCsv.ts so parsing/validation stays single-sourced.
// SheetJS is loaded on demand (dynamic import) to keep it out of the main bundle.
import type * as XLSXType from "xlsx";
import { INVENTORY_IMPORT_HEADERS } from "./inventoryCsv";

const SHEET_NAME = "Stok";

async function loadXlsx(): Promise<typeof XLSXType> {
  return await import("xlsx");
}

export async function inventoryCsvToWorkbook(csvText: string) {
  const XLSX = await loadXlsx();
  const parsed = XLSX.read(csvText.replace(/^\uFEFF/, ""), { type: "string", raw: true });
  const sheet = parsed.Sheets[parsed.SheetNames[0]];
  const numericHeaders = new Set([
    "urut", "awal", "ajust", "terima", "keluar", "purchasePrice", "saldo", "nilai", "transaksi",
    "salePrice", "minStock", "qty", "riwayatAwal", "riwayatAjust", "riwayatTerima", "riwayatKeluar", "riwayatTransaksi",
  ]);
  if (sheet["!ref"]) {
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const header = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })]?.v;
      if (typeof header !== "string" || !numericHeaders.has(header)) continue;
      for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: column });
        const cell = sheet[address];
        if (cell && typeof cell.v === "string" && cell.v.trim() !== "" && Number.isFinite(Number(cell.v))) {
          sheet[address] = { t: "n", v: Number(cell.v) };
        }
      }
    }
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, SHEET_NAME);
  return workbook;
}

export async function downloadWorkbook(workbook: XLSXType.WorkBook, filename: string) {
  const XLSX = await loadXlsx();
  XLSX.writeFile(workbook, filename, { compression: true });
}

// Converts the first worksheet to CSV text compatible with parseInventoryCsv.
// Date cells (users often type ED as an Excel date) are normalized to YYYY-MM-DD.
export async function excelBufferToCsvText(buffer: ArrayBuffer): Promise<string> {
  const XLSX = await loadXlsx();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet || !sheet["!ref"]) throw new Error("File Excel tidak berisi data.");
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = sheet[address] as XLSXType.CellObject | undefined;
      if (cell && cell.v instanceof Date) {
        const date = cell.v;
        const iso = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        sheet[address] = { t: "s", v: iso };
      }
    }
  }
  return XLSX.utils.sheet_to_csv(sheet);
}

// Template with example rows matching the migration scenario (opening stock
// with supplier + HPP) so the file passes import validation as-is.
export async function buildInventoryTemplateWorkbook() {
  const XLSX = await loadXlsx();
  const exampleRows: Array<Record<string, unknown>> = [
    {
      urut: 1, name: "ACETIN 200 MG", category: "RESEP", salePrice: 3500, unit: "TABLET", minStock: 10,
      rxRequired: true, marketplaceEnabled: false,
      batchNo: "MIGRASI", qty: 168, expiryISO: "2027-06-30", sourceType: "OPENING_STOCK",
      awal: 98, ajust: 0, terima: 120, keluar: 50, saldo: 168, valuta: "IDR",
      supplierName: "BINA SAN PRIMA.PT", purchasePrice: 2500, code: "ACETIN 200AB1", active: true, sampleOnly: false,
    },
    {
      urut: 2, name: "ABBOCATE NO 18 (CATHETER)", category: "ALKES", salePrice: 4500, unit: "PCS", minStock: 5,
      rxRequired: false, marketplaceEnabled: false,
      batchNo: "MIGRASI", qty: 47, expiryISO: "2030-12-31", sourceType: "OPENING_STOCK",
      awal: 47, ajust: 0, terima: 0, keluar: 0, saldo: 47, valuta: "IDR",
      supplierName: "INTI SUMBER HASIL SEMPURNA PT", purchasePrice: 2997, code: "ABBOCATE00AB1", active: true, sampleOnly: false,
    },
  ];
  const sheet = XLSX.utils.json_to_sheet(exampleRows, { header: [...INVENTORY_IMPORT_HEADERS] });
  sheet["!cols"] = INVENTORY_IMPORT_HEADERS.map((header) => ({ wch: Math.max(header.length + 2, 12) }));

  const guide = XLSX.utils.aoa_to_sheet([
    ["Kolom", "Wajib?", "Keterangan"],
    ["name", "Ya", "Nama produk (kolom NAMA aplikasi lama)."],
    ["code", "Tidak", "Kode produk (kolom KODE aplikasi lama)."],
    ["category", "Tidak", "Jenis/kategori, mis. RESEP, ALKES, Obat Bebas (kolom JENIS)."],
    ["salePrice", "Ya", "HARGA JUAL per satuan (bukan HPP). Angka tanpa titik/koma ribuan."],
    ["unit", "Tidak", "Satuan, mis. TABLET, PCS, STRIP (kolom SATUAN)."],
    ["minStock", "Tidak", "Stok minimum untuk peringatan. Kosong = 0."],
    ["rxRequired", "Ya", "true jika obat resep (JENIS = RESEP), selain itu false."],
    ["marketplaceEnabled", "Ya", "Isi false (marketplace sedang nonaktif)."],
    ["batchNo", "Ya*", "Nomor batch. Untuk migrasi stok awal cukup isi MIGRASI."],
    ["qty", "Ya*", "Jumlah stok batch (kolom SALDO aplikasi lama)."],
    ["awal / ajust / terima / keluar", "Tidak", "Isi bersama sebagai ringkasan lama per produk. Tidak membuat transaksi POS atau mutasi lama."],
    ["transaksi", "Tidak", "Jumlah unit POS dalam ringkasan lama, jika diketahui; tidak membuat nota atau penjualan."],
    ["riwayatAwal / riwayatAjust / riwayatTerima / riwayatKeluar / riwayatTransaksi", "Tidak", "Ringkasan lama yang sudah tersimpan. Jika diisi, kolom ini digunakan sebagai ringkasan impor agar tidak tertimpa data harian."],
    ["saldo", "Tidak", "Informasi total semua batch produk, termasuk expired. Saat impor, jumlah stok setiap batch diambil dari qty."],
    ["urut / nilai / valuta", "Tidak", "Informasi saja; nilai dan valuta tidak digunakan untuk mengubah stok atau HPP."],
    ["expiryISO", "Ya*", "Tanggal kedaluwarsa (ED) format YYYY-MM-DD. Boleh ketik sebagai tanggal Excel. Belum tahu? Pakai 2030-12-31 lalu koreksi nanti."],
    ["sourceType", "Ya*", "Isi OPENING_STOCK untuk migrasi stok awal. PURCHASE menuntut purchaseDate."],
    ["supplierName", "Tidak", "Nama pemasok/PBF. Pemasok yang belum terdaftar dibuat otomatis saat impor."],
    ["purchasePrice", "Tidak", "HPP/harga beli per unit (kolom HPP). Hanya terlihat oleh Owner."],
    ["purchaseDate", "Tidak", "Tanggal terima (YYYY-MM-DD). Wajib hanya untuk sourceType PURCHASE."],
    ["invoiceNo / poId / grnId", "Tidak", "No. faktur, PO, GRN — boleh diisi belakangan."],
    ["id / batchId", "Tidak", "Kosongkan untuk produk/batch baru (dibuat otomatis)."],
    ["active / sampleOnly", "Tidak", "active=true untuk produk dijual. sampleOnly=false untuk produk nyata."],
    [],
    ["Catatan", "", "Satu baris = satu batch. Produk dengan beberapa batch ditulis beberapa baris dengan name/id sama."],
    ["", "", "Kolom bertanda Ya* wajib jika baris memiliki data batch/stok."],
    ["", "", "Jika satu produk memiliki beberapa batch, ringkasan lama harus sama di semua baris produk."],
  ]);
  guide["!cols"] = [{ wch: 22 }, { wch: 8 }, { wch: 95 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, SHEET_NAME);
  XLSX.utils.book_append_sheet(workbook, guide, "Petunjuk");
  return workbook;
}
