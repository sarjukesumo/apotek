import { describe, expect, it } from "vitest";
import { parseInventoryCsv, serializeInventoryCsv, type ImportSupplier } from "../src/lib/inventoryCsv";
import type { DemoProduct } from "../src/lib/demoStore";

const supplier: ImportSupplier = {
  id: "supplier-1",
  code: "SUP-001",
  name: "Supplier Satu",
  active: true,
  returnable: true,
  returnMinDaysBeforeED: 60,
};

const purchaseProduct: DemoProduct = {
  id: "product-1",
  tenantId: "tenant-1",
  name: "Paracetamol 500 mg",
  category: "Obat Bebas",
  price: 2500,
  unit: "tablet",
  minStock: 10,
  rxRequired: false,
  marketplaceEnabled: false,
  desc: "",
  emoji: "💊",
  gradient: "from-brand-100 to-accent-100",
  batches: [{
    id: "batch-1",
    batchNo: "BATCH-1",
    qty: 100,
    expiryISO: "2027-12-31",
    sourceType: "PURCHASE",
    supplierId: supplier.id,
    supplierCode: supplier.code,
    supplierName: supplier.name,
    purchaseDateISO: "2026-10-01",
    invoiceNo: "INV-001",
    costPrice: 1200,
  }],
};

describe("inventory CSV import/export", () => {
  it("preserves sample protection, inactive status and source codes on round-trip", () => {
    const [sample] = parseInventoryCsv(serializeInventoryCsv([{
      ...purchaseProduct, code: "A-B VAS00AB1", sampleOnly: true, active: false,
    }]), "tenant-1", [supplier]);
    expect(sample).toMatchObject({ code: "A-B VAS00AB1", sampleOnly: true, active: false });
  });
  it("round-trips sale price and per-batch purchase provenance", () => {
    const csv = serializeInventoryCsv([purchaseProduct]);
    const [product] = parseInventoryCsv(csv, "tenant-1", [supplier]);
    expect(product.price).toBe(2500);
    expect(product.batches[0]).toMatchObject({
      sourceType: "PURCHASE",
      supplierId: supplier.id,
      supplierCode: supplier.code,
      supplierName: supplier.name,
      purchaseDateISO: "2026-10-01",
      invoiceNo: "INV-001",
      costPrice: 1200,
    });
  });

  it("keeps legacy price/costPrice headers readable when the supplier ID exists", () => {
    const csv = serializeInventoryCsv([purchaseProduct])
      .replace("salePrice", "price")
      .replace("purchasePrice", "costPrice");
    const [product] = parseInventoryCsv(csv, "tenant-1", [supplier]);
    expect(product.price).toBe(2500);
    expect(product.batches[0].costPrice).toBe(1200);
  });

  it("allows an explicit opening-stock batch without a supplier or purchase cost", () => {
    const openingStock = {
      ...purchaseProduct,
      batches: [{ id: "batch-opening", batchNo: "OPEN-1", qty: 20, expiryISO: "2027-12-31", sourceType: "OPENING_STOCK" as const }],
    };
    const [product] = parseInventoryCsv(serializeInventoryCsv([openingStock]), "tenant-1", []);
    expect(product.batches[0]).toMatchObject({ sourceType: "OPENING_STOCK", qty: 20 });
    expect(product.batches[0].supplierId).toBeUndefined();
  });

  it("rejects a purchase batch without a registered supplier", () => {
    const csv = serializeInventoryCsv([purchaseProduct]);
    expect(() => parseInventoryCsv(csv, "tenant-1", [])).toThrow(/pemasok tidak ditemukan/i);
  });

  it("rejects purchase rows missing a purchase date or cost", () => {
    const missingDate = serializeInventoryCsv([purchaseProduct]).replace("2026-10-01", "");
    expect(() => parseInventoryCsv(missingDate, "tenant-1", [supplier])).toThrow(/purchaseDate/i);
    const missingCost = serializeInventoryCsv([purchaseProduct]).replace(",1200,", ",,");
    expect(() => parseInventoryCsv(missingCost, "tenant-1", [supplier])).toThrow(/purchasePrice/i);
  });
});
