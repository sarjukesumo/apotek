import { User } from "firebase/auth";
import {
  collection, deleteDoc, doc, getDoc, getDocFromCache, getDocFromServer, getDocs, query, runTransaction, serverTimestamp,
  setDoc, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { ADMIN_USERNAME_EMAILS, isUsernameEmail } from "./usernameAuth";

export type AppRole = "ADMIN" | "OWNER" | "STAFF" | "CASHIER";
export type AccessProfile = {
  uid: string;
  email: string;
  displayName?: string;
  role: AppRole;
  tenantId?: string;
  active: boolean;
  username?: string;
  loginType?: "PASSWORD" | "GOOGLE";
};
export type AccessInvitation = {
  id: string;
  email: string;
  displayName?: string;
  role: "OWNER" | "STAFF" | "CASHIER";
  tenantId: string;
  active: boolean;
  status: "PENDING" | "CLAIMED" | "DISABLED";
  claimedUid?: string;
};

const ADMIN_EMAIL = "sarju.kesumo@gmail.com";
// Platform admins: the Google admin plus built-in password-admin usernames
// (synthetic e-mails, mirrored in firestore.rules isAdmin()).
const ADMIN_EMAILS = [ADMIN_EMAIL, ...Object.values(ADMIN_USERNAME_EMAILS)];

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isNetworkReadError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return (typeof navigator !== "undefined" && !navigator.onLine)
    || code === "unavailable"
    || code === "deadline-exceeded";
}

async function loadCachedAccess(ref: ReturnType<typeof doc>) {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) return await getDocFromCache(ref);
    try {
      return await getDocFromServer(ref);
    } catch (error) {
      if (!isNetworkReadError(error)) throw error;
      return await getDocFromCache(ref);
    }
  } catch (error) {
    if (isNetworkReadError(error)) throw new Error("offline_access_unavailable");
    throw error;
  }
}

export async function resolveUserAccess(user: User): Promise<AccessProfile> {
  const email = normalizeEmail(user.email || "");
  const passwordAccount = isUsernameEmail(email);
  if (!user.emailVerified && !passwordAccount) throw new Error("verified_email_required");
  if (ADMIN_EMAILS.includes(email)) {
    return { uid: user.uid, email, displayName: user.displayName || "", role: "ADMIN", active: true };
  }

  const accessRef = doc(db, "userAccess", user.uid);
  const accessSnapshot = await loadCachedAccess(accessRef);
  if (accessSnapshot.exists()) {
    const profile = accessSnapshot.data() as AccessProfile;
    if (!profile.active) throw new Error("account_disabled");
    return profile;
  }

  // Password accounts are provisioned together with their userAccess document;
  // they never claim e-mail invitations.
  if (passwordAccount) throw new Error("account_not_invited");

  const legacyClaims = await user.getIdTokenResult();
  if (typeof legacyClaims.claims.tenantId === "string" && typeof legacyClaims.claims.role === "string") {
    const role: AppRole = legacyClaims.claims.role === "OWNER"
      ? "OWNER"
      : legacyClaims.claims.role === "KASIR"
        ? "CASHIER"
        : "STAFF";
    return { uid: user.uid, email, displayName: user.displayName || "", role, tenantId: legacyClaims.claims.tenantId, active: true };
  }

  if (!email) throw new Error("verified_email_required");

  const inviteRef = doc(db, "userInvitesByEmail", email);
  let profile: AccessProfile | undefined;
  await runTransaction(db, async (transaction) => {
    const [existingAccess, invitation] = await Promise.all([
      transaction.get(accessRef),
      transaction.get(inviteRef),
    ]);
    if (existingAccess.exists()) {
      profile = existingAccess.data() as AccessProfile;
      if (!profile.active) throw new Error("account_disabled");
      return;
    }
    if (!invitation.exists()) throw new Error("account_not_invited");
    const invite = invitation.data() as AccessInvitation;
    if (!invite.active || invite.status !== "PENDING") throw new Error("invitation_inactive");
    profile = {
      uid: user.uid,
      email,
      displayName: invite.displayName || user.displayName || "",
      role: invite.role,
      tenantId: invite.tenantId,
      active: true,
    };
    transaction.set(accessRef, {
      ...profile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.update(inviteRef, {
      status: "CLAIMED",
      claimedUid: user.uid,
      claimedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  if (!profile) throw new Error("account_not_invited");
  return profile;
}

export async function loadManagedAccess() {
  const [userSnapshot, inviteSnapshot] = await Promise.all([
    getDocs(collection(db, "userAccess")),
    getDocs(collection(db, "userInvitesByEmail")),
  ]);
  return {
    users: userSnapshot.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() as AccessProfile })),
    invitations: inviteSnapshot.docs.map((snapshot) => ({ ...snapshot.data() as AccessInvitation, id: snapshot.id })),
  };
}

export async function loadTenantAccess(tenantId: string) {
  const [userSnapshot, inviteSnapshot] = await Promise.all([
    getDocs(query(collection(db, "userAccess"), where("tenantId", "==", tenantId))),
    getDocs(query(collection(db, "userInvitesByEmail"), where("tenantId", "==", tenantId))),
  ]);
  return {
    users: userSnapshot.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() as AccessProfile })),
    invitations: inviteSnapshot.docs.map((snapshot) => ({ ...snapshot.data() as AccessInvitation, id: snapshot.id })),
  };
}

export async function inviteGoogleUser(input: {
  email: string;
  displayName: string;
  role: "OWNER" | "STAFF" | "CASHIER";
  tenantId: string;
  createdBy: string;
}) {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("offline");
  const email = normalizeEmail(input.email);
  const usersQuery = ADMIN_EMAILS.includes(normalizeEmail(auth.currentUser?.email || ""))
    ? query(collection(db, "userAccess"), where("email", "==", email))
    : query(collection(db, "userAccess"), where("tenantId", "==", input.tenantId), where("email", "==", email));
  const existingUsers = await getDocs(usersQuery);
  if (!existingUsers.empty) throw new Error("user_already_exists");

  const tenantInvites = await getDocs(query(
    collection(db, "userInvitesByEmail"),
    where("tenantId", "==", input.tenantId),
  ));
  const existingInvite = tenantInvites.docs.find((snapshot) => snapshot.id === email);
  if (existingInvite?.data().status === "CLAIMED") {
    throw new Error("user_already_claimed");
  }
  const invitationRef = doc(db, "userInvitesByEmail", email);
  if (existingInvite) {
    await updateDoc(invitationRef, {
      displayName: input.displayName.trim(),
      role: input.role,
      active: true,
      status: "PENDING",
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(invitationRef, {
      email,
      displayName: input.displayName.trim(),
      role: input.role,
      tenantId: input.tenantId,
      active: true,
      status: "PENDING",
      createdBy: input.createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function updateManagedAccount(input: {
  id: string;
  kind: "user" | "invitation";
  role: "OWNER" | "STAFF" | "CASHIER";
  tenantId: string;
  active: boolean;
  displayName?: string;
}) {
  const collectionName = input.kind === "user" ? "userAccess" : "userInvitesByEmail";
  const ref = doc(db, collectionName, input.id);
  const update: Record<string, unknown> = {
    role: input.role,
    tenantId: input.tenantId,
    active: input.active,
    updatedAt: serverTimestamp(),
  };
  if (input.displayName !== undefined) update.displayName = input.displayName.trim();
  if (input.kind === "invitation") update.status = input.active ? "PENDING" : "DISABLED";
  await updateDoc(ref, update);
}

export async function removeTenantAccount(input: { id: string; kind: "user" | "invitation" }) {
  const ref = doc(db, input.kind === "user" ? "userAccess" : "userInvitesByEmail", input.id);
  if (input.kind === "invitation") {
    await deleteDoc(ref);
    return;
  }
  await updateDoc(ref, { active: false, updatedAt: serverTimestamp() });
}

// Permanently removes the access profile (and frees the username for password
// accounts). The Firebase Auth record itself cannot be deleted client-side,
// but without these documents it has no access and cannot sign in by username.
export async function deleteAccountPermanently(input: { uid: string; username?: string }) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "userAccess", input.uid));
  if (input.username) batch.delete(doc(db, "usernameAccounts", input.username));
  await batch.commit();
}

export async function createPharmacy(input: {
  name: string;
  slug: string;
  city: string;
  phone: string;
  createdBy: string;
}) {
  const slug = input.slug.trim().toLowerCase();
  const ref = doc(db, "tenants", slug);
  const publicRef = doc(db, "publicTenants", slug);
  await runTransaction(db, async (transaction) => {
    const [existing, publicProfile] = await Promise.all([
      transaction.get(ref),
      transaction.get(publicRef),
    ]);
    if (existing.exists() || publicProfile.exists()) throw new Error("tenant_slug_taken");
    const profile = { name: input.name.trim(), city: input.city.trim(), phone: input.phone.trim() };
    transaction.set(ref, {
      tenantSlug: slug,
      profile,
      marketplaceEnabled: false,
      subscription: { status: "SETUP" },
      createdBy: input.createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.set(publicRef, {
      tenantId: slug,
      tenantSlug: slug,
      name: profile.name,
      city: profile.city,
      phone: profile.phone,
      marketplaceEnabled: false,
      updatedAt: serverTimestamp(),
    });
  });
}