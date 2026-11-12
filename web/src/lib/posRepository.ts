import {
  collection, doc, getDocFromServer, getDocs, limit, orderBy, query, runTransaction, serverTimestamp, Timestamp, where,
  type DocumentSnapshot,
} from "firebase/firestore";
import type { DemoProduct } from "./demoStore";
import { pickFefo } from "./fefo";
import { db } from "./firebase";

export type SaleLineInput = { productId: string; qty: number };

export async function completePosSale(input: {
  tenantId: string;
  cashierUid: string;
  cashierName: string;
  requestId: string;
  products: DemoProduct[];
  items: SaleLineInput[];
  discountPct: number;
  paymentMethod: string;
  cashReceived: number;
  isOwner: boolean;
  occurredAtISO?: string;
  expectedPrices?: { productId: string; unitPrice: number }[];
}) {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("client is offline");
  if (!input.items.length || input.items.length > 25) throw new Error("invalid_items");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw new Error("invalid_request_id");
  if (new Set(input.items.map((item) => item.productId)).size !== input.items.length) throw new Error("duplicate_product");
  if (!Number.isInteger(input.discountPct) || input.discountPct < 0 || input.discountPct > 100) throw new Error("invalid_discount");

  const tenantRef = doc(db, `tenants/${input.tenantId}`);
  const requestRef = doc(db, `tenants/${input.tenantId}/posRequests/${input.requestId}`);
  const requestFingerprint = JSON.stringify({
    items: [...input.items].sort((a, b) => a.productId.localeCompare(b.productId)),
    discountPct: input.discountPct, paymentMethod: input.paymentMethod, cashReceived: input.cashReceived,
  });
  const saleRefs = input.items.map((item) => doc(db, `tenants/${input.tenantId}/posSales/${input.requestId}_${item.productId}`));
  const productRefs = input.items.map((item) => doc(db, `tenants/${input.tenantId}/products/${item.productId}`));
  const batchQueries = input.items.map((item) => query(
    collection(db, `tenants/${input.tenantId}/inventoryBatches`),
    where("productId", "==", item.productId),
    where("expiryAt", ">", Timestamp.now()),
    orderBy("expiryAt", "asc"),
    limit(21),
  ));
  const batchCandidates = await Promise.all(batchQueries.map((batchQuery) => getDocs(batchQuery)));
  const batchRefs = batchCandidates.map((snapshot) => snapshot.docs.map((batch) => batch.ref));

  function replaySavedSale(savedSales: DocumentSnapshot[]) {
    if (savedSales.some((sale) => sale.exists())) {
      if (!savedSales.every((sale) => sale.exists())) throw new Error("checkout_request_conflict");
      const items = savedSales.map((sale, index) => {
        const row = sale.data()!;
        if (row.requestFingerprint !== requestFingerprint || row.cashierUid !== input.cashierUid || row.qty !== input.items[index].qty
          || row.discountPct !== input.discountPct || row.paymentMethod !== input.paymentMethod
          || (input.paymentMethod === "TUNAI" && row.cashReceived !== input.cashReceived)) {
          throw new Error("checkout_request_conflict");
        }
        return {
          productId: row.productId as string, name: String(row.items[0].productName),
          qty: row.qty as number, unitPrice: row.unitPrice as number, subtotalRp: row.subtotalRp as number,
          discountRp: row.discountRp as number, totalRp: row.totalRp as number,
        };
      });
      return {
        trxId: String(savedSales[0].data()!.trxId), createdAt: savedSales[0].data()!.createdAt.toDate() as Date,
        items, subtotalRp: items.reduce((sum, item) => sum + item.subtotalRp, 0),
        discountRp: items.reduce((sum, item) => sum + item.discountRp, 0),
        totalRp: items.reduce((sum, item) => sum + item.totalRp, 0), discountPct: input.discountPct,
      };
    }
    return null;
  }

  const commit = () => runTransaction(db, async (transaction) => {
    const savedRequest = await transaction.get(requestRef);
    if (savedRequest.exists() && (savedRequest.data().cashierUid !== input.cashierUid
      || savedRequest.data().requestFingerprint !== requestFingerprint)) throw new Error("checkout_request_conflict");
    const savedSales = await Promise.all(saleRefs.map((ref) => transaction.get(ref)));
    const replay = replaySavedSale(savedSales);
    if (replay) return replay;
    const [tenantSnapshot, productSnapshots, batchSnapshots] = await Promise.all([
      transaction.get(tenantRef),
      Promise.all(productRefs.map((ref) => transaction.get(ref))),
      Promise.all(batchRefs.map((refs) => Promise.all(refs.map((ref) => transaction.get(ref))))),
    ]);
    if (!tenantSnapshot.exists()) throw new Error("tenant_not_found");
    const configuredLimit = tenantSnapshot.data().posSettings?.cashierMaxDiscountPct;
    const cashierLimit = Number.isInteger(configuredLimit) && configuredLimit >= 0 && configuredLimit <= 100
      ? configuredLimit
      : 10;
    if (!input.isOwner && input.discountPct > cashierLimit) throw new Error("discount_limit_exceeded");

    const planned = input.items.map((item, index) => {
      if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 500) throw new Error("invalid_quantity");
      const productSnapshot = productSnapshots[index];
      if (!productSnapshot.exists()) throw new Error("product_not_found");
      const product = productSnapshot.data();
      if (product.active === false || product.sampleOnly === true) throw new Error("product_inactive");
      if (product.rxRequired === true) throw new Error("rx_verification_required");
      if (!Number.isSafeInteger(product.price) || product.price < 0) throw new Error("invalid_product_price");
      const expectedPrice = input.expectedPrices?.find((entry) => entry.productId === item.productId);
      if (input.expectedPrices && (!expectedPrice || expectedPrice.unitPrice !== product.price)) {
        throw new Error("offline_price_changed");
      }
      const batchRows = batchSnapshots[index];
      if (batchRows.length > 20) throw new Error("too_many_batches_for_checkout");
      const batches = batchRows.map((row) => {
        const data = row.data();
        if (!row.exists() || !data) throw new Error("batch_not_found");
        return { ...data, id: row.id };
      }) as DemoProduct["batches"];
      const result = pickFefo(batches, item.qty);
      if (!result) throw new Error("insufficient_stock");
      if (result.consumed.length !== 1) throw new Error("quantity_crosses_batch_boundary");
      return { item, product, productRef: productRefs[index], batchRows, batches, consumed: result.consumed };
    });

    const saleRows = planned.flatMap(({ item, product, batchRows, consumed }) => consumed.map((picked) => {
      const batch = batchRows.find((row) => row.id === picked.batchId);
      const batchData = batch?.data();
      const expiryAt = batchData?.expiryAt;
      if (!batch || !expiryAt || typeof expiryAt.toMillis !== "function") {
        throw new Error("batch_expiry_migration_required");
      }
      const lineSubtotal = picked.qty * product.price;
      const discountRp = Math.round(lineSubtotal * input.discountPct / 100);
      return {
        batch,
        batchData,
        productId: item.productId,
        productName: String(product.name || "Produk"),
        batchId: picked.batchId,
        batchNo: picked.batchNo,
        qty: picked.qty,
        unitPrice: product.price as number,
        subtotalRp: lineSubtotal,
        discountRp,
        totalRp: lineSubtotal - discountRp,
      };
    }));
    if (saleRows.length > 4) throw new Error("sale_has_too_many_batches");

    const trxId = `TRX-${input.requestId.toUpperCase()}`;
    const createdAt = input.occurredAtISO ? new Date(input.occurredAtISO) : new Date();
    if (Number.isNaN(createdAt.getTime())) throw new Error("invalid_sale_date");
    transaction.set(requestRef, {
      requestId: input.requestId, cashierUid: input.cashierUid, requestFingerprint,
      productIds: input.items.map((item) => item.productId), createdAt: serverTimestamp(),
    });
    saleRows.forEach((line) => {
      const saleId = `${input.requestId}_${line.productId}`;
      const saleRef = doc(db, `tenants/${input.tenantId}/posSales/${saleId}`);
      const product = planned.find((entry) => entry.item.productId === line.productId)!;
      transaction.update(line.batch.ref, {
        qty: Number(line.batchData.qty) - line.qty,
        lastSaleId: saleId,
        updatedAt: serverTimestamp(),
      });
      transaction.update(product.productRef, {
        stock: Math.max(0, Number(product.product.stock ?? product.batches.reduce((sum, batch) => sum + batch.qty, 0)) - product.item.qty),
        lastSaleId: saleId,
        updatedAt: serverTimestamp(),
      });
      transaction.set(saleRef, {
        tenantId: input.tenantId,
        requestId: input.requestId,
        requestFingerprint,
        trxId,
        cashierUid: input.cashierUid,
        cashier: input.cashierName,
        dateISO: (() => {
          const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
          }).formatToParts(createdAt);
          const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
          return `${values.year}-${values.month}-${values.day}`;
        })(),
        createdAt: serverTimestamp(),
        productId: line.productId,
        batchId: line.batchId,
        batchNo: line.batchNo,
        qty: line.qty,
        unitPrice: line.unitPrice,
        subtotalRp: line.subtotalRp,
        discountPct: input.discountPct,
        discountRp: line.discountRp,
        totalRp: line.totalRp,
        paymentMethod: input.paymentMethod,
        ...(input.paymentMethod === "TUNAI" ? { cashReceived: input.cashReceived } : {}),
        totalCostStatus: "UNKNOWN",
        items: [{ productId: line.productId, productName: line.productName, qty: line.qty, subtotalRp: line.subtotalRp }],
      });
    });

    const aggregated = new Map<string, { productId: string; name: string; qty: number; unitPrice: number; subtotalRp: number; discountRp: number; totalRp: number }>();
    saleRows.forEach((line) => {
      const current = aggregated.get(line.productId) || {
        productId: line.productId, name: line.productName, qty: 0, unitPrice: line.unitPrice,
        subtotalRp: 0, discountRp: 0, totalRp: 0,
      };
      current.qty += line.qty;
      current.subtotalRp += line.subtotalRp;
      current.discountRp += line.discountRp;
      current.totalRp += line.totalRp;
      aggregated.set(line.productId, current);
    });
    const items = [...aggregated.values()];
    const subtotalRp = items.reduce((sum, item) => sum + item.subtotalRp, 0);
    const discountRp = items.reduce((sum, item) => sum + item.discountRp, 0);
    const totalRp = items.reduce((sum, item) => sum + item.totalRp, 0);
    if (input.paymentMethod === "TUNAI" && input.cashReceived < totalRp) throw new Error("insufficient_cash");
    return { trxId, createdAt, items, subtotalRp, discountRp, totalRp, discountPct: input.discountPct };
  });
  try {
    return await commit();
  } catch (error) {
    // A concurrent commit can cause create-only rules to reject a racing retry.
    if (error && typeof error === "object" && "code" in error && error.code === "permission-denied") {
      const savedRequest = await getDocFromServer(requestRef);
      if (savedRequest.exists() && savedRequest.data().requestFingerprint !== requestFingerprint) {
        throw new Error("checkout_request_conflict");
      }
      const savedSales = await Promise.all(saleRefs.map((ref) => getDocFromServer(ref)));
      const replay = replaySavedSale(savedSales);
      if (replay) return replay;
      // Rules can observe a competing stock decrement before Firestore reports
      // contention. Retry once with fresh reads; unchanged denials still surface.
      return await commit();
    }
    throw error;
  }
}