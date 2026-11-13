import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  buildInventoryTemplateWorkbook, excelBufferToCsvText, inventoryCsvToWorkbook,
} from "../src/lib/inventoryExcel";
import { parseInventoryCsv, serializeInventoryCsv, INVENTORY_IMPORT_HEADERS, type ImportSupplier } from "../src/lib/inventoryCsv";
import type { DemoProduct } from "../src/lib/demoStore";

const suppliers: ImportSupplier[] = [
  { id: "sup-1", name: "BINA SAN PRIMA.PT", active: true, returnable: false, returnMinDaysBeforeED: 0 },
  { id: "sup-2", name: "INTI SUMBER HASIL SEMPURNA PT", active: true, returnable: false, returnMinDaysBeforeED: 0 },
];

function workbookToBuffer(workbook: XLSX.WorkBook): ArrayBuffer {
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("inventory Excel import/export", () => {
  it("produces an import template that passes the importer validation as-is", async () => {
    const csv = await excelBufferToCsvText(workbookToBuffer(await buildInventoryTemplateWorkbook()));
    const products = parseInventoryCsv(csv, "tenant-x", suppliers);
    expect(products).toHaveLength(2);
    expect(products[0].rxRequired).toBe(true);
    expect(products[0].batches[0]).toMatchObject({ batchNo: "MIGRASI", sourceType: "OPENING_STOCK", costPrice: 2500 });
    expect(products[1].batches[0].supplierId).toBe("sup-2");
  });

  it("normalizes Excel date cells to YYYY-MM-DD before parsing", async () => {
    const sheet = XLSX.utils.json_to_sheet([
      {
        name: "Produk Tanggal", category: "RESEP", salePrice: 1000, minStock: 0,
        rxRequired: true, marketplaceEnabled: false, batchNo: "B1",
        qty: 5, expiryISO: new Date(Date.UTC(2027, 5, 30)), sourceType: "OPENING_STOCK",
        active: true, sampleOnly: false,
      },
    ], { header: [...INVENTORY_IMPORT_HEADERS], cellDates: true });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Stok");
    const csv = await excelBufferToCsvText(workbookToBuffer(workbook));
    const products = parseInventoryCsv(csv, "tenant-x", suppliers);
    expect(products[0].batches[0].expiryISO).toBe("2027-06-30");
  });

  it("round-trips an export through Excel back into identical products", async () => {
    const product: DemoProduct = {
      id: "prod-1", tenantId: "tenant-x", name: "Parasetamol 500", category: "Obat Bebas",
      price: 4000, emoji: "💊", gradient: "from-brand-100 to-accent-100", desc: "",
      unit: "strip", rxRequired: false, marketplaceEnabled: false, minStock: 10, code: "PCT500",
      batches: [{ id: "batch-1", batchNo: "A1", qty: 20, expiryISO: "2027-01-31", sourceType: "OPENING_STOCK", costPrice: 2500 }],
    };
    const workbook = await inventoryCsvToWorkbook(serializeInventoryCsv([product], true));
    const csv = await excelBufferToCsvText(workbookToBuffer(workbook));
    const [reimported] = parseInventoryCsv(csv, "tenant-x", suppliers);
    expect(reimported).toMatchObject({ id: "prod-1", name: "Parasetamol 500", price: 4000, code: "PCT500" });
    expect(reimported.batches[0]).toMatchObject({ id: "batch-1", batchNo: "A1", qty: 20, expiryISO: "2027-01-31", costPrice: 2500 });
  });

  it("exports the requested order and preserves batch quantities and the imported historical summary", async () => {
    const product: DemoProduct = {
      id: "p", tenantId: "tenant-x", name: "Produk", code: "KODE-1", category: "RESEP",
      price: 4000, emoji: "", gradient: "", desc: "", unit: "PCS", rxRequired: false,
      marketplaceEnabled: false, minStock: 1,
      legacyStockSummary: { opening: 98, adjustment: 0, incoming: 120, outgoing: 50 },
      batches: [
        { id: "b1", batchNo: "B1", qty: 6, expiryISO: "2027-01-31", costPrice: 1000 },
        { id: "b2", batchNo: "B2", qty: 4, expiryISO: "2027-02-28", costPrice: 2000 },
      ],
    };
    const daily = new Map([["p", { opening: 12, adjustment: -1, sales: 2, incoming: 1, outgoing: 3 }]]);
    const workbook = await inventoryCsvToWorkbook(serializeInventoryCsv([product], true, daily));
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Stok, { header: 1 });
    expect(rows[0].slice(0, 15)).toEqual([
      "urut", "code", "name", "awal", "ajust", "terima", "keluar", "purchasePrice",
      "saldo", "category", "unit", "nilai", "valuta", "supplierName", "transaksi",
    ]);
    expect(rows[1].slice(0, 9)).toEqual([1, "KODE-1", "Produk", 12, -1, 1, 3, 1000, 10]);
    expect(rows[2][8]).toBe(10);
    const [reimported] = parseInventoryCsv(await excelBufferToCsvText(workbookToBuffer(workbook)), "tenant-x");
    expect(reimported.batches.map((batch) => batch.qty)).toEqual([6, 4]);
    expect(reimported.legacyStockSummary).toEqual({ opening: 98, adjustment: 0, incoming: 120, outgoing: 50 });
  });

  it("imports a complete legacy summary without treating it as a sale", async () => {
    const csv = await excelBufferToCsvText(workbookToBuffer(await buildInventoryTemplateWorkbook()));
    const [product] = parseInventoryCsv(csv, "tenant-x", suppliers);
    expect(product.batches[0].qty).toBe(168);
    expect(product.legacyStockSummary).toEqual({ opening: 98, adjustment: 0, incoming: 120, outgoing: 50 });
  });

  it("rejects incomplete or conflicting historical summaries across batches", () => {
    const sheet = XLSX.utils.json_to_sheet([
      { id: "p", name: "Produk", salePrice: 1, rxRequired: false, marketplaceEnabled: false,
        awal: 10, ajust: 0, terima: 0, keluar: 2, batchId: "b1", batchNo: "B1", qty: 3, expiryISO: "2027-01-31" },
      { id: "p", name: "Produk", salePrice: 1, rxRequired: false, marketplaceEnabled: false,
        awal: 11, ajust: 0, terima: 0, keluar: 2, batchId: "b2", batchNo: "B2", qty: 5, expiryISO: "2027-01-31" },
    ], { header: [...INVENTORY_IMPORT_HEADERS] });
    const csv = XLSX.utils.sheet_to_csv(sheet);
    expect(() => parseInventoryCsv(csv, "tenant-x")).toThrow(/ringkasan stok.*harus sama/i);
    const incomplete = XLSX.utils.json_to_sheet([
      { name: "Produk", salePrice: 1, rxRequired: false, marketplaceEnabled: false, awal: 10 },
    ], { header: [...INVENTORY_IMPORT_HEADERS] });
    expect(() => parseInventoryCsv(XLSX.utils.sheet_to_csv(incomplete), "tenant-x")).toThrow(/harus diisi bersama/i);
  });
});
