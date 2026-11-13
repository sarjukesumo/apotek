import { beforeEach, afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  initializeApp: vi.fn(() => ({})),
  getAuth: vi.fn(() => ({ name: "primary" })),
  connectAuthEmulator: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  connectStorageEmulator: vi.fn(),
}));

vi.mock("firebase/app", () => ({ initializeApp: mocks.initializeApp }));
vi.mock("firebase/auth", () => ({
  getAuth: mocks.getAuth,
  connectAuthEmulator: mocks.connectAuthEmulator,
  GoogleAuthProvider: class { setCustomParameters() {} },
}));
vi.mock("firebase/firestore", () => ({
  initializeFirestore: vi.fn(() => ({ name: "firestore" })),
  getFirestore: vi.fn(),
  persistentLocalCache: vi.fn(),
  persistentMultipleTabManager: vi.fn(),
  connectFirestoreEmulator: mocks.connectFirestoreEmulator,
}));
vi.mock("firebase/storage", () => ({
  getStorage: vi.fn(() => ({ name: "storage" })),
  connectStorageEmulator: mocks.connectStorageEmulator,
}));
vi.mock("firebase/analytics", () => ({
  getAnalytics: vi.fn(),
  isSupported: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("VITE_FIREBASE_EMULATORS", "false");
  vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "production-test");
});
afterEach(() => vi.unstubAllEnvs());

it("keeps normal builds and secondary accounts off the emulators", async () => {
  const { auth, connectLocalAuth } = await import("../src/lib/firebase");
  connectLocalAuth(auth);
  expect(mocks.connectAuthEmulator).not.toHaveBeenCalled();
  expect(mocks.connectFirestoreEmulator).not.toHaveBeenCalled();
  expect(mocks.connectStorageEmulator).not.toHaveBeenCalled();
});

it("routes demo builds and secondary provisioning to the selected local emulators", async () => {
  vi.stubEnv("VITE_FIREBASE_EMULATORS", "true");
  vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "demo-local-test");
  vi.stubEnv("VITE_FIREBASE_AUTH_EMULATOR_PORT", "19099");
  vi.stubEnv("VITE_FIRESTORE_EMULATOR_PORT", "18080");
  vi.stubEnv("VITE_FIREBASE_STORAGE_EMULATOR_PORT", "19199");
  const { auth, db, storage, connectLocalAuth } = await import("../src/lib/firebase");
  expect(mocks.connectAuthEmulator).toHaveBeenCalledWith(auth, "http://127.0.0.1:19099", { disableWarnings: true });
  expect(mocks.connectFirestoreEmulator).toHaveBeenCalledWith(db, "127.0.0.1", 18080);
  expect(mocks.connectStorageEmulator).toHaveBeenCalledWith(storage, "127.0.0.1", 19199);
  mocks.connectAuthEmulator.mockClear();
  connectLocalAuth(auth);
  expect(mocks.connectAuthEmulator).toHaveBeenCalledOnce();
});

it("rejects emulator mode for a non-demo project before initializing Firebase", async () => {
  vi.stubEnv("VITE_FIREBASE_EMULATORS", "true");
  await expect(import("../src/lib/firebase")).rejects.toThrow("isolated demo- project ID");
  expect(mocks.initializeApp).not.toHaveBeenCalled();
});
