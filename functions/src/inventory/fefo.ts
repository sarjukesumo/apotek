// FEFO inventory deduction. Idempotent via order.inventoryDeducted flag.
import { db, FieldValue } from "../firebase";

interface Input { tenantId: string; orderId: string; }

export async function deductFefoTask(input: Input): Promise<void> {
  const { tenantId, orderId } = input;
  const oRef = db.doc(`tenants/${tenantId}/marketplaceOrders/${orderId}`);

  const oSnap = await oRef.get();
  if (!oSnap.exists) throw new Error("order not found");
  const order = oSnap.data() as any;
  if (order.inventoryDeducted) return;

  // Pre-fetch batches per product (FEFO order). Reads outside tx are fine; we re-validate inside tx.
  const productIds: string[] = order.items.map((it: any) => it.productId);
  const batchesByProduct = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  await Promise.all(productIds.map(async (pid) => {
    const q = await db.collection(`tenants/${tenantId}/inventoryBatches`)
      .where("productId", "==", pid)
      .where("qtyAvailable", ">", 0)
      .orderBy("qtyAvailable")
      .orderBy("expiryAt", "asc")
      .get();
    batchesByProduct.set(pid, q.docs);
  }));

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(oRef);
    const o = fresh.data() as any;
    if (o.inventoryDeducted) return;

    for (const it of o.items) {
      let need = it.qty as number;
      const docs = batchesByProduct.get(it.productId) ?? [];
      for (const b of docs) {
        if (need <= 0) break;
        const bSnap = await tx.get(b.ref);
        if (!bSnap.exists) continue;
        const bd = bSnap.data() as any;
        const take = Math.min(need, bd.qtyAvailable);
        if (take <= 0) continue;
        tx.update(b.ref, { qtyAvailable: bd.qtyAvailable - take });
        need -= take;
      }
      if (need > 0) throw new Error(`insufficient stock for ${it.productId}, short ${need}`);

      // Decrement product.stock summary
      const prRef = db.doc(`tenants/${tenantId}/products/${it.productId}`);
      const prSnap = await tx.get(prRef);
      if (prSnap.exists) {
        tx.update(prRef, { stock: FieldValue.increment(-it.qty) });
      }
    }
    tx.update(oRef, {
      inventoryDeducted: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}
