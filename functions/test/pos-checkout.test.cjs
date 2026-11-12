const test = require("node:test");
const assert = require("node:assert/strict");
const { allocateFefo, calculatePosTotals, jakartaDateISO, parsePosCheckoutInput } = require("../lib/pos/checkout.js");

test("checkout input accepts product quantities but ignores client pricing fields", () => {
  const input = parsePosCheckoutInput({
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    items: [{ productId: "medicine-1", qty: 2, unitPrice: 1 }],
    discountPct: 5,
    paymentMethod: "TUNAI",
    cashReceived: 5000,
    totalRp: 1,
  });
  assert.deepEqual(input.items, [{ productId: "medicine-1", qty: 2 }]);
  assert.equal(input.requestId, "123e4567-e89b-42d3-a456-426614174000");
  assert.equal(input.discountPct, 5);
  assert.equal("totalRp" in input, false);
});

test("checkout input rejects duplicate products and invalid quantities", () => {
  assert.throws(() => parsePosCheckoutInput({
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    items: [{ productId: "medicine-1", qty: 1 }, { productId: "medicine-1", qty: 1 }],
  }), /duplicate_product/);
  assert.throws(() => parsePosCheckoutInput({
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    items: [{ productId: "medicine-1", qty: 0 }],
  }), /invalid_quantity/);
});

test("FEFO skips expired stock and consumes the earliest valid expiry first", () => {
  const consumed = allocateFefo([
    { id: "later", batchNo: "B", expiryISO: "2027-01-01", qty: 5 },
    { id: "expired", batchNo: "X", expiryISO: "2026-01-01", qty: 9 },
    { id: "earlier", batchNo: "A", expiryISO: "2026-12-01", qty: 2 },
  ], 4, "2026-10-27");
  assert.deepEqual(consumed, [
    { batchId: "earlier", batchNo: "A", qty: 2 },
    { batchId: "later", batchNo: "B", qty: 2 },
  ]);
});

test("server totals apply discount to database-derived line prices", () => {
  assert.deepEqual(calculatePosTotals([
    { qty: 2, unitPrice: 12500 },
    { qty: 1, unitPrice: 5000 },
  ], 10), { subtotalRp: 30000, discountRp: 3000, totalRp: 27000 });
});

test("Jakarta business date is emitted in stable ISO format", () => {
  assert.equal(jakartaDateISO(new Date("2026-10-26T17:30:00.000Z")), "2026-10-27");
});