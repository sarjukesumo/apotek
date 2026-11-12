import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { batchZone, daysToExpiry } from "./fefo";
import { db } from "./firebase";

export type SupplierReturnReason = "NEAR_EXPIRY" | "DAMAGED" | "WRONG_ITEM" | "RECALL" | "OVERSTOCK" | "OTHER";

export async function createSupplierReturn(input: {
  tenantId: string;
  supplierId: string;
  batchId: string;
  qty: number;
  reason: SupplierReturnReason;
  notes: string;
  createdBy: string;
}) {
  if (!Number.isInteger(input.qty) || input.qty <= 0) throw new Error("invalid_return_qty");
  const supplierRef = doc(db, `tenants/${input.tenantId}/suppliers/${input.supplierId}`);
  const batchRef = doc(db, `tenants/${input.tenantId}/inventoryBatches/${input.batchId}`);
  const returnRef = doc(db, `tenants/${input.tenantId}/supplierReturns/${crypto.randomUUID()}`);

  await runTransaction(db, async (transaction) => {
    const [supplierSnapshot, batchSnapshot] = await Promise.all([
      transaction.get(supplierRef),
      transaction.get(batchRef),
    ]);
    if (!supplierSnapshot.exists()) throw new Error("supplier_not_found");
    if (!batchSnapshot.exists()) throw new Error("batch_not_found");
    const supplier = supplierSnapshot.data();
    const batch = batchSnapshot.data();
    if (supplier.active === false || supplier.returnable !== true) throw new Error("supplier_not_returnable");
    if (batch.supplierId !== input.supplierId || batch.sourceType !== "PURCHASE") throw new Error("batch_supplier_mismatch");
    if ((batch.qty || 0) < input.qty) throw new Error("return_qty_exceeds_stock");
    const daysLeft = daysToExpiry(String(batch.expiryISO || ""));
    if (batchZone(String(batch.expiryISO || "")) === "EXPIRED") throw new Error("expired_batch_requires_disposal");
    if (daysLeft < (supplier.returnMinDaysBeforeED || 0)) throw new Error("supplier_return_window_passed");
    if (typeof batch.productId !== "string" || !batch.productId) throw new Error("batch_missing_product");

    const productRef = doc(db, `tenants/${input.tenantId}/products/${batch.productId}`);
    const productSnapshot = await transaction.get(productRef);
    if (!productSnapshot.exists()) throw new Error("product_not_found");
    const product = productSnapshot.data();
    const qtyRemaining = batch.qty - input.qty;
    const stockRemaining = Math.max(0, Number(product.stock || 0) - input.qty);
    const unitCost = typeof batch.costPrice === "number" ? batch.costPrice : null;

    transaction.update(batchRef, { qty: qtyRemaining, updatedAt: serverTimestamp() });
    transaction.update(productRef, { stock: stockRemaining, updatedAt: serverTimestamp() });
    transaction.set(returnRef, {
      tenantId: input.tenantId,
      supplierId: input.supplierId,
      supplierCode: supplier.code || null,
      supplierName: supplier.name || input.supplierId,
      productId: batch.productId,
      productName: product.name || "",
      batchId: input.batchId,
      batchNo: batch.batchNo || "",
      expiryISO: batch.expiryISO,
      purchaseDateISO: batch.purchaseDateISO || null,
      invoiceNo: batch.invoiceNo || null,
      qty: input.qty,
      unitCostPrice: unitCost,
      valueRp: unitCost === null ? null : unitCost * input.qty,
      reason: input.reason,
      notes: input.notes.trim(),
      status: "SENT",
      createdBy: input.createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  return returnRef.id;
}