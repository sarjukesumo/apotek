import type { DemoBatch, DemoProduct } from "./demoStore";
import type { DailyInventorySummary } from "./dailyInventory";

const HEADERS = [
  "urut", "code", "name", "awal", "ajust", "terima", "keluar", "purchasePrice",
  "saldo", "category", "unit", "nilai", "valuta", "supplierName", "transaksi",
  "id", "salePrice", "minStock", "rxRequired", "marketplaceEnabled", "desc",
  "emoji", "gradient", "imageUrl", "batchId", "batchNo", "qty", "expiryISO",
  "sourceType", "supplierId", "supplierCode", "purchaseDate", "invoiceNo",
  "poId", "grnId", "active", "sampleOnly", "riwayatAwal", "riwayatAjust",
  "riwayatTerima", "riwayatKeluar", "riwayatTransaksi",
];

export const INVENTORY_IMPORT_HEADERS: readonly string[] = HEADERS;

const HEADER_ALIASES: Record<string, string> = {
  price: "salePrice",
  costPrice: "purchasePrice",
};
const OPTIONAL_LEGACY_HEADERS = new Set([
  "sourceType", "supplierCode", "supplierName", "purchaseDate", "invoiceNo", "code", "active", "sampleOnly",
  "urut", "awal", "ajust", "terima", "keluar", "saldo", "nilai", "valuta", "transaksi",
  "riwayatAwal", "riwayatAjust", "riwayatTerima", "riwayatKeluar", "riwayatTransaksi",
]);
export type ImportSupplier = { id: string; code?: string; name: string; active: boolean; returnable: boolean; returnMinDaysBeforeED: number };
export type InventorySourceType = "PURCHASE" | "OPENING_STOCK" | "TRANSFER" | "DONATION" | "UNKNOWN";

function csvEscape(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error("CSV tidak valid: tanda kutip belum ditutup.");
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function parseBoolean(value: string, field: string, rowNumber: number) {
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "ya", "yes"].includes(normalized)) return true;
  if (["false", "0", "tidak", "no"].includes(normalized)) return false;
  throw new Error(`Baris ${rowNumber}: kolom ${field} harus true atau false.`);
}

function parseNumber(value: string, field: string, rowNumber: number, fallback?: number) {
  if (value.trim() === "" && fallback !== undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`Baris ${rowNumber}: kolom ${field} harus angka nol atau lebih.`);
  }
  return number;
}

export function serializeInventoryCsv(
  products: DemoProduct[],
  includePurchasePrice = true,
  dailySummaries?: Map<string, DailyInventorySummary>,
) {
  const rows = [HEADERS];
  for (const [index, product] of products.entries()) {
    const batches = product.batches.length ? product.batches : [null];
    const saldo = product.batches.reduce((sum, batch) => sum + batch.qty, 0);
    const summary = dailySummaries?.get(product.id);
    const hasCosts = product.batches.every((batch) => batch.qty === 0 || typeof batch.costPrice === "number");
    const nilai = includePurchasePrice && hasCosts
      ? product.batches.reduce((sum, batch) => sum + batch.qty * (batch.costPrice ?? 0), 0)
      : undefined;
    for (const batch of batches) {
      const values: Record<string, unknown> = {
        urut: index + 1, code: product.code, name: product.name,
        awal: dailySummaries ? summary?.opening ?? saldo : undefined,
        ajust: dailySummaries ? summary?.adjustment ?? 0 : undefined,
        terima: dailySummaries ? summary?.incoming ?? 0 : undefined,
        keluar: dailySummaries ? summary?.outgoing ?? 0 : undefined,
        transaksi: dailySummaries ? summary?.sales ?? 0 : undefined,
        purchasePrice: includePurchasePrice ? batch?.costPrice : undefined,
        saldo, category: product.category, unit: product.unit, nilai, valuta: "IDR",
        supplierName: batch?.supplierName, id: product.id, salePrice: product.price,
        minStock: product.minStock, rxRequired: product.rxRequired,
        marketplaceEnabled: product.marketplaceEnabled, desc: product.desc, emoji: product.emoji,
        gradient: product.gradient, imageUrl: product.imageUrl, batchId: batch?.id,
        batchNo: batch?.batchNo, qty: batch?.qty, expiryISO: batch?.expiryISO,
        sourceType: batch?.sourceType || (batch?.supplierId ? "PURCHASE" : "OPENING_STOCK"),
        supplierId: batch?.supplierId, supplierCode: batch?.supplierCode,
        purchaseDate: batch?.purchaseDateISO, invoiceNo: batch?.invoiceNo,
        poId: batch?.poId, grnId: batch?.grnId,
        active: product.active !== false && !product.sampleOnly, sampleOnly: product.sampleOnly === true,
        riwayatAwal: product.legacyStockSummary?.opening,
        riwayatAjust: product.legacyStockSummary?.adjustment,
        riwayatTerima: product.legacyStockSummary?.incoming,
        riwayatKeluar: product.legacyStockSummary?.outgoing,
        riwayatTransaksi: product.legacyStockSummary?.sales,
      };
      rows.push(HEADERS.map((header) => csvEscape(values[header])));
    }
  }
  return `\uFEFF${rows.map((row) => row.join(",")).join("\r\n")}`;
}

// Lists supplier references (code/name) used by batch rows so missing master
// suppliers can be auto-registered before the import is parsed and validated.
export function listCsvSupplierRefs(text: string): Array<{ code?: string; name: string }> {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => HEADER_ALIASES[header.trim()] || header.trim());
  const nameIndex = headers.indexOf("supplierName");
  const codeIndex = headers.indexOf("supplierCode");
  if (nameIndex < 0 && codeIndex < 0) return [];
  const seen = new Map<string, { code?: string; name: string }>();
  rows.slice(1).forEach((cells) => {
    const name = (nameIndex >= 0 ? cells[nameIndex] || "" : "").trim();
    const code = (codeIndex >= 0 ? cells[codeIndex] || "" : "").trim().toUpperCase();
    if (!name) return;
    const key = code || name.toLowerCase();
    if (!seen.has(key)) seen.set(key, { code: code || undefined, name });
  });
  return [...seen.values()];
}

export function parseInventoryCsv(text: string, tenantId: string, suppliers: ImportSupplier[] = []): DemoProduct[] {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("CSV tidak berisi data produk.");

  const headers = rows[0].map((header) => {
    const trimmed = header.trim();
    return HEADER_ALIASES[trimmed] || trimmed;
  });
  if (new Set(headers).size !== headers.length || HEADERS.some((header) => !OPTIONAL_LEGACY_HEADERS.has(header) && !headers.includes(header))) {
    throw new Error("Format CSV tidak sesuai. Gunakan file hasil Ekspor CSV sebagai template.");
  }

  const grouped = new Map<string, DemoProduct>();
  rows.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;
    const value = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? ""])) as Record<string, string>;
    const name = value.name.trim();
    if (!name) throw new Error(`Baris ${rowNumber}: nama produk wajib diisi.`);

    const hasHistoricalFields = ["riwayatAwal", "riwayatAjust", "riwayatTerima", "riwayatKeluar", "riwayatTransaksi"]
      .some((field) => (value[field] || "").trim() !== "");
    const summaryFields = hasHistoricalFields
      ? ["riwayatAwal", "riwayatAjust", "riwayatTerima", "riwayatKeluar"]
      : ["awal", "ajust", "terima", "keluar"];
    const [openingField, adjustmentField, incomingField, outgoingField] = summaryFields;
    const salesField = hasHistoricalFields ? "riwayatTransaksi" : "transaksi";
    const hasSummary = summaryFields.some((field) => (value[field] || "").trim() !== "") || !!value[salesField]?.trim();
    let legacyStockSummary: DemoProduct["legacyStockSummary"];
    if (hasSummary) {
      if (summaryFields.some((field) => !(value[field] || "").trim())) {
        throw new Error(`Baris ${rowNumber}: ${summaryFields.join(", ")} harus diisi bersama.`);
      }
      const adjustment = Number(value[adjustmentField]);
      if (!Number.isSafeInteger(adjustment)) throw new Error(`Baris ${rowNumber}: ${adjustmentField} harus bilangan bulat.`);
      const opening = parseNumber(value[openingField], openingField, rowNumber);
      const incoming = parseNumber(value[incomingField], incomingField, rowNumber);
      const outgoing = parseNumber(value[outgoingField], outgoingField, rowNumber);
      const sales = value[salesField]?.trim() ? parseNumber(value[salesField], salesField, rowNumber) : undefined;
      if (![opening, incoming, outgoing, ...(sales === undefined ? [] : [sales])].every(Number.isSafeInteger)) {
        throw new Error(`Baris ${rowNumber}: ringkasan stok harus menggunakan jumlah unit bulat.`);
      }
      legacyStockSummary = { opening, adjustment, incoming, outgoing, ...(sales === undefined ? {} : { sales }) };
    }

    const id = value.id.trim();
    const key = id || `name:${name.toLocaleLowerCase("id-ID")}`;
    let product = grouped.get(key);
    if (!product) {
      product = {
        id: id || crypto.randomUUID(),
        tenantId,
        name,
        category: value.category.trim() || "Lainnya",
        price: parseNumber(value.salePrice, "salePrice", rowNumber),
        unit: value.unit.trim() || "pcs",
        minStock: parseNumber(value.minStock, "minStock", rowNumber, 0),
        rxRequired: parseBoolean(value.rxRequired, "rxRequired", rowNumber),
        marketplaceEnabled: parseBoolean(value.marketplaceEnabled, "marketplaceEnabled", rowNumber),
        desc: value.desc,
        emoji: value.emoji || "💊",
        gradient: value.gradient || "from-brand-100 to-accent-100",
        imageUrl: value.imageUrl || undefined,
        code: value.code || undefined,
        active: value.active ? parseBoolean(value.active, "active", rowNumber) : true,
        sampleOnly: value.sampleOnly ? parseBoolean(value.sampleOnly, "sampleOnly", rowNumber) : false,
        ...(legacyStockSummary ? { legacyStockSummary } : {}),
        batches: [],
      };
      grouped.set(key, product);
    } else if (product.name !== name) {
      throw new Error(`Baris ${rowNumber}: ID produk yang sama memiliki nama berbeda.`);
    } else if (JSON.stringify(product.legacyStockSummary) !== JSON.stringify(legacyStockSummary)) {
      throw new Error(`Baris ${rowNumber}: ringkasan stok untuk produk yang sama harus sama pada setiap batch.`);
    }

    const hasBatchData = ["batchNo", "qty", "expiryISO", "supplierCode", "supplierName", "purchaseDate", "invoiceNo", "purchasePrice", "sourceType"]
      .some((field) => (value[field] || "").trim() !== "");
    if (hasBatchData) {
      const batchNo = value.batchNo.trim();
      const expiryISO = value.expiryISO.trim();
      if (!batchNo || !/^\d{4}-\d{2}-\d{2}$/.test(expiryISO)) {
        throw new Error(`Baris ${rowNumber}: batchNo dan expiryISO (YYYY-MM-DD) wajib diisi.`);
      }
      const supplierCode = (value.supplierCode || "").trim().toUpperCase();
      const supplierNameInput = (value.supplierName || "").trim();
      const supplierIdInput = (value.supplierId || "").trim();
      const supplier = suppliers.find((item) =>
        (supplierCode && item.code?.trim().toUpperCase() === supplierCode)
        || (supplierIdInput && item.id === supplierIdInput)
        || (supplierNameInput && item.name.trim().toLowerCase() === supplierNameInput.toLowerCase())
      );
      if ((supplierCode || supplierNameInput || supplierIdInput) && !supplier) {
        throw new Error(`Baris ${rowNumber}: pemasok tidak ditemukan. Periksa supplierCode/nama di menu Pemasok.`);
      }
      const purchasePriceInput = (value.purchasePrice || "").trim();
      const requestedSource = (value.sourceType || "").trim().toUpperCase() as InventorySourceType | "";
      const sourceType: InventorySourceType = requestedSource || (supplier || purchasePriceInput ? "PURCHASE" : "OPENING_STOCK");
      if (!["PURCHASE", "OPENING_STOCK", "TRANSFER", "DONATION", "UNKNOWN"].includes(sourceType)) {
        throw new Error(`Baris ${rowNumber}: sourceType tidak dikenal.`);
      }
      const purchaseDate = (value.purchaseDate || "").trim();
      if (sourceType === "PURCHASE" && !supplier) {
        throw new Error(`Baris ${rowNumber}: batch PURCHASE wajib memiliki pemasok terdaftar.`);
      }
      if (sourceType === "PURCHASE" && !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
        throw new Error(`Baris ${rowNumber}: batch PURCHASE wajib memiliki purchaseDate (YYYY-MM-DD).`);
      }
      if (sourceType === "PURCHASE" && !supplier) {
        throw new Error(`Baris ${rowNumber}: batch PURCHASE wajib memiliki supplierCode/nama pemasok yang sudah terdaftar.`);
      }
      if (sourceType === "PURCHASE" && !purchasePriceInput) {
        throw new Error(`Baris ${rowNumber}: batch PURCHASE wajib memiliki purchasePrice.`);
      }
      const batch: DemoBatch = {
        id: value.batchId.trim() || crypto.randomUUID(),
        batchNo,
        expiryISO,
        qty: parseNumber(value.qty, "qty", rowNumber),
        sourceType,
        supplierId: supplier?.id,
        supplierCode: supplier?.code,
        supplierName: supplier?.name || (sourceType === "OPENING_STOCK" ? "Stok awal" : undefined),
        purchaseDateISO: purchaseDate || undefined,
        invoiceNo: (value.invoiceNo || "").trim() || undefined,
        costPrice: purchasePriceInput ? parseNumber(purchasePriceInput, "purchasePrice", rowNumber) : undefined,
        poId: value.poId.trim() || undefined,
        grnId: value.grnId.trim() || undefined,
      };
      product.batches.push(batch);
    }
  });

  return [...grouped.values()];
}