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
});
