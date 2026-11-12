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
      name: "ACETIN 200 MG", category: "RESEP", salePrice: 3500, unit: "TABLET", minStock: 10,
      rxRequired: true, marketplaceEnabled: false,
      batchNo: "MIGRASI", qty: 168, expiryISO: "2027-06-30", sourceType: "OPENING_STOCK",
      supplierName: "BINA SAN PRIMA.PT", purchasePrice: 2500, code: "ACETIN 200AB1", active: true, sampleOnly: false,
    },
    {
      name: "ABBOCATE NO 18 (CATHETER)", category: "ALKES", salePrice: 4500, unit: "PCS", minStock: 5,
      rxRequired: false, marketplaceEnabled: false,
      batchNo: "MIGRASI", qty: 47, expiryISO: "2030-12-31", sourceType: "OPENING_STOCK",
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
  ]);
  guide["!cols"] = [{ wch: 22 }, { wch: 8 }, { wch: 95 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, SHEET_NAME);
  XLSX.utils.book_append_sheet(workbook, guide, "Petunjuk");
  return workbook;
}
