import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DemoProduct } from "../src/lib/demoStore";
import { applyTrainingSales, completeTrainingSale, readTrainingSales, resetTrainingSales } from "../src/lib/trainingPos";

const sample: DemoProduct = {
  id: "sample-1", tenantId: "qa", code: "QA", name: "[SAMPLE] QA Medicine", category: "Lainnya",
  price: 1400, unit: "tablet", active: false, sampleOnly: true, rxRequired: true, minStock: 1,
  emoji: "", gradient: "", desc: "Contoh", marketplaceEnabled: false,
  batches: [{ id: "sample-batch", batchNo: "SAMPLE", qty: 5, expiryISO: "2099-12-31" }],
};
const input = {
  tenantId: "qa", requestId: "123e4567-e89b-42d3-a456-426614174001", items: [{ productId: sample.id, qty: 1 }],
  discountPct: 0, maxDiscountPct: 10, paymentMethod: "TUNAI", cashReceived: 2000, products: [sample],
};
let stored: Map<string, string>;
beforeEach(() => {
  stored = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
  let tail = Promise.resolve();
  vi.stubGlobal("navigator", { locks: { request: (_key: string, operation: () => Promise<unknown>) => {
    const result = tail.then(operation);
    tail = result.then(() => {}, () => {});
    return result;
  } } });
});
afterEach(() => vi.unstubAllGlobals());

it("simulates cash, debit and transfer without modifying source products", async () => {
  for (const paymentMethod of ["TUNAI", "DEBIT", "TRANSFER"]) {
    const receipt = await completeTrainingSale({ ...input, requestId: crypto.randomUUID(), paymentMethod, discountPct: 10 });
    expect(receipt.trxId).toMatch(/^LATIHAN-/);
    expect(receipt.totalRp).toBe(1260);
  }
  expect(readTrainingSales("qa").length).toBe(3);
  expect(applyTrainingSales([sample], readTrainingSales("qa"))[0].batches[0].qty).toBe(2);
  expect(sample.batches[0].qty).toBe(5);
  expect(readTrainingSales("other-tenant")).toEqual([]);
});

it("replays training requests exactly once and rejects changed baskets", async () => {
  const first = await completeTrainingSale(input);
  const repeated = await completeTrainingSale(input);
  expect(first.trxId).toBe(repeated.trxId);
  expect(readTrainingSales("qa").length).toBe(1);
  await expect(completeTrainingSale({ ...input, items: [{ productId: sample.id, qty: 2 }] })).rejects.toThrow("checkout_request_conflict");
});

it("rejects operational products, short cash, excess discount and insufficient stock", async () => {
  await expect(completeTrainingSale({ ...input, products: [{ ...sample, sampleOnly: false, active: true }] })).rejects.toThrow("training_sample_only");
  await expect(completeTrainingSale({ ...input, cashReceived: 100 })).rejects.toThrow("insufficient_cash");
  await expect(completeTrainingSale({ ...input, discountPct: 11 })).rejects.toThrow("discount_limit_exceeded");
  await expect(completeTrainingSale({ ...input, items: [{ productId: sample.id, qty: 6 }], cashReceived: 10000 })).rejects.toThrow("insufficient_stock");
  expect(readTrainingSales("qa")).toEqual([]);
});

it("serializes concurrent last-unit training checkout", async () => {
  const sale = { ...input, products: [{ ...sample, batches: [{ ...sample.batches[0], qty: 1 }] }] };
  const results = await Promise.allSettled([completeTrainingSale(sale), completeTrainingSale({ ...sale, requestId: crypto.randomUUID() })]);
  expect(results.filter((result) => result.status === "fulfilled").length).toBe(1);
  expect(readTrainingSales("qa").length).toBe(1);
});

it("resets only local training records and surfaces storage errors", async () => {
  stored.set("other-app-data", "untouched");
  await completeTrainingSale(input);
  await resetTrainingSales("qa");
  expect(readTrainingSales("qa")).toEqual([]);
  expect(stored.get("other-app-data")).toBe("untouched");
  stored.set("dfarma-training-pos-v1:qa", "broken json");
  expect(() => readTrainingSales("qa")).toThrow("rusak");
  await resetTrainingSales("qa");
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } });
  await expect(completeTrainingSale(input)).rejects.toThrow("QuotaExceededError");
});
