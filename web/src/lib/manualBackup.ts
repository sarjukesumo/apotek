import {
  Bytes, DocumentReference, GeoPoint, Timestamp, collection, doc, documentId,
  getDocFromServer, getDocsFromServer, limit, orderBy, query, startAfter, where,
  type DocumentData, type QueryConstraint, type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

export function encodeBackupValue(value: unknown): unknown {
  if (value instanceof Timestamp) return { type: "timestamp", seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (value instanceof GeoPoint) return { type: "geopoint", latitude: value.latitude, longitude: value.longitude };
  if (value instanceof Bytes) return { type: "bytes", base64: value.toBase64() };
  if (value instanceof DocumentReference) return { type: "reference", path: value.path };
  if (Array.isArray(value)) return value.map(encodeBackupValue);
  if (value !== null && typeof value === "object") {
    return { type: "map", fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encodeBackupValue(entry)])) };
  }
  if (typeof value === "number" && !Number.isFinite(value)) return { type: "number", value: String(value) };
  return value;
}

export function decodeBackupValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(decodeBackupValue);
  const entry = value as Record<string, unknown>;
  if (entry.type === "timestamp" && Number.isInteger(entry.seconds) && Number.isInteger(entry.nanoseconds)) {
    return new Timestamp(entry.seconds as number, entry.nanoseconds as number);
  }
  if (entry.type === "geopoint" && typeof entry.latitude === "number" && typeof entry.longitude === "number") {
    return new GeoPoint(entry.latitude, entry.longitude);
  }
  if (entry.type === "bytes" && typeof entry.base64 === "string") return Bytes.fromBase64String(entry.base64);
  if (entry.type === "reference" && typeof entry.path === "string") return doc(db, entry.path);
  if (entry.type === "number") {
    if (entry.value === "NaN") return NaN;
    if (entry.value === "Infinity") return Infinity;
    if (entry.value === "-Infinity") return -Infinity;
  }
  if (entry.type === "map" && entry.fields && typeof entry.fields === "object" && !Array.isArray(entry.fields)) {
    return Object.fromEntries(Object.entries(entry.fields).map(([key, field]) => [key, decodeBackupValue(field)]));
  }
  throw new Error("Format nilai backup tidak valid.");
}

export async function downloadManualBackup(tenantId: string) {
  if (!navigator.onLine) throw new Error("Backup memerlukan koneksi internet.");
  const tenant = await getDocFromServer(doc(db, "tenants", tenantId));
  if (!tenant.exists()) throw new Error("Data apotek tidak ditemukan.");
  const records: Array<{ path: string; data: unknown }> = [
    { path: tenant.ref.path, data: encodeBackupValue(tenant.data()) },
  ];
  const collections = [
    "products", "inventoryBatches", "inventoryBatchCosts", "suppliers", "customers",
    "posSales", "posRequests", "supplierReturns", "devices", "privateSettings", "marketplaceOrders",
    "payouts", "doctorSchedules", "doctors", "doctorBookings",
  ];
  async function readCollection(path: string, filters: QueryConstraint[] = []) {
    let cursor: QueryDocumentSnapshot<DocumentData> | undefined;
    while (true) {
      const snapshot = await getDocsFromServer(query(
        collection(db, path), ...filters, orderBy(documentId()), limit(250),
        ...(cursor ? [startAfter(cursor)] : []),
      ));
      snapshot.docs.forEach((entry) => records.push({ path: entry.ref.path, data: encodeBackupValue(entry.data()) }));
      if (snapshot.size < 250) break;
      cursor = snapshot.docs[snapshot.docs.length - 1];
    }
  }
  for (const name of collections) await readCollection(`tenants/${tenantId}/${name}`);
  await readCollection("userAccess", [where("tenantId", "==", tenantId)]);
  await readCollection("userInvitesByEmail", [where("tenantId", "==", tenantId)]);
  const json = JSON.stringify({
    format: "dfarma-manual-backup", version: 1, tenantId, exportedAt: new Date().toISOString(),
    scope: collections, records,
    exclusions: ["Firebase Auth accounts/tokens", "browser offline queues", "Storage files", "publicTenants", "systemConfig"],
    consistency: "Sequential server reads; pause all writes during export. Not a point-in-time database snapshot.",
  }, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `dfarma-backup-${tenantId}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return records.length;
}
