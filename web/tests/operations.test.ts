import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, onSnapshot, setDoc, Timestamp, writeBatch, type Firestore } from "firebase/firestore";
import type { DemoProduct } from "../src/lib/demoStore";
import { IDBFactory } from "fake-indexeddb";

const state = vi.hoisted(() => ({ db: null as Firestore | null }));
vi.mock("../src/lib/firebase", () => ({ get db() { return state.db; } }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return { ...actual, onSnapshot: vi.fn(actual.onSnapshot) };
});
import { deleteTenantBatch, importTenantProducts, loadTenantInventory, saveTenantBatch, saveTenantProduct, subscribeTenantInventory, type TenantInventory } from "../src/lib/inventoryRepository";
import { completePosSale } from "../src/lib/posRepository";
import { businessDate, subscribeMonthlySales } from "../src/lib/salesReporting";
import { decodeBackupValue, downloadManualBackup, encodeBackupValue } from "../src/lib/manualBackup";
import { getQueuedPosSales, queueOfflinePosSale } from "../src/lib/offlinePos";
import { syncQueuedPosSales } from "../src/lib/posSync";
import { createSupplierReturn } from "../src/lib/supplierReturnRepository";
import { completeTrainingSale, readTrainingSales } from "../src/lib/trainingPos";

let environment: RulesTestEnvironment;
const tenantId = "operations";
const product: DemoProduct = {
  id: "medicine", tenantId, name: "QA Medicine", category: "Obat Bebas", price: 2000,
  emoji: "", gradient: "", desc: "", unit: "tablet", rxRequired: false,
  marketplaceEnabled: false, minStock: 1, batches: [],
};
const batch = { id: "batch", batchNo: "QA-BATCH", qty: 10, expiryISO: "2099-12-31" };
const input = {
  tenantId, cashierUid: "cashier", cashierName: "QA Cashier",
  requestId: "123e4567-e89b-42d3-a456-426614174001", products: [], items: [{ productId: product.id, qty: 1 }],
  discountPct: 0, paymentMethod: "TUNAI", cashReceived: 2000, isOwner: false,
};
function asUser(uid: string) {
  const database = environment.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: true }).firestore();
  state.db = database;
  return database;
}
beforeAll(async () => {
  vi.stubGlobal("navigator", { onLine: true });
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
  environment = await initializeTestEnvironment({
    projectId: "demo-apotek-operations",
    firestore: { host, port: Number(port), rules: readFileSync(fileURLToPath(new URL("../../firestore.rules", import.meta.url)), "utf8") },
  });
});
beforeEach(async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("navigator", {
    onLine: true,
    locks: { request: async (_name: string, operation: () => Promise<unknown>) => operation() },
  });
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await setDoc(doc(database, "tenants", tenantId), { profile: { name: "QA" } });
    for (const [uid, role] of [["owner", "OWNER"], ["cashier", "CASHIER"], ["other", "CASHIER"]]) {
      await setDoc(doc(database, "userAccess", uid), { uid, role, tenantId, active: true, email: `${uid}@example.test` });
    }
  });
  asUser("owner");
  await saveTenantProduct(tenantId, product);
  await saveTenantBatch(tenantId, product.id, batch, true);
});
afterAll(async () => { await environment.clearFirestore(); await environment.cleanup(); vi.unstubAllGlobals(); });

it("keeps batch create/update/delete, metadata edits and imports consistent without replacing retained stock", async () => {
  const database = asUser("owner");
  const stock = async () => (await getDoc(doc(database, `tenants/${tenantId}/products/medicine`))).data()?.stock;
  expect(await stock()).toBe(10);
  await saveTenantBatch(tenantId, product.id, { ...batch, qty: 12 }, true);
  expect(await stock()).toBe(12);
  await saveTenantProduct(tenantId, { ...product, name: "Changed", batches: [] });
  expect(await stock()).toBe(12);
  await importTenantProducts(tenantId, [{ ...product, batches: [{ ...batch, id: "second", qty: 3 }] }], true);
  expect(await stock()).toBe(15);
  await deleteTenantBatch(tenantId, "second", true);
  expect(await stock()).toBe(12);
});

it("keeps SAMPLE products unsaleable through edits, import and online/offline checkout", async () => {
  const owner = asUser("owner");
  const sample = { ...product, sampleOnly: true, active: false, code: "QA-SAMPLE", batches: [batch] };
  await saveTenantProduct(tenantId, sample);
  await saveTenantProduct(tenantId, { ...sample, active: true, name: "SAMPLE updated" });
  await importTenantProducts(tenantId, [{ ...sample, active: true }], true);
  expect((await getDoc(doc(owner, `tenants/${tenantId}/products/medicine`))).data()?.active).toBe(false);
  asUser("cashier");
  await expect(completePosSale(input)).rejects.toThrow("product_inactive");
  await expect(queueOfflinePosSale(input, [{ ...sample, active: true }], [], 10)).rejects.toThrow("product_inactive");
});

it("persists local photo data and explicitly removes it when cleared", async () => {
  const owner = asUser("owner");
  await saveTenantProduct(tenantId, { ...product, imageUrl: "data:image/jpeg;base64,YQ==" });
  expect((await getDoc(doc(owner, `tenants/${tenantId}/products/medicine`))).data()?.imageUrl).toBe("data:image/jpeg;base64,YQ==");
  await saveTenantProduct(tenantId, { ...product, imageUrl: undefined });
  expect((await getDoc(doc(owner, `tenants/${tenantId}/products/medicine`))).data()).not.toHaveProperty("imageUrl");
});

it("completes SAMPLE training checkout without database sales or real stock changes", async () => {
  const owner = asUser("owner");
  await saveTenantProduct(tenantId, { ...product, sampleOnly: true, active: false });
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  const inventory = await loadTenantInventory(tenantId);
  const result = await completeTrainingSale({ ...input, products: inventory.products, maxDiscountPct: 10 });
  expect(result.totalRp).toBe(2000);
  expect(readTrainingSales(tenantId).length).toBe(1);
  expect((await getDoc(doc(owner, `tenants/${tenantId}/products/medicine`))).data()?.stock).toBe(10);
  expect((await getDoc(doc(owner, `tenants/${tenantId}/inventoryBatches/batch`))).data()?.qty).toBe(10);
  expect((await getDocs(collection(owner, `tenants/${tenantId}/posSales`))).size).toBe(0);
  expect((await getDocs(collection(owner, `tenants/${tenantId}/posRequests`))).size).toBe(0);
  expect(await getQueuedPosSales(tenantId)).toEqual([]);
});

it("replays a committed checkout without reducing stock again, including after price changes", async () => {
  const cashier = asUser("cashier");
  const first = await completePosSale(input);
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `tenants/${tenantId}/products/medicine`), { price: 9000 }, { merge: true });
  });
  const retry = await completePosSale(input);
  expect(retry.trxId).toBe(first.trxId);
  expect(retry.totalRp).toBe(2000);
  expect((await getDoc(doc(cashier, `tenants/${tenantId}/inventoryBatches/batch`))).data()?.qty).toBe(9);
  await expect(completePosSale({ ...input, items: [{ productId: "medicine", qty: 2 }] })).rejects.toThrow("checkout_request_conflict");
  const other = asUser("other");
  await expect(getDoc(doc(other, `tenants/${tenantId}/posSales/${input.requestId}_medicine`))).rejects.toMatchObject({ code: "permission-denied" });
  await expect(getDocs(collection(cashier, `tenants/${tenantId}/posSales`))).rejects.toMatchObject({ code: "permission-denied" });
});

it("supports four-product atomic checkout and rejects a subset retry", async () => {
  for (let index = 1; index < 4; index++) {
    await saveTenantProduct(tenantId, { ...product, id: `medicine${index}` });
    await saveTenantBatch(tenantId, `medicine${index}`, { ...batch, id: `batch${index}` }, true);
  }
  asUser("cashier");
  const sale = { ...input, cashReceived: 8000, items: [0, 1, 2, 3].map((index) => ({ productId: index ? `medicine${index}` : "medicine", qty: 1 })) };
  expect((await completePosSale(sale)).totalRp).toBe(8000);
  expect((await completePosSale(sale)).totalRp).toBe(8000);
  await expect(completePosSale({ ...sale, items: sale.items.slice(0, 1) })).rejects.toThrow("checkout_request_conflict");
  asUser("owner");
  await saveTenantProduct(tenantId, { ...product, id: "disjoint" });
  await saveTenantBatch(tenantId, "disjoint", { ...batch, id: "disjoint-batch" }, true);
  asUser("cashier");
  await expect(completePosSale({ ...input, items: [{ productId: "disjoint", qty: 1 }] })).rejects.toThrow("checkout_request_conflict");
});

it("serializes concurrent checkout retries using the same request", async () => {
  const cashier = asUser("cashier");
  const receipts = await Promise.all([completePosSale(input), completePosSale(input)]);
  expect(receipts[0].trxId).toBe(receipts[1].trxId);
  expect((await getDoc(doc(cashier, `tenants/${tenantId}/inventoryBatches/batch`))).data()?.qty).toBe(9);
});

it("keeps receipts and stock unchanged when cash is short or prices changed since an offline sale", async () => {
  const cashier = asUser("cashier");
  await expect(completePosSale({ ...input, cashReceived: 1999 })).rejects.toThrow("insufficient_cash");
  await expect(completePosSale({ ...input, expectedPrices: [{ productId: "medicine", unitPrice: 1000 }] })).rejects.toThrow("offline_price_changed");
  expect((await getDoc(doc(cashier, `tenants/${tenantId}/inventoryBatches/batch`))).data()?.qty).toBe(10);
  expect((await getDoc(doc(cashier, `tenants/${tenantId}/posRequests/${input.requestId}`))).exists()).toBe(false);
});

it("keeps two distinct concurrent sales consistent", async () => {
  const cashier = asUser("cashier");
  await Promise.all([
    completePosSale(input),
    completePosSale({ ...input, requestId: "123e4567-e89b-42d3-a456-426614174002" }),
  ]);
  expect((await getDoc(doc(cashier, `tenants/${tenantId}/products/medicine`))).data()?.stock).toBe(8);
  expect((await getDoc(doc(cashier, `tenants/${tenantId}/inventoryBatches/batch`))).data()?.qty).toBe(8);
});

it("recovers a durable pending intent after server commit without decrementing stock twice", async () => {
  const cashier = asUser("cashier");
  await queueOfflinePosSale(input, [{ ...product, batches: [batch] }], [], 10);
  expect((await getQueuedPosSales(tenantId)).length).toBe(1);
  await completePosSale(input);
  const [first, concurrent] = await Promise.all([
    syncQueuedPosSales(tenantId, "cashier"),
    syncQueuedPosSales(tenantId, "cashier"),
  ]);
  expect(first).toEqual({ synced: 1, attention: 0 });
  expect(concurrent).toEqual(first);
  expect(await getQueuedPosSales(tenantId)).toEqual([]);
  expect((await getDoc(doc(cashier, `tenants/${tenantId}/inventoryBatches/batch`))).data()?.qty).toBe(9);
});

it("retains a price-conflicted offline intent for review instead of reporting success", async () => {
  await queueOfflinePosSale(input, [{ ...product, price: 1000, batches: [batch] }], [], 10);
  asUser("cashier");
  expect(await syncQueuedPosSales(tenantId, "cashier")).toEqual({ synced: 0, attention: 1 });
  const pending = await getQueuedPosSales(tenantId);
  expect(pending[0].status).toBe("needs-attention");
  expect(pending[0].lastError).toBe("offline_price_changed");
});

it("loads 3000 products once, reuses listeners and performs bounded POS/stock operations", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    for (let offset = 1; offset < 3000; offset += 200) {
      const writes = writeBatch(database);
      for (let index = offset; index < Math.min(offset + 200, 3000); index++) {
        const id = `scale-${String(index).padStart(4, "0")}`;
        writes.set(doc(database, `tenants/${tenantId}/products/${id}`), { ...product, id, active: true, stock: 100, name: `QA Medicine ${index}` });
        writes.set(doc(database, `tenants/${tenantId}/inventoryBatches/${id}`), {
          ...batch, id, productId: id, qty: 100, expiryAt: Timestamp.fromDate(new Date("2099-12-31")),
        });
      }
      await writes.commit();
    }
  });
  const cashier = asUser("cashier");
  let latest: TenantInventory | undefined;
  const errors: Error[] = [];
  const registrations = vi.mocked(onSnapshot).mock.calls.length;
  const started = performance.now();
  const stop = subscribeTenantInventory(tenantId, false, (value) => { latest = value; }, (error) => { errors.push(error); });
  try {
    const inventory = await loadTenantInventory(tenantId);
    const initialMs = performance.now() - started;
    expect(inventory.products.length).toBe(3000);
    expect(vi.mocked(onSnapshot).mock.calls.length - registrations).toBe(3);
    const cachedStarted = performance.now();
    for (let index = 0; index < 25; index++) {
      expect((await loadTenantInventory(tenantId)).products.length).toBe(3000);
    }
    const repeatedMs = performance.now() - cachedStarted;
    expect(vi.mocked(onSnapshot).mock.calls.length - registrations).toBe(3);
    expect(repeatedMs).toBeLessThan(250);
    const checkoutMs: number[] = [];
    for (let index = 0; index < 20; index++) {
      const start = performance.now();
      const result = await completePosSale({
        ...input, requestId: crypto.randomUUID(), items: [{ productId: "scale-2999", qty: 1 }],
      });
      expect(result.totalRp).toBe(2000);
      checkoutMs.push(performance.now() - start);
    }
    await vi.waitFor(() => expect(latest?.products.find((row) => row.id === "scale-2999")?.batches[0].qty).toBe(80));
    expect((await getDoc(doc(cashier, `tenants/${tenantId}/products/scale-2999`))).data()?.stock).toBe(80);
    expect(errors).toEqual([]);
    checkoutMs.sort((a, b) => a - b);
    const p95Ms = checkoutMs[Math.ceil(checkoutMs.length * 0.95) - 1];
    expect(initialMs).toBeLessThan(10000);
    expect(p95Ms).toBeLessThan(3000);
    console.info("QA_SCALE", JSON.stringify({
      products: 3000, batches: 3000, initialMs: Math.round(initialMs), cached25Ms: Math.round(repeatedMs),
      checkoutCount: checkoutMs.length, checkoutP95Ms: Math.round(p95Ms), checkoutMaxMs: Math.round(checkoutMs.at(-1)!),
      inventoryListeners: vi.mocked(onSnapshot).mock.calls.length - registrations,
    }));
  } finally { stop(); }
}, 90000);

it("keeps live HPP private and releases listeners after the final subscriber", async () => {
  asUser("owner");
  await saveTenantBatch(tenantId, product.id, { ...batch, costPrice: 1250 }, true);
  const registrations = vi.mocked(onSnapshot).mock.calls.length;
  const stop = subscribeTenantInventory(tenantId, true, () => {}, (error) => { throw error; });
  try {
    const owner = await loadTenantInventory(tenantId, true);
    const publicView = await loadTenantInventory(tenantId);
    expect(owner.products[0].batches[0].costPrice).toBe(1250);
    expect(publicView.products[0].batches[0]).not.toHaveProperty("costPrice");
    expect(vi.mocked(onSnapshot).mock.calls.length - registrations).toBe(4);
  } finally { stop(); }
  await loadTenantInventory(tenantId);
  expect(vi.mocked(onSnapshot).mock.calls.length - registrations).toBe(7);
  const cashier = asUser("cashier");
  await expect(loadTenantInventory(tenantId, true)).rejects.toMatchObject({ code: "permission-denied" });
  expect((await getDoc(doc(cashier, `tenants/${tenantId}/products/medicine`))).exists()).toBe(true);
});

it("handles cash, debit and transfer with discounts and rejects excessive cashier discounts", async () => {
  const cashier = asUser("cashier");
  for (const paymentMethod of ["TUNAI", "DEBIT", "TRANSFER"]) {
    const receipt = await completePosSale({
      ...input, requestId: crypto.randomUUID(), paymentMethod, discountPct: 10,
      cashReceived: paymentMethod === "TUNAI" ? 2000 : 0,
    });
    expect(receipt).toMatchObject({ subtotalRp: 2000, discountRp: 200, totalRp: 1800 });
  }
  await expect(completePosSale({ ...input, discountPct: 11 })).rejects.toThrow("discount_limit_exceeded");
  expect((await getDoc(doc(cashier, `tenants/${tenantId}/products/medicine`))).data()?.stock).toBe(7);
});

it("does not oversell the last unit when two different requests race", async () => {
  await saveTenantBatch(tenantId, product.id, { ...batch, qty: 1 }, true);
  const cashier = asUser("cashier");
  const results = await Promise.allSettled([
    completePosSale(input), completePosSale({ ...input, requestId: crypto.randomUUID() }),
  ]);
  expect(results.filter((result) => result.status === "fulfilled").length).toBe(1);
  expect(results.filter((result) => result.status === "rejected").length).toBe(1);
  expect((await getDoc(doc(cashier, `tenants/${tenantId}/products/medicine`))).data()?.stock).toBe(0);
  expect((await getDoc(doc(cashier, `tenants/${tenantId}/inventoryBatches/batch`))).data()?.qty).toBe(0);
});

it("rejects prescription and expired-only inventory without recording any sale", async () => {
  asUser("owner");
  await saveTenantProduct(tenantId, { ...product, rxRequired: true });
  asUser("cashier");
  await expect(completePosSale(input)).rejects.toThrow("rx_verification_required");
  asUser("owner");
  await saveTenantProduct(tenantId, product);
  await saveTenantBatch(tenantId, product.id, { ...batch, expiryISO: "2000-01-01" }, true);
  asUser("cashier");
  await expect(completePosSale(input)).rejects.toThrow("insufficient_stock");
  const owner = asUser("owner");
  expect((await getDocs(collection(owner, `tenants/${tenantId}/posSales`))).size).toBe(0);
});

it("uses offline cache for inventory without allowing an offline server checkout", async () => {
  const database = asUser("cashier");
  await loadTenantInventory(tenantId);
  const { disableNetwork, enableNetwork } = await import("firebase/firestore");
  await disableNetwork(database);
  vi.stubGlobal("navigator", { onLine: false });
  try {
    const cached = await loadTenantInventory(tenantId);
    expect(cached.products[0].batches[0].qty).toBe(10);
    await expect(completePosSale(input)).rejects.toThrow();
  } finally {
    vi.stubGlobal("navigator", { onLine: true });
    await enableNetwork(database);
  }
});

it("preserves stock across receipt, supplier return, POS and failed excessive return", async () => {
  const owner = asUser("owner");
  await setDoc(doc(owner, `tenants/${tenantId}/suppliers/supplier`), {
    name: "QA Supplier", active: true, returnable: true, returnMinDaysBeforeED: 30,
  });
  await saveTenantBatch(tenantId, product.id, {
    ...batch, qty: 30, sourceType: "PURCHASE", supplierId: "supplier", costPrice: 1000,
  }, true);
  const returnInput = {
    tenantId, supplierId: "supplier", batchId: batch.id, qty: 5, reason: "OVERSTOCK" as const, notes: "QA", createdBy: "owner",
  };
  await createSupplierReturn(returnInput);
  const first = await completePosSale({ ...input, cashierUid: "owner", isOwner: true, items: [{ productId: product.id, qty: 2 }], cashReceived: 4000 });
  expect(first.totalRp).toBe(4000);
  await expect(createSupplierReturn({ ...returnInput, qty: 24 })).rejects.toThrow("return_qty_exceeds_stock");
  expect((await getDoc(doc(owner, `tenants/${tenantId}/products/medicine`))).data()?.stock).toBe(23);
  expect((await getDoc(doc(owner, `tenants/${tenantId}/inventoryBatches/batch`))).data()?.qty).toBe(23);
  expect((await getDocs(collection(owner, `tenants/${tenantId}/supplierReturns`))).size).toBe(1);
});

it("reports all monthly rows beyond 500 and uses Jakarta date at month rollover", async () => {
  expect(businessDate(new Date("2026-10-31T17:01:00Z"))).toBe("2026-11-01");
  await environment.withSecurityRulesDisabled(async (context) => {
    for (let offset = 0; offset < 505; offset += 100) {
      await Promise.all(Array.from({ length: Math.min(100, 505 - offset) }, (_, index) =>
        setDoc(doc(context.firestore(), `tenants/${tenantId}/posSales/row-${index + offset}`), { dateISO: businessDate(), totalRp: 1 })));
    }
  });
  asUser("owner");
  await new Promise<void>((resolve, reject) => {
    const stop = subscribeMonthlySales(tenantId, (rows) => {
      try { expect(rows.length).toBe(505); stop(); resolve(); } catch (error) { stop(); reject(error); }
    }, reject);
  });
});

it("creates a paginated typed backup without silently omitting sale rows", async () => {
  const { Timestamp } = await import("firebase/firestore");
  expect(encodeBackupValue(new Timestamp(100, 123))).toEqual({ type: "timestamp", seconds: 100, nanoseconds: 123 });
  await environment.withSecurityRulesDisabled(async (context) => {
    await Promise.all(Array.from({ length: 251 }, (_, index) => setDoc(doc(context.firestore(), `tenants/${tenantId}/posSales/backup-${index}`), { qty: 1 })));
  });
  let downloaded: Blob | undefined;
  const createUrl = vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => { downloaded = blob as Blob; return "blob:test"; });
  vi.stubGlobal("document", { createElement: () => ({ click: vi.fn() }) });
  const count = await downloadManualBackup(tenantId);
  expect(count).toBeGreaterThanOrEqual(256);
  const backup = JSON.parse(await downloaded!.text());
  expect(backup.records.filter((row: { path: string }) => row.path.includes("/posSales/")).length).toBe(251);
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    for (const row of backup.records as Array<{ path: string; data: unknown }>) {
      await setDoc(doc(context.firestore(), row.path), decodeBackupValue(row.data) as Record<string, unknown>);
    }
    const restoredBatch = await getDoc(doc(context.firestore(), `tenants/${tenantId}/inventoryBatches/batch`));
    expect(restoredBatch.data()?.qty).toBe(10);
    expect(restoredBatch.data()?.expiryAt).toBeInstanceOf(Timestamp);
    expect((await getDocs(collection(context.firestore(), `tenants/${tenantId}/posSales`))).size).toBe(251);
  });
  createUrl.mockRestore();
});
