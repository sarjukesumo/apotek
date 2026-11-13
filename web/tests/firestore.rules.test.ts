import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from "firebase/firestore";

const projectId = "demo-apotek-security-tests";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const [host, portText] = firestoreHost.split(":");
const rules = readFileSync(fileURLToPath(new URL("../../firestore.rules", import.meta.url)), "utf8");
let environment: RulesTestEnvironment;

function signedIn(uid: string, email = `${uid}@example.test`) {
  return environment.authenticatedContext(uid, { email, email_verified: true }).firestore();
}

async function seed() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    const documents: Array<[string, Record<string, unknown>]> = [
      ["tenants/tenant-a", {
        tenantSlug: "alpha",
        profile: { name: "Apotek Alpha" },
        payout: { bank: { accountNumber: "sensitive-account" } },
      }],
      ["tenants/tenant-b", { tenantSlug: "beta", profile: { name: "Apotek Beta" } }],
      ["publicTenants/alpha", { tenantId: "tenant-a", tenantSlug: "alpha", name: "Apotek Alpha", marketplaceEnabled: true }],
      ["publicTenants/beta", { tenantId: "tenant-b", tenantSlug: "beta", name: "Apotek Beta", marketplaceEnabled: false }],
      ["userAccess/owner-a", { uid: "owner-a", email: "owner-a@example.test", tenantId: "tenant-a", role: "OWNER", active: true }],
      ["userAccess/staff-a", { uid: "staff-a", email: "staff-a@example.test", tenantId: "tenant-a", role: "STAFF", active: true }],
      ["userAccess/cashier-a", { uid: "cashier-a", email: "cashier-a@example.test", tenantId: "tenant-a", role: "CASHIER", active: true }],
      ["userAccess/owner-b", { uid: "owner-b", email: "owner-b@example.test", tenantId: "tenant-b", role: "OWNER", active: true }],
      ["tenants/tenant-a/customers/customer-a", { name: "Pasien Alpha", phone: "0800000000", active: true }],
      ["tenants/tenant-a/suppliers/supplier-a", { name: "Supplier Alpha", code: "SUP-A", active: true, returnable: true, returnMinDaysBeforeED: 30 }],
      ["tenants/tenant-a/products/product-a", { name: "Obat A", price: 2000, stock: 10, active: true, marketplaceEnabled: false }],
      ["tenants/tenant-a/inventoryBatches/batch-a", {
        productId: "product-a", supplierId: "supplier-a", sourceType: "PURCHASE", batchNo: "BATCH-A",
        qty: 10, expiryISO: "2027-12-31", expiryAt: new Date("2027-12-31T23:59:59.999Z"),
      }],
      ["tenants/tenant-a/inventoryBatches/batch-expired", {
        productId: "product-a", batchNo: "BATCH-EXPIRED", qty: 10, expiryISO: "2020-01-01",
        expiryAt: new Date("2020-01-01T16:59:59.999Z"),
      }],
      ["tenants/tenant-a/products/rx-product", { name: "Rx Medicine", price: 5000, active: true, rxRequired: true }],
      ["tenants/tenant-a/inventoryBatches/rx-batch", {
        productId: "rx-product", batchNo: "RX-BATCH", qty: 5, expiryISO: "2027-12-31",
        expiryAt: new Date("2027-12-31T16:59:59.999Z"),
      }],
      ["tenants/tenant-a/inventoryBatchCosts/batch-a", { batchId: "batch-a", costPrice: 1000 }],
      ["tenants/tenant-a/posSales/sale-a", {
        tenantId: "tenant-a", cashierUid: "cashier-a", totalRp: 2000, totalCostRp: 1000, grossProfitRp: 1000, items: [],
      }],
      ["userInvitesByEmail/new-staff@example.test", {
        email: "new-staff@example.test", tenantId: "tenant-a", role: "STAFF", active: true, status: "PENDING",
      }],
      ["usernameAccounts/kasir1", {
        username: "kasir1", suffix: "abcdef1234", authEmail: "kasir1.abcdef1234@u.batam-farma.app",
        tenantId: "tenant-a", active: true, createdBy: "owner-a",
      }],
      ["userAccess/kasir1-old-uid", {
        uid: "kasir1-old-uid", email: "kasir1.abcdef1234@u.batam-farma.app", username: "kasir1",
        tenantId: "tenant-a", role: "CASHIER", active: true, loginType: "PASSWORD",
      }],
    ];
    await Promise.all(documents.map(([path, data]) => setDoc(doc(database, path), data)));
  });
}

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host, port: Number(portText), rules },
  });
});

afterEach(async () => {
  await environment.clearFirestore();
});

afterAll(async () => {
  await environment.cleanup();
});

beforeEach(seed);

describe("Firestore tenant isolation and privacy", () => {
  it("denies public reads of private tenant data while allowing the sanitized public profile", async () => {
    const anonymous = environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonymous, "tenants/tenant-a")));
    const profile = await assertSucceeds(getDoc(doc(anonymous, "publicTenants/alpha")));
    expect(profile.data()).not.toHaveProperty("payout");
    await assertFails(getDoc(doc(anonymous, "publicTenants/beta")));
  });

  it("prevents an Owner from reading another tenant", async () => {
    const owner = signedIn("owner-a");
    await assertSucceeds(getDoc(doc(owner, "tenants/tenant-a")));
    await assertFails(getDoc(doc(owner, "tenants/tenant-b")));
    await assertFails(getDoc(doc(owner, "tenants/tenant-b/customers/customer-a")));
  });

  it("allows Staff to read and create tenant contacts but not delete them", async () => {
    const staff = signedIn("staff-a");
    await assertSucceeds(getDoc(doc(staff, "tenants/tenant-a/customers/customer-a")));
    await assertSucceeds(setDoc(doc(staff, "tenants/tenant-a/customers/customer-b"), { name: "Other", phone: "0811", active: true }));
    await assertSucceeds(setDoc(doc(staff, "tenants/tenant-a/suppliers/supplier-b"), { name: "Supplier Baru", code: "SUP-B", active: true }));
    await assertSucceeds(updateDoc(doc(staff, "tenants/tenant-a/customers/customer-a"), { phone: "0822" }));
    await assertFails(deleteDoc(doc(staff, "tenants/tenant-a/customers/customer-a")));
    await assertFails(deleteDoc(doc(staff, "tenants/tenant-a/suppliers/supplier-a")));
    await assertFails(setDoc(doc(staff, "tenants/tenant-b/customers/intruder"), { name: "Intruder" }));
  });

  it("allows Cashier to select customers for POS but not modify them or read other tenants", async () => {
    const cashier = signedIn("cashier-a");
    await assertSucceeds(getDoc(doc(cashier, "tenants/tenant-a/customers/customer-a")));
    await assertSucceeds(getDocs(collection(cashier, "tenants/tenant-a/customers")));
    await assertFails(getDocs(collection(cashier, "tenants/tenant-b/customers")));
    await assertFails(setDoc(doc(cashier, "tenants/tenant-a/customers/customer-b"), { name: "Other" }));
    await assertFails(updateDoc(doc(cashier, "tenants/tenant-a/customers/customer-a"), { phone: "081234567890" }));
  });

  it("denies patient-record collections unless a specific rule is added", async () => {
    const owner = signedIn("owner-a");
    await assertFails(getDoc(doc(owner, "tenants/tenant-a/patients/patient-a")));
    await assertFails(getDoc(doc(owner, "tenants/tenant-a/prescriptions/rx-a")));
  });
});

describe("Firestore tenant roles and paused features", () => {
  it("allows tenant stock history to be appended with a stock change and prevents edits", async () => {
    const staff = signedIn("staff-a");
    const productRef = doc(staff, "tenants/tenant-a/products/product-a");
    const batchRef = doc(staff, "tenants/tenant-a/inventoryBatches/batch-a");
    const movementRef = doc(staff, "tenants/tenant-a/inventoryMovements/movement-a");
    await assertSucceeds(runTransaction(staff, async (transaction) => {
      const [product, batch] = await Promise.all([transaction.get(productRef), transaction.get(batchRef)]);
      transaction.update(productRef, { stock: 12 });
      transaction.update(batchRef, { qty: 12 });
      transaction.set(movementRef, {
        tenantId: "tenant-a",
        productId: "product-a",
        productName: "Obat A",
        batchId: "batch-a",
        batchNo: "BATCH-A",
        movementType: "ADJUSTMENT",
        quantityDelta: 2,
        batchQtyBefore: batch.data()?.qty,
        batchQtyAfter: 12,
        productStockBefore: product.data()?.stock,
        productStockAfter: 12,
        referenceLabel: "Kelola batch",
        actorUid: "staff-a",
        actorName: "Staf A",
        createdAt: serverTimestamp(),
      });
    }));
    await assertSucceeds(getDoc(movementRef));
    await assertFails(updateDoc(movementRef, { quantityDelta: 3 }));
    await assertFails(deleteDoc(movementRef));
    await assertFails(getDoc(doc(signedIn("cashier-a"), "tenants/tenant-a/inventoryMovements/movement-a")));

    await assertFails(setDoc(doc(staff, "tenants/tenant-a/inventoryMovements/unpaired"), {
      tenantId: "tenant-a",
      productId: "product-a",
      productName: "Obat A",
      batchId: "batch-a",
      batchNo: "BATCH-A",
      movementType: "ADJUSTMENT",
      quantityDelta: 1,
      batchQtyBefore: 10,
      batchQtyAfter: 11,
      productStockBefore: 10,
      productStockAfter: 11,
      actorUid: "staff-a",
      actorName: "Staf A",
      createdAt: serverTimestamp(),
    }));
  });

  it("lets a tenant Owner query their invitations and create a new staff invite", async () => {
    const owner = signedIn("owner-a");
    await assertFails(getDoc(doc(owner, "userInvitesByEmail/new-person@example.test")));
    const inviteList = await assertSucceeds(getDocs(query(
      collection(owner, "userInvitesByEmail"),
      where("tenantId", "==", "tenant-a"),
    )));
    expect(inviteList.docs.some((invite) => invite.id === "new-person@example.test")).toBe(false);
    await assertSucceeds(setDoc(doc(owner, "userInvitesByEmail/new-person@example.test"), {
      email: "new-person@example.test",
      displayName: "Staf Baru",
      role: "STAFF",
      tenantId: "tenant-a",
      active: true,
      status: "PENDING",
      createdBy: "owner-a",
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  });

  it("lets a tenant Owner invite another Owner", async () => {
    const owner = signedIn("owner-a");
    const inviteRef = doc(owner, "userInvitesByEmail/new-owner@example.test");
    await assertSucceeds(setDoc(inviteRef, {
      email: "new-owner@example.test",
      displayName: "Owner Baru",
      role: "OWNER",
      tenantId: "tenant-a",
      active: true,
      status: "PENDING",
      createdBy: "owner-a",
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const newOwner = environment.authenticatedContext("new-owner", {
      email: "new-owner@example.test", email_verified: true,
    }).firestore();
    const newOwnerInviteRef = doc(newOwner, "userInvitesByEmail/new-owner@example.test");
    const accessRef = doc(newOwner, "userAccess/new-owner");
    await assertSucceeds(runTransaction(newOwner, async (transaction) => {
      const invite = await transaction.get(newOwnerInviteRef);
      expect(invite.data()?.role).toBe("OWNER");
      transaction.set(accessRef, {
        uid: "new-owner", email: "new-owner@example.test", tenantId: "tenant-a", role: "OWNER", active: true,
      });
      transaction.update(newOwnerInviteRef, {
        status: "CLAIMED", claimedUid: "new-owner", claimedAt: new Date(), updatedAt: new Date(),
      });
    }));
  });

  it("lets a tenant Owner update an existing invite without changing protected fields", async () => {
    const owner = signedIn("owner-a");
    const inviteRef = doc(owner, "userInvitesByEmail/new-staff@example.test");
    await assertSucceeds(updateDoc(inviteRef, {
      displayName: "Staf Diperbarui",
      role: "CASHIER",
      active: true,
      status: "PENDING",
      updatedAt: new Date(),
    }));
    expect((await assertSucceeds(getDoc(inviteRef))).data()?.displayName).toBe("Staf Diperbarui");
    await assertSucceeds(updateDoc(inviteRef, {
      displayName: "Owner Baru",
      role: "OWNER",
      active: true,
      status: "PENDING",
      updatedAt: new Date(),
    }));
    expect((await assertSucceeds(getDoc(inviteRef))).data()?.role).toBe("OWNER");
  });

  it("lets Staff lower stock but denies cost-price edits", async () => {
    const staff = signedIn("staff-a");
    await assertSucceeds(updateDoc(doc(staff, "tenants/tenant-a/inventoryBatches/batch-a"), { qty: 9 }));
    await assertFails(updateDoc(doc(staff, "tenants/tenant-a/inventoryBatches/batch-a"), { costPrice: 1 }));
    await assertSucceeds(updateDoc(doc(staff, "tenants/tenant-a/products/product-a"), { price: 1 }));
  });

  it("denies Cashier sale-price edits", async () => {
    const cashier = signedIn("cashier-a");
    await assertFails(updateDoc(doc(cashier, "tenants/tenant-a/products/product-a"), { price: 1 }));
  });

  it("denies Cashier-authored sales from asserting purchase cost or profit", async () => {
    const cashier = signedIn("cashier-a");
    await assertFails(setDoc(doc(cashier, "tenants/tenant-a/posSales/forged-cost"), {
      tenantId: "tenant-a", cashierUid: "cashier-a", totalRp: 1000, totalCostRp: 1, grossProfitRp: 999, items: [],
    }));
    await assertFails(setDoc(doc(cashier, "tenants/tenant-a/posSales/sale-without-cost"), {
      tenantId: "tenant-a", cashierUid: "cashier-a", totalRp: 1000, items: [],
    }));
    await assertFails(getDoc(doc(cashier, "tenants/tenant-a/posSales/sale-a")));
    await assertSucceeds(getDoc(doc(signedIn("owner-a"), "tenants/tenant-a/posSales/sale-a")));
  });

  it("denies Cashier direct stock decrements now that checkout is server-authoritative", async () => {
    const cashier = signedIn("cashier-a");
    await assertFails(updateDoc(doc(cashier, "tenants/tenant-a/products/product-a"), { stock: 9 }));
    await assertFails(updateDoc(doc(cashier, "tenants/tenant-a/inventoryBatches/batch-a"), { qty: 9 }));
  });

  it("allows cashier checkout only when request, priced sale line, and batch decrement are atomic", async () => {
    const cashier = signedIn("cashier-a");
    const batchRef = doc(cashier, "tenants/tenant-a/inventoryBatches/batch-a");
    const productRef = doc(cashier, "tenants/tenant-a/products/product-a");
    const requestId = "123e4567-e89b-42d3-a456-426614174000";
    const saleId = `${requestId}_product-a`;
    const saleRef = doc(cashier, `tenants/tenant-a/posSales/${saleId}`);
    await assertSucceeds(runTransaction(cashier, async (transaction) => {
      const batch = await transaction.get(batchRef);
      const product = await transaction.get(productRef);
      expect(batch.exists() && product.exists()).toBe(true);
      transaction.update(batchRef, { qty: 8, lastSaleId: saleId, updatedAt: serverTimestamp() });
      transaction.update(productRef, { stock: 8, lastSaleId: saleId, updatedAt: serverTimestamp() });
      transaction.set(doc(cashier, `tenants/tenant-a/posRequests/${requestId}`), {
        requestId, cashierUid: "cashier-a", requestFingerprint: "test-checkout",
        productIds: ["product-a"], createdAt: serverTimestamp(),
      });
      transaction.set(saleRef, {
        requestFingerprint: "test-checkout",
        tenantId: "tenant-a", requestId, trxId: `TRX-${requestId.toUpperCase()}`, cashierUid: "cashier-a",
        cashier: "Kasir", dateISO: "2026-10-27", createdAt: serverTimestamp(),
        productId: "product-a", batchId: "batch-a", batchNo: "BATCH-A", qty: 2,
        unitPrice: 2000, subtotalRp: 4000, discountPct: 0, discountRp: 0, totalRp: 4000,
        paymentMethod: "TUNAI", cashReceived: 4000, totalCostStatus: "UNKNOWN",
        items: [{ productId: "product-a", productName: "Obat A", qty: 2, subtotalRp: 4000 }],
      });
    }));
    await assertFails(setDoc(saleRef, { totalRp: 1 }));
    await assertFails(runTransaction(cashier, async (transaction) => {
      const batch = await transaction.get(batchRef);
      const product = await transaction.get(productRef);
      expect(batch.exists() && product.exists()).toBe(true);
      transaction.update(batchRef, { qty: 6, lastSaleId: saleId, updatedAt: serverTimestamp() });
      transaction.update(productRef, { stock: 6, lastSaleId: saleId, updatedAt: serverTimestamp() });
      transaction.set(saleRef, {
        tenantId: "tenant-a", requestId, trxId: `TRX-${requestId.toUpperCase()}`, cashierUid: "cashier-a",
        cashier: "Kasir", dateISO: "2026-10-27", createdAt: serverTimestamp(),
        productId: "product-a", batchId: "batch-a", batchNo: "BATCH-A", qty: 2,
        unitPrice: 2000, subtotalRp: 4000, discountPct: 0, discountRp: 0, totalRp: 4000,
        paymentMethod: "TUNAI", cashReceived: 4000, totalCostStatus: "UNKNOWN",
        items: [{ productId: "product-a", productName: "Obat A", qty: 2, subtotalRp: 4000 }],
      });
    }));
    const savedBatch = await assertSucceeds(getDoc(batchRef));
    expect(savedBatch.data()?.qty).toBe(8);
    expect((await assertSucceeds(getDoc(productRef))).data()?.stock).toBe(8);

    const underpaidRequestId = "123e4567-e89b-42d3-a456-426614174002";
    const underpaidSaleId = `${underpaidRequestId}_product-a`;
    await assertFails(runTransaction(cashier, async (transaction) => {
      const batch = await transaction.get(batchRef);
      const product = await transaction.get(productRef);
      expect(batch.exists() && product.exists()).toBe(true);
      transaction.update(batchRef, { qty: 7, lastSaleId: underpaidSaleId, updatedAt: serverTimestamp() });
      transaction.update(productRef, { stock: 7, lastSaleId: underpaidSaleId, updatedAt: serverTimestamp() });
      transaction.set(doc(cashier, `tenants/tenant-a/posSales/${underpaidSaleId}`), {
        tenantId: "tenant-a", requestId: underpaidRequestId, trxId: `TRX-${underpaidRequestId.toUpperCase()}`,
        cashierUid: "cashier-a", cashier: "Kasir", dateISO: "2026-10-27", createdAt: serverTimestamp(),
        productId: "product-a", batchId: "batch-a", batchNo: "BATCH-A", qty: 1,
        unitPrice: 2000, subtotalRp: 2000, discountPct: 0, discountRp: 0, totalRp: 2000,
        paymentMethod: "TUNAI", cashReceived: 1999, totalCostStatus: "UNKNOWN",
        items: [{ productId: "product-a", productName: "Obat A", qty: 1, subtotalRp: 2000 }],
      });
    }));
    expect((await assertSucceeds(getDoc(batchRef))).data()?.qty).toBe(8);
  });

  it("rejects sale rows that do not use the current product price", async () => {
    const cashier = signedIn("cashier-a");
    const batchRef = doc(cashier, "tenants/tenant-a/inventoryBatches/batch-a");
    const requestId = "123e4567-e89b-42d3-a456-426614174001";
    const saleId = `${requestId}_product-a`;
    await assertFails(runTransaction(cashier, async (transaction) => {
      await transaction.get(batchRef);
      transaction.update(batchRef, { qty: 9, lastSaleId: saleId, updatedAt: serverTimestamp() });
      transaction.set(doc(cashier, `tenants/tenant-a/posSales/${saleId}`), {
        tenantId: "tenant-a", requestId, trxId: `TRX-${requestId.toUpperCase()}`, cashierUid: "cashier-a",
        cashier: "Kasir", dateISO: "2026-10-27", createdAt: serverTimestamp(),
        productId: "product-a", batchId: "batch-a", batchNo: "BATCH-A", qty: 1,
        unitPrice: 1, subtotalRp: 1, discountPct: 0, discountRp: 0, totalRp: 1,
        paymentMethod: "TUNAI", totalCostStatus: "UNKNOWN",
        items: [{ productId: "product-a", productName: "Obat A", qty: 1, subtotalRp: 1 }],
      });
    }));
  });

  it("rejects expired stock and prescription-required products in client checkout", async () => {
    const cashier = signedIn("cashier-a");
    const cases = [
      { productId: "product-a", batchId: "batch-expired", qty: 1, unitPrice: 2000, saleId: "expired-sale" },
      { productId: "rx-product", batchId: "rx-batch", qty: 1, unitPrice: 5000, saleId: "rx-sale" },
    ];
    for (const [index, item] of cases.entries()) {
      await assertFails(runTransaction(cashier, async (transaction) => {
        const batchRef = doc(cashier, `tenants/tenant-a/inventoryBatches/${item.batchId}`);
        const batch = await transaction.get(batchRef);
        expect(batch.exists()).toBe(true);
        const requestId = `123e4567-e89b-42d3-a456-42661417400${index}`;
        const saleId = `${requestId}_${item.productId}`;
        transaction.update(batchRef, { qty: Number(batch.data()?.qty) - 1, lastSaleId: saleId, updatedAt: serverTimestamp() });
        transaction.set(doc(cashier, `tenants/tenant-a/posSales/${saleId}`), {
          tenantId: "tenant-a", requestId,
          trxId: `TRX-${index}`, cashierUid: "cashier-a", cashier: "Kasir", dateISO: "2026-10-27",
          createdAt: serverTimestamp(), productId: item.productId, batchId: item.batchId, batchNo: item.saleId,
          qty: 1, unitPrice: item.unitPrice, subtotalRp: item.unitPrice, discountPct: 0, discountRp: 0,
          totalRp: item.unitPrice, paymentMethod: "TUNAI", cashReceived: item.unitPrice, totalCostStatus: "UNKNOWN",
          items: [{ productId: item.productId, productName: "Obat", qty: 1, subtotalRp: item.unitPrice }],
        });
      }));
    }
  });

  it("keeps batch purchase costs readable and writable only by the Owner", async () => {
    const owner = signedIn("owner-a");
    const staff = signedIn("staff-a");
    const cashier = signedIn("cashier-a");
    const costPath = "tenants/tenant-a/inventoryBatchCosts/batch-a";
    await assertSucceeds(getDoc(doc(owner, costPath)));
    await assertFails(getDoc(doc(staff, costPath)));
    await assertFails(getDoc(doc(cashier, costPath)));
    await assertFails(setDoc(doc(cashier, "tenants/tenant-a/inventoryBatchCosts/fake"), { costPrice: 1 }));
  });

  it("denies direct online order and doctor booking writes while those features are paused", async () => {
    const customer = environment.authenticatedContext("customer-a", {
      email: "customer-a@example.test", email_verified: true, role: "CUSTOMER",
    }).firestore();
    await assertFails(setDoc(doc(customer, "tenants/tenant-a/marketplaceOrders/fake"), {
      customer: { uid: "customer-a" }, status: "PAID", amounts: { total: 1 }, items: [],
    }));
    await assertFails(setDoc(doc(customer, "tenants/tenant-a/doctorBookings/fake"), { customer: { uid: "customer-a" }, status: "BOOKED" }));
    await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), "tenants/tenant-a/doctors/doctor-a")));
  });

  it("only lets a verified matching invited email claim a tenant membership", async () => {
    const newStaff = environment.authenticatedContext("new-staff", {
      email: "new-staff@example.test", email_verified: true, firebase: { sign_in_provider: "password" },
    }).firestore();
    const accessRef = doc(newStaff, "userAccess/new-staff");
    const inviteRef = doc(newStaff, "userInvitesByEmail/new-staff@example.test");
    await assertSucceeds(runTransaction(newStaff, async (transaction) => {
      const invite = await transaction.get(inviteRef);
      expect(invite.exists()).toBe(true);
      transaction.set(accessRef, {
        uid: "new-staff", email: "new-staff@example.test", tenantId: "tenant-a", role: "STAFF", active: true,
      });
      transaction.update(inviteRef, { status: "CLAIMED", claimedUid: "new-staff", claimedAt: new Date(), updatedAt: new Date() });
    }));

    const stranger = environment.authenticatedContext("stranger", {
      email: "stranger@example.test", email_verified: true,
    }).firestore();
    await assertFails(setDoc(doc(stranger, "userAccess/stranger"), {
      uid: "stranger", email: "stranger@example.test", tenantId: "tenant-a", role: "OWNER", active: true,
    }));
  });

  it("accepts a supplier return only when the transaction reduces the linked batch and product stock", async () => {
    const owner = signedIn("owner-a");
    const batchRef = doc(owner, "tenants/tenant-a/inventoryBatches/batch-a");
    const productRef = doc(owner, "tenants/tenant-a/products/product-a");
    const returnRef = doc(owner, "tenants/tenant-a/supplierReturns/return-a");
    await assertSucceeds(runTransaction(owner, async (transaction) => {
      const [batch, product, supplier] = await Promise.all([
        transaction.get(batchRef),
        transaction.get(productRef),
        transaction.get(doc(owner, "tenants/tenant-a/suppliers/supplier-a")),
      ]);
      expect(batch.exists() && product.exists() && supplier.exists()).toBe(true);
      transaction.update(batchRef, { qty: 8 });
      transaction.update(productRef, { stock: 8 });
      transaction.set(returnRef, {
        tenantId: "tenant-a", createdBy: "owner-a", status: "SENT", qty: 2,
        supplierId: "supplier-a", batchId: "batch-a", productId: "product-a",
      });
    }));
  });

  it("rejects a return record that does not atomically decrement its batch", async () => {
    const owner = signedIn("owner-a");
    await assertFails(setDoc(doc(owner, "tenants/tenant-a/supplierReturns/forged"), {
      tenantId: "tenant-a", createdBy: "owner-a", status: "SENT", qty: 2,
      supplierId: "supplier-a", batchId: "batch-a", productId: "product-a",
    }));
  });

});

describe("Username/password account provisioning", () => {
  const passwordAdmin = () => environment.authenticatedContext("masipul-uid", {
    email: "masipul@u.batam-farma.app", email_verified: false, firebase: { sign_in_provider: "password" },
  }).firestore();

  it("lets anyone get a username mapping but never list the collection", async () => {
    const anonymous = environment.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anonymous, "usernameAccounts/kasir1")));
    await assertFails(getDocs(collection(anonymous, "usernameAccounts")));
    await assertFails(setDoc(doc(anonymous, "usernameAccounts/intruder"), {
      username: "intruder", suffix: "aaaaaa1111", authEmail: "intruder.aaaaaa1111@u.batam-farma.app",
      tenantId: "tenant-a", active: true, createdBy: "nobody",
    }));
  });

  it("lets an Owner provision a staff or Owner password account for their own tenant in one batch", async () => {
    const owner = signedIn("owner-a");
    const batch = writeBatch(owner);
    batch.set(doc(owner, "usernameAccounts/staf2"), {
      username: "staf2", suffix: "zzzz999999", authEmail: "staf2.zzzz999999@u.batam-farma.app",
      tenantId: "tenant-a", active: true, createdBy: "owner-a",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    batch.set(doc(owner, "userAccess/staf2-uid"), {
      uid: "staf2-uid", email: "staf2.zzzz999999@u.batam-farma.app", username: "staf2",
      displayName: "Staf Dua", role: "STAFF", tenantId: "tenant-a", active: true, loginType: "PASSWORD",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    batch.set(doc(owner, "usernameAccounts/owner2"), {
      username: "owner2", suffix: "aaaa999999", authEmail: "owner2.aaaa999999@u.batam-farma.app",
      tenantId: "tenant-a", active: true, createdBy: "owner-a",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    batch.set(doc(owner, "userAccess/owner2-uid"), {
      uid: "owner2-uid", email: "owner2.aaaa999999@u.batam-farma.app", username: "owner2",
      displayName: "Owner Dua", role: "OWNER", tenantId: "tenant-a", active: true, loginType: "PASSWORD",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
  });

  it("denies an Owner provisioning password accounts for another tenant", async () => {
    const owner = signedIn("owner-a");
    const crossTenant = writeBatch(owner);
    crossTenant.set(doc(owner, "usernameAccounts/mole"), {
      username: "mole", suffix: "bbbb222222", authEmail: "mole.bbbb222222@u.batam-farma.app",
      tenantId: "tenant-b", active: true, createdBy: "owner-a",
    });
    await assertFails(crossTenant.commit());

    // The access doc must point at the mapping written in the same batch.
    await assertFails(setDoc(doc(owner, "userAccess/forged-uid"), {
      uid: "forged-uid", email: "ghost.dddd444444@u.batam-farma.app", username: "ghost",
      role: "STAFF", tenantId: "tenant-a", active: true,
    }));
  });

  it("lets an Owner reset a password by repointing the mapping and swapping access docs", async () => {
    const owner = signedIn("owner-a");
    const batch = writeBatch(owner);
    batch.update(doc(owner, "usernameAccounts/kasir1"), {
      suffix: "ffff666666", authEmail: "kasir1.ffff666666@u.batam-farma.app",
      active: true, updatedAt: serverTimestamp(),
    });
    batch.set(doc(owner, "userAccess/kasir1-new-uid"), {
      uid: "kasir1-new-uid", email: "kasir1.ffff666666@u.batam-farma.app", username: "kasir1",
      displayName: "", role: "CASHIER", tenantId: "tenant-a", active: true, loginType: "PASSWORD",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    batch.update(doc(owner, "userAccess/kasir1-old-uid"), { active: false, updatedAt: serverTimestamp() });
    await assertSucceeds(batch.commit());

    // Mapping may never move to another tenant or arbitrary e-mail.
    await assertFails(updateDoc(doc(owner, "usernameAccounts/kasir1"), { tenantId: "tenant-b" }));
    await assertFails(updateDoc(doc(owner, "usernameAccounts/kasir1"), {
      suffix: "gggg777777", authEmail: "someone-else@gmail.com",
    }));
  });

  it("denies another tenant Owner from touching the mapping", async () => {
    const ownerB = signedIn("owner-b");
    await assertFails(updateDoc(doc(ownerB, "usernameAccounts/kasir1"), {
      suffix: "hhhh888888", authEmail: "kasir1.hhhh888888@u.batam-farma.app",
    }));
  });

  it("lets an Owner permanently delete a staff account and its username mapping, but not other owners or tenants", async () => {
    const owner = signedIn("owner-a");
    const batch = writeBatch(owner);
    batch.delete(doc(owner, "userAccess/kasir1-old-uid"));
    batch.delete(doc(owner, "usernameAccounts/kasir1"));
    await assertSucceeds(batch.commit());

    // Owner-role access docs and foreign tenants stay protected.
    await assertFails(deleteDoc(doc(owner, "userAccess/owner-a")));
    await assertFails(deleteDoc(doc(owner, "userAccess/owner-b")));
    const ownerB = signedIn("owner-b");
    await assertFails(deleteDoc(doc(ownerB, "userAccess/staff-a")));
  });

  it("treats the built-in password super admin as a platform admin", async () => {
    const admin = passwordAdmin();
    await assertSucceeds(getDocs(collection(admin, "userAccess")));
    const batch = writeBatch(admin);
    batch.set(doc(admin, "usernameAccounts/owner2"), {
      username: "owner2", suffix: "iiii999999", authEmail: "owner2.iiii999999@u.batam-farma.app",
      tenantId: "tenant-b", active: true, createdBy: "masipul-uid",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    batch.set(doc(admin, "userAccess/owner2-uid"), {
      uid: "owner2-uid", email: "owner2.iiii999999@u.batam-farma.app", username: "owner2",
      displayName: "Owner Dua", role: "OWNER", tenantId: "tenant-b", active: true, loginType: "PASSWORD",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
  });

  it("does not grant admin to an unverified copycat of the Google admin e-mail", async () => {
    const copycat = environment.authenticatedContext("copycat", {
      email: "sarju.kesumo@gmail.com", email_verified: false, firebase: { sign_in_provider: "password" },
    }).firestore();
    await assertFails(getDocs(collection(copycat, "userAccess")));
  });

});
