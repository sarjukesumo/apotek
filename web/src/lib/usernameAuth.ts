// Username + password login on top of Firebase Auth (email/password provider).
// Passwords are never stored in Firestore: each username maps to an internal
// synthetic email (`usernameAccounts/{username}` -> authEmail) and the password
// lives only inside Firebase Authentication (server-side hashed, rate limited).
import { FirebaseError, deleteApp, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword, inMemoryPersistence, initializeAuth,
  signInWithEmailAndPassword, signOut, updateProfile,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { auth, connectLocalAuth, db, firebaseConfig } from "./firebase";
import type { AppRole } from "./access";

export const USERNAME_EMAIL_DOMAIN = "u.batam-farma.app";

// Built-in platform admin usernames. Their auth e-mail is deterministic and the
// address is also hardcoded as an admin principal in firestore.rules.
export const ADMIN_USERNAME_EMAILS: Record<string, string> = {
  masipul: `masipul@${USERNAME_EMAIL_DOMAIN}`,
};

export function normalizeUsername(input: string) {
  return input.trim().toLowerCase();
}

export function isValidUsername(username: string) {
  return /^[a-z0-9][a-z0-9._-]{2,19}$/.test(username);
}

export function isUsernameEmail(email: string) {
  return email.toLowerCase().endsWith(`@${USERNAME_EMAIL_DOMAIN}`);
}

export function passwordPolicyError(password: string): string | null {
  if (password.length < 6) return "password_too_short";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return "password_needs_letter_digit";
  return null;
}

function randomSuffix(length = 10) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

function requireOnline() {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("offline");
}

type UsernameAccountDoc = {
  username: string;
  suffix?: string;
  authEmail: string;
  tenantId?: string;
  active: boolean;
};

export async function signInWithUsername(usernameRaw: string, password: string) {
  requireOnline();
  const username = normalizeUsername(usernameRaw);
  if (!isValidUsername(username) || !password) throw new Error("invalid_credentials");

  let authEmail = "";
  try {
    const snapshot = await getDoc(doc(db, "usernameAccounts", username));
    if (snapshot.exists()) {
      const account = snapshot.data() as UsernameAccountDoc;
      if (account.active === false) throw new Error("account_disabled");
      authEmail = account.authEmail;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "account_disabled") throw error;
    // Lookup failure (offline cache miss etc.) falls through to admin fallback.
  }
  if (!authEmail) authEmail = ADMIN_USERNAME_EMAILS[username] || "";
  if (!authEmail) throw new Error("invalid_credentials");

  try {
    await signInWithEmailAndPassword(auth, authEmail, password);
  } catch (error) {
    if (error instanceof FirebaseError) {
      if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"].includes(error.code)) {
        throw new Error("invalid_credentials");
      }
      if (error.code === "auth/too-many-requests") throw new Error("too_many_attempts");
      if (error.code === "auth/network-request-failed") throw new Error("offline");
      if (error.code === "auth/user-disabled") throw new Error("account_disabled");
    }
    throw error;
  }
}

// Creates the Firebase Auth account on a secondary app instance so the current
// admin/owner session is never replaced by the newly created user.
async function provisionAuthAccount(authEmail: string, password: string, displayName: string) {
  const secondary = initializeApp(firebaseConfig, `provision-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    const secondaryAuth = initializeAuth(secondary, { persistence: inMemoryPersistence });
    connectLocalAuth(secondaryAuth);
    const credential = await createUserWithEmailAndPassword(secondaryAuth, authEmail, password);
    if (displayName) {
      try { await updateProfile(credential.user, { displayName }); } catch { /* cosmetic only */ }
    }
    const uid = credential.user.uid;
    await signOut(secondaryAuth);
    return uid;
  } finally {
    try { await deleteApp(secondary); } catch { /* ignore */ }
  }
}

function mapProvisionError(error: unknown): Error {
  if (error instanceof FirebaseError) {
    if (error.code === "auth/email-already-in-use") return new Error("username_taken");
    if (error.code === "auth/weak-password") return new Error("password_too_short");
    if (error.code === "auth/network-request-failed") return new Error("offline");
    if (error.code === "auth/operation-not-allowed") return new Error("password_login_not_enabled");
  }
  return error instanceof Error ? error : new Error("provision_failed");
}

export async function createPasswordUser(input: {
  username: string;
  password: string;
  displayName: string;
  role: Exclude<AppRole, "ADMIN">;
  tenantId: string;
  createdBy: string;
}) {
  requireOnline();
  const username = normalizeUsername(input.username);
  if (!isValidUsername(username)) throw new Error("invalid_username");
  if (ADMIN_USERNAME_EMAILS[username]) throw new Error("username_taken");
  const policyError = passwordPolicyError(input.password);
  if (policyError) throw new Error(policyError);
  if (!input.tenantId) throw new Error("tenant_required");

  const mappingRef = doc(db, "usernameAccounts", username);
  const existing = await getDoc(mappingRef);
  if (existing.exists()) throw new Error("username_taken");

  const suffix = randomSuffix();
  const authEmail = `${username}.${suffix}@${USERNAME_EMAIL_DOMAIN}`;
  let uid: string;
  try {
    uid = await provisionAuthAccount(authEmail, input.password, input.displayName.trim());
  } catch (error) {
    throw mapProvisionError(error);
  }

  const batch = writeBatch(db);
  batch.set(mappingRef, {
    username,
    suffix,
    authEmail,
    tenantId: input.tenantId,
    active: true,
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, "userAccess", uid), {
    uid,
    email: authEmail,
    username,
    displayName: input.displayName.trim(),
    role: input.role,
    tenantId: input.tenantId,
    active: true,
    loginType: "PASSWORD",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  return { uid, username };
}

// Password reset without the Admin SDK: a fresh Auth credential is issued for
// the username (new internal e-mail + new password), the username mapping is
// repointed, and the old credential loses all access (userAccess deactivated).
export async function resetPasswordUser(input: {
  username: string;
  newPassword: string;
  displayName: string;
  role: Exclude<AppRole, "ADMIN">;
  tenantId: string;
  oldUid: string;
  updatedBy: string;
}) {
  requireOnline();
  const username = normalizeUsername(input.username);
  if (ADMIN_USERNAME_EMAILS[username]) throw new Error("admin_reset_not_allowed");
  const policyError = passwordPolicyError(input.newPassword);
  if (policyError) throw new Error(policyError);

  const mappingRef = doc(db, "usernameAccounts", username);
  const mappingSnapshot = await getDoc(mappingRef);
  if (!mappingSnapshot.exists()) throw new Error("username_not_found");

  const suffix = randomSuffix();
  const authEmail = `${username}.${suffix}@${USERNAME_EMAIL_DOMAIN}`;
  let uid: string;
  try {
    uid = await provisionAuthAccount(authEmail, input.newPassword, input.displayName.trim());
  } catch (error) {
    throw mapProvisionError(error);
  }

  const batch = writeBatch(db);
  batch.update(mappingRef, {
    suffix,
    authEmail,
    active: true,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, "userAccess", uid), {
    uid,
    email: authEmail,
    username,
    displayName: input.displayName.trim(),
    role: input.role,
    tenantId: input.tenantId,
    active: true,
    loginType: "PASSWORD",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, "userAccess", input.oldUid), {
    active: false,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  return { uid, username };
}

export const USERNAME_AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Username atau password salah.",
  invalid_username: "Username 3-20 karakter: huruf kecil, angka, titik, strip, atau garis bawah.",
  username_taken: "Username ini sudah dipakai. Pilih username lain.",
  username_not_found: "Username tidak ditemukan.",
  password_too_short: "Password minimal 6 karakter.",
  password_needs_letter_digit: "Password harus memuat huruf dan angka.",
  password_login_not_enabled: "Login password belum diaktifkan di Firebase (Authentication > Sign-in method > Email/Password).",
  too_many_attempts: "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.",
  account_disabled: "Akses akun ini sedang dinonaktifkan. Hubungi Admin.",
  admin_reset_not_allowed: "Password akun super admin hanya bisa diganti oleh pemilik akun tersebut.",
  tenant_required: "Pilih apotek terlebih dahulu.",
  offline: "Fitur ini memerlukan koneksi internet.",
  "permission-denied": "Firestore menolak penyimpanan. Pastikan sesi Anda masih memiliki akses.",
};

export function usernameAuthErrorText(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  return USERNAME_AUTH_ERROR_MESSAGES[message] || USERNAME_AUTH_ERROR_MESSAGES[code] || `${fallback} (${message || code || "unknown"})`;
}
