import {
  collection, deleteField, doc,
  getDocs, getDocsFromCache, getDocsFromServer, limit, onSnapshot, onSnapshotsInSync, orderBy, query, runTransaction, serverTimestamp, setDoc, startAfter, Timestamp, where, writeBatch,
  type DocumentData, type DocumentSnapshot, type Firestore, type QueryDocumentSnapshot, type QuerySnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import type { DemoBatch, DemoProduct } from "./demoStore";

function withoutUndefined(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

function expiryTimestamp(expiryISO: string) {
  const date = new Date(`${expiryISO}T16:59:59.999Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryISO) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== expiryISO) {
    throw new Error("Tanggal kedaluwarsa tidak valid.");
  }
  return Timestamp.fromDate(date);
}

function isNetworkReadError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return (typeof navigator !== "undefined" && !navigator.onLine)
    || code === "unavailable"
    || code === "deadline-exceeded";
}

async function getDocsWithOfflineCache<T>(
  getFromServer: () => Promise<T>,
  getFromCache: () => Promise<T>,
) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return getFromCache();
  try {
    return await getFromServer();
  } catch (error) {
    if (!isNetworkReadError(error)) throw error;
    return getFromCache();
  }
}

export type TenantInventory = { products: DemoProduct[]; tenant: DocumentData | null };

export type InventoryMovementType = "SALE" | "SUPPLIER_RETURN" | "PURCHASE" | "IMPORT" | "ADJUSTMENT" | "BATCH_REMOVAL";
export type InventoryMovement = {
  id: string;
  tenantId: string;
  productId: string;
  productName: string;
  batchId: string;
  batchNo: string;
  movementType: InventoryMovementType;
  quantityDelta: number;
  batchQtyBefore: number;
  batchQtyAfter: number;
  productStockBefore: number;
  productStockAfter: number;
  sourceType?: string;
  referenceId?: string;
  referenceLabel?: string;
  actorUid: string;
  actorName: string;
  createdAt: Timestamp;
};
export type InventoryMovementDraft = Omit<InventoryMovement, "id" | "tenantId" | "createdAt">;
export type InventoryMovementCursor = QueryDocumentSnapshot<DocumentData> | null;

export function createInventoryMovementWrite(tenantId: string, movement: InventoryMovementDraft) {
  return {
    ref: doc(collection(db, `tenants/${tenantId}/inventoryMovements`)),
    data: withoutUndefined({ ...movement, tenantId, createdAt: serverTimestamp() }),
  };
}

export async function loadTenantInventoryMovements(
  tenantId: string,
  productId: string,
  cursor: InventoryMovementCursor = null,
) {
  const movementCollection = collection(db, `tenants/${tenantId}/inventoryMovements`);
  const movementQuery = cursor
    ? query(movementCollection, where("productId", "==", productId), orderBy("createdAt", "desc"), startAfter(cursor), limit(50))
    : query(movementCollection, where("productId", "==", productId), orderBy("createdAt", "desc"), limit(50));
  const snapshot = await getDocs(movementQuery);
  return {
    items: snapshot.docs.map((movementDoc) => ({ ...movementDoc.data(), id: movementDoc.id } as InventoryMovement)),
    cursor: snapshot.docs[snapshot.docs.length - 1] ?? null,
  };
}

export function subscribeDailyInventoryMovements(
  tenantId: string,
  start: Date,
  end: Date,
  onMovements: (movements: InventoryMovement[] | null) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(query(
    collection(db, `tenants/${tenantId}/inventoryMovements`),
    where("createdAt", ">=", Timestamp.fromDate(start)),
    where("createdAt", "<", Timestamp.fromDate(end)),
  ), { includeMetadataChanges: true }, (snapshot) => {
    onMovements(snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites ? null : snapshot.docs.map(
      (movementDoc) => ({ ...movementDoc.data(), id: movementDoc.id } as InventoryMovement),
    ));
  }, onError);
}

function inventoryFromSnapshots(
  tenantId: string, productSnapshot: QuerySnapshot, batchSnapshot: QuerySnapshot,
  tenantSnapshot: DocumentSnapshot, costSnapshot?: QuerySnapshot,
): TenantInventory {
  const costsByBatchId = new Map((costSnapshot?.docs || []).map((costDoc) => [costDoc.id, costDoc.data().costPrice]));

  const batchesByProduct = new Map<string, DemoBatch[]>();
  batchSnapshot.docs.forEach((batchDoc) => {
    const raw = batchDoc.data();
    const { costPrice: legacyCostPrice, ...data } = raw;
    const productId = String(data.productId ?? "");
    if (!productId) return;
    const privateCostPrice = costsByBatchId.get(batchDoc.id);
    const costPrice = costSnapshot
      ? (typeof privateCostPrice === "number" ? privateCostPrice : legacyCostPrice)
      : undefined;
    const batch = { ...data, id: batchDoc.id, ...(typeof costPrice === "number" ? { costPrice } : {}) } as DemoBatch;
    const productBatches = batchesByProduct.get(productId) ?? [];
    productBatches.push(batch);
    batchesByProduct.set(productId, productBatches);
  });

  const products = productSnapshot.docs.map((productDoc) => {
    const data = productDoc.data() as Partial<DemoProduct>;
    return {
      ...data,
      id: productDoc.id,
      tenantId,
      batches: batchesByProduct.get(productDoc.id) ?? (data.batches ?? []).map(({ costPrice, ...batch }) =>
        costSnapshot ? { ...batch, costPrice } : batch),
    } as DemoProduct;
  });

  return {
    products,
    tenant: tenantSnapshot.exists() ? tenantSnapshot.data() : null,
  };
}

type InventorySubscriber = {
  costs: boolean;
  next: (inventory: TenantInventory) => void;
  error: (error: Error) => void;
};
type InventoryStream = {
  subscribers: Set<InventorySubscriber>;
  stop: () => void;
  startCosts: () => void;
  current?: TenantInventory;
  publicCurrent?: TenantInventory;
  error?: Error;
};
const inventoryStreams = new WeakMap<Firestore, Map<string, InventoryStream>>();

export function subscribeTenantInventory(
  tenantId: string, includePurchaseCosts: boolean,
  next: InventorySubscriber["next"], onError: InventorySubscriber["error"],
) {
  const database = db;
  let streams = inventoryStreams.get(database);
  if (!streams) { streams = new Map(); inventoryStreams.set(database, streams); }
  let stream = streams.get(tenantId);
  if (!stream) {
    let products: QuerySnapshot | undefined;
    let batches: QuerySnapshot | undefined;
    let tenant: DocumentSnapshot | undefined;
    let costs: QuerySnapshot | undefined;
    let dirty = false;
    let stopCosts: (() => void) | undefined;
    const stops: Array<() => void> = [];
    const subscribers = new Set<InventorySubscriber>();
    const created: InventoryStream = {
      subscribers,
      stop: () => { stops.forEach((stop) => stop()); stopCosts?.(); },
      startCosts: () => {
        if (stopCosts) return;
        stopCosts = onSnapshot(collection(database, `tenants/${tenantId}/inventoryBatchCosts`),
          { includeMetadataChanges: true }, (snapshot) => {
            costs = snapshot; dirty = true;
          }, fail);
      },
    };
    const fail = (error: Error) => {
      created.error = error;
      created.current = undefined;
      created.publicCurrent = undefined;
      subscribers.forEach((subscriber) => subscriber.error(error));
    };
    const publish = () => {
      if (!dirty || !products || !batches || !tenant || created.error) return;
      const online = typeof navigator === "undefined" || navigator.onLine;
      if (online && [products, batches, tenant].some((snapshot) => snapshot.metadata.fromCache)) return;
      dirty = false;
      created.publicCurrent = inventoryFromSnapshots(tenantId, products, batches, tenant);
      created.current = costs && (!online || !costs.metadata.fromCache)
        ? inventoryFromSnapshots(tenantId, products, batches, tenant, costs) : undefined;
      subscribers.forEach((subscriber) => {
        const value = subscriber.costs ? created.current : created.publicCurrent;
        if (value) subscriber.next(value);
      });
    };
    const offline = () => { dirty = true; publish(); };
    if (typeof window !== "undefined") {
      window.addEventListener("offline", offline);
      stops.push(() => window.removeEventListener("offline", offline));
    }
    const timeout = setTimeout(() => {
      if (!created.publicCurrent || (subscribers.size && [...subscribers].some((subscriber) => subscriber.costs) && !created.current)) {
        fail(new Error("Pemuatan stok belum terkonfirmasi setelah 15 detik. Periksa koneksi lalu buka kembali aplikasi; jika offline, pastikan cache sudah disiapkan."));
      }
    }, 15_000);
    stops.push(() => clearTimeout(timeout));
    stops.push(
      onSnapshot(collection(database, `tenants/${tenantId}/products`), { includeMetadataChanges: true },
        (snapshot) => { products = snapshot; dirty = true; }, fail),
      onSnapshot(collection(database, `tenants/${tenantId}/inventoryBatches`), { includeMetadataChanges: true },
        (snapshot) => { batches = snapshot; dirty = true; }, fail),
      onSnapshot(doc(database, `tenants/${tenantId}`), { includeMetadataChanges: true },
        (snapshot) => { tenant = snapshot; dirty = true; }, fail),
      onSnapshotsInSync(database, publish),
    );
    stream = created;
    streams.set(tenantId, stream);
  }
  const subscriber = { costs: includePurchaseCosts, next, error: onError };
  stream.subscribers.add(subscriber);
  if (includePurchaseCosts) stream.startCosts();
  const current = includePurchaseCosts ? stream.current : stream.publicCurrent;
  if (stream.error) queueMicrotask(() => { if (stream.subscribers.has(subscriber)) onError(stream.error!); });
  else if (current) queueMicrotask(() => { if (stream.subscribers.has(subscriber)) next(current); });
  return () => {
    stream.subscribers.delete(subscriber);
    if (!stream.subscribers.size) {
      stream.stop();
      streams.delete(tenantId);
    }
  };
}

export function loadTenantInventory(tenantId: string, includePurchaseCosts = false): Promise<TenantInventory> {
  return new Promise((resolve, reject) => {
    const stop = subscribeTenantInventory(tenantId, includePurchaseCosts,
      (inventory) => { stop(); resolve(inventory); },
      (error) => { stop(); reject(error); });
  });
}

function productDocumentData(product: DemoProduct, tenantId: string) {
  const { batches, ...fields } = product;
  const data = withoutUndefined({ ...fields, tenantId, active: product.active !== false && product.sampleOnly !== true });
  data.imageUrl = product.imageUrl || deleteField();
  delete data.stock;
  return data;
}

export async function saveTenantProduct(tenantId: string, product: DemoProduct) {
  const ref = doc(db, `tenants/${tenantId}/products/${product.id}`);
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);
    transaction.set(ref, {
      ...productDocumentData(product, tenantId),
      ...(!existing.exists() ? { stock: 0 } : {}),
    }, { merge: true });
  });
}

export async function deleteTenantProduct(tenantId: string, productId: string, includePurchaseCosts = false) {
  const batchSnapshot = await getDocs(query(
    collection(db, `tenants/${tenantId}/inventoryBatches`),
    where("productId", "==", productId),
  ));
  if (batchSnapshot.size > 200) throw new Error("Terlalu banyak batch. Hubungi pengelola untuk penghapusan terencana.");
  const productRef = doc(db, `tenants/${tenantId}/products/${productId}`);
  await runTransaction(db, async (transaction) => {
    const [product, batches] = await Promise.all([
      transaction.get(productRef),
      Promise.all(batchSnapshot.docs.map((batch) => transaction.get(batch.ref))),
    ]);
    if (!product.exists()) throw new Error("Produk tidak ditemukan.");
    if (product.data().stock !== 0 || batches.some((batch) => batch.exists() && batch.data().qty !== 0)) {
      throw new Error("Produk masih memiliki stok. Jangan hapus produk sebelum stok direkonsiliasi.");
    }
    batches.forEach((batch) => {
      transaction.delete(batch.ref);
      if (includePurchaseCosts) transaction.delete(doc(db, `tenants/${tenantId}/inventoryBatchCosts/${batch.id}`));
    });
    transaction.delete(productRef);
  });
}

export async function setTenantProductMarketplace(tenantId: string, productId: string, enabled: boolean) {
  await setDoc(doc(db, `tenants/${tenantId}/products/${productId}`), { marketplaceEnabled: enabled }, { merge: true });
}

export async function saveTenantBatch(
  tenantId: string, productId: string, batch: DemoBatch, includePurchaseCosts: boolean,
  actor: { uid: string; name: string },
) {
  const { costPrice, ...stockBatch } = batch;
  if (!Number.isSafeInteger(batch.qty) || batch.qty < 0) throw new Error("Jumlah batch harus bilangan bulat non-negatif.");
  const batchRef = doc(db, `tenants/${tenantId}/inventoryBatches/${batch.id}`);
  const productRef = doc(db, `tenants/${tenantId}/products/${productId}`);
  const data = withoutUndefined({
    ...stockBatch,
    productId,
    tenantId,
    expiryAt: expiryTimestamp(batch.expiryISO),
    ...(includePurchaseCosts ? { costPrice: deleteField() } : {}),
  });
  await runTransaction(db, async (transaction) => {
    const [existing, product] = await Promise.all([transaction.get(batchRef), transaction.get(productRef)]);
    if (!product.exists()) throw new Error("Produk tidak ditemukan.");
    if (existing.exists() && existing.data().productId !== productId) throw new Error("Batch tidak sesuai dengan produk.");
    const previousQty = existing.exists() ? existing.data().qty : 0;
    const stock = product.data().stock;
    if (!Number.isSafeInteger(previousQty) || !Number.isSafeInteger(stock) || stock + batch.qty - previousQty < 0) {
      throw new Error("Stok produk tidak konsisten. Periksa stok sebelum menyimpan batch.");
    }
    const quantityDelta = batch.qty - previousQty;
    transaction.set(batchRef, data, { merge: true });
    transaction.update(productRef, { stock: stock + quantityDelta });
    if (quantityDelta !== 0) {
      const movement = createInventoryMovementWrite(tenantId, {
        productId,
        productName: String(product.data().name || "Produk"),
        batchId: batch.id,
        batchNo: batch.batchNo,
        movementType: !existing.exists() && batch.sourceType === "PURCHASE" ? "PURCHASE" : "ADJUSTMENT",
        quantityDelta,
        batchQtyBefore: previousQty,
        batchQtyAfter: batch.qty,
        productStockBefore: stock,
        productStockAfter: stock + quantityDelta,
        sourceType: batch.sourceType,
        referenceLabel: !existing.exists() && batch.sourceType === "PURCHASE" ? batch.invoiceNo || "Penerimaan pembelian" : "Kelola batch",
        actorUid: actor.uid,
        actorName: actor.name,
      });
      transaction.set(movement.ref, movement.data);
    }
    if (includePurchaseCosts && typeof costPrice === "number") {
      transaction.set(doc(db, `tenants/${tenantId}/inventoryBatchCosts/${batch.id}`), {
        batchId: batch.id, costPrice, updatedAt: new Date(),
      }, { merge: true });
    }
  });
}

export async function deleteTenantBatch(
  tenantId: string, batchId: string, includePurchaseCosts: boolean,
  actor: { uid: string; name: string },
) {
  const batchRef = doc(db, `tenants/${tenantId}/inventoryBatches/${batchId}`);
  await runTransaction(db, async (transaction) => {
    const batch = await transaction.get(batchRef);
    if (!batch.exists()) throw new Error("Batch tidak ditemukan.");
    const productRef = doc(db, `tenants/${tenantId}/products/${batch.data().productId}`);
    const product = await transaction.get(productRef);
    const stock = product.data()?.stock;
    const qty = batch.data().qty;
    if (!product.exists() || !Number.isSafeInteger(stock) || !Number.isSafeInteger(qty) || stock < qty) {
      throw new Error("Stok produk tidak konsisten. Periksa stok sebelum menghapus batch.");
    }
    transaction.update(productRef, { stock: stock - qty });
    transaction.delete(batchRef);
    if (qty > 0) {
      const movement = createInventoryMovementWrite(tenantId, {
        productId: String(batch.data().productId),
        productName: String(product.data()?.name || "Produk"),
        batchId,
        batchNo: String(batch.data().batchNo || ""),
        movementType: "BATCH_REMOVAL",
        quantityDelta: -qty,
        batchQtyBefore: qty,
        batchQtyAfter: 0,
        productStockBefore: stock,
        productStockAfter: stock - qty,
        sourceType: typeof batch.data().sourceType === "string" ? batch.data().sourceType : undefined,
        referenceLabel: "Batch dihapus dari Inventory",
        actorUid: actor.uid,
        actorName: actor.name,
      });
      transaction.set(movement.ref, movement.data);
    }
    if (includePurchaseCosts) transaction.delete(doc(db, `tenants/${tenantId}/inventoryBatchCosts/${batchId}`));
  });
}

export async function importTenantProducts(
  tenantId: string, products: DemoProduct[], includePurchaseCosts: boolean,
  actor: { uid: string; name: string },
) {
  const batchIds = new Set<string>();
  const productIds = new Set<string>();
  for (const product of products) {
    if (productIds.has(product.id)) throw new Error("Produk duplikat dalam impor.");
    productIds.add(product.id);
    if (product.batches.length > 200) throw new Error("Maksimal 200 batch per produk dalam satu impor.");
    for (const batch of product.batches) {
      if (batchIds.has(batch.id)) throw new Error("ID batch duplikat dalam impor.");
      batchIds.add(batch.id);
      if (!Number.isSafeInteger(batch.qty) || batch.qty < 0) throw new Error("Jumlah batch impor tidak valid.");
      expiryTimestamp(batch.expiryISO);
    }
  }
  let savedProducts = 0;
  for (const product of products) {
    const ref = doc(db, `tenants/${tenantId}/products/${product.id}`);
    const batchRefs = product.batches.map((batch) => doc(db, `tenants/${tenantId}/inventoryBatches/${batch.id}`));
    try {
      await runTransaction(db, async (transaction) => {
        const [existing, oldBatches] = await Promise.all([
          transaction.get(ref), Promise.all(batchRefs.map((batchRef) => transaction.get(batchRef))),
        ]);
        let stock = existing.exists() ? existing.data().stock : 0;
        const productStockBefore = stock;
        if (!Number.isSafeInteger(stock)) throw new Error("Stok produk tidak konsisten.");
        product.batches.forEach((batch, index) => {
          const previous = oldBatches[index];
          if (previous.exists() && previous.data().productId !== product.id) throw new Error("Batch impor milik produk lain.");
          const previousQty = previous.exists() ? previous.data().qty : 0;
          if (!Number.isSafeInteger(previousQty)) throw new Error("Jumlah batch lama tidak valid.");
          stock += batch.qty - previousQty;
        });
        if (!Number.isSafeInteger(stock) || stock < 0) throw new Error("Stok hasil impor tidak valid.");
        transaction.set(ref, { ...productDocumentData(product, tenantId), stock }, { merge: true });
        product.batches.forEach((batch, index) => {
          const { costPrice, ...fields } = batch;
          const previous = oldBatches[index];
          const previousQty = previous.exists() ? previous.data().qty : 0;
          const quantityDelta = batch.qty - previousQty;
          transaction.set(batchRefs[index], withoutUndefined({
            ...fields, productId: product.id, tenantId, expiryAt: expiryTimestamp(batch.expiryISO),
            ...(includePurchaseCosts ? { costPrice: deleteField() } : {}),
          }), { merge: true });
          if (quantityDelta !== 0) {
            const movement = createInventoryMovementWrite(tenantId, {
              productId: product.id,
              productName: product.name,
              batchId: batch.id,
              batchNo: batch.batchNo,
              movementType: "IMPORT",
              quantityDelta,
              batchQtyBefore: previousQty,
              batchQtyAfter: batch.qty,
              productStockBefore,
              productStockAfter: stock,
              sourceType: batch.sourceType,
              referenceLabel: "Impor Excel",
              actorUid: actor.uid,
              actorName: actor.name,
            });
            transaction.set(movement.ref, movement.data);
          }
          if (includePurchaseCosts && typeof costPrice === "number") {
            transaction.set(doc(db, `tenants/${tenantId}/inventoryBatchCosts/${batch.id}`), {
              batchId: batch.id, costPrice, updatedAt: new Date(),
            }, { merge: true });
          }
        });
      });
      savedProducts++;
    } catch (error) {
      throw new Error(`Impor terhenti setelah ${savedProducts} produk tersimpan. Muat ulang Inventory sebelum mencoba lagi. ${error instanceof Error ? error.message : "Penyimpanan gagal."}`, { cause: error });
    }
  }
}

export async function migrateLegacyBatchCosts(tenantId: string) {
  const snapshot = await getDocs(collection(db, `tenants/${tenantId}/inventoryBatches`));
  const migrationRows = snapshot.docs.map((batchDoc) => ({ id: batchDoc.id, data: batchDoc.data() }))
    .filter(({ data }) => typeof data.costPrice === "number" || !(data.expiryAt instanceof Timestamp));
  let migratedCosts = 0;
  let migratedExpiry = 0;

  for (let offset = 0; offset < migrationRows.length; offset += 200) {
    const batch = writeBatch(db);
    migrationRows.slice(offset, offset + 200).forEach(({ id, data }) => {
      const updates: Record<string, unknown> = {};
      if (typeof data.costPrice === "number") {
        batch.set(doc(db, `tenants/${tenantId}/inventoryBatchCosts/${id}`), {
          batchId: id,
          costPrice: data.costPrice,
          migratedAt: new Date(),
        }, { merge: true });
        updates.costPrice = deleteField();
        migratedCosts++;
      }
      if (!(data.expiryAt instanceof Timestamp)) {
        updates.expiryAt = expiryTimestamp(String(data.expiryISO || ""));
        migratedExpiry++;
      }
      batch.update(doc(db, `tenants/${tenantId}/inventoryBatches/${id}`), updates);
    });
    await batch.commit();
  }
  return { migratedCosts, migratedExpiry };
}

export async function loadTenantSuppliers(tenantId: string) {
  const supplierCollection = collection(db, `tenants/${tenantId}/suppliers`);
  const snapshot = await getDocsWithOfflineCache(
    () => getDocsFromServer(supplierCollection),
    () => getDocsFromCache(supplierCollection),
  );
  return snapshot.docs.map((supplierDoc) => {
    const data = supplierDoc.data();
    return {
      id: supplierDoc.id,
      ...data,
      active: data.active !== false,
      returnable: data.returnable === true,
      returnMinDaysBeforeED: typeof data.returnMinDaysBeforeED === "number" ? data.returnMinDaysBeforeED : 0,
    };
  }) as Array<{ id: string; code?: string; name: string; active: boolean; returnable: boolean; returnMinDaysBeforeED: number }>;
}