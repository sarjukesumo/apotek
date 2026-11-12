import { createHash } from "crypto";
import { auth, db, FieldValue } from "../firebase";

export type AppRole = "ADMIN" | "OWNER" | "STAFF";

export class AccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessError";
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function inviteId(email: string): string {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

function normalizedRole(role: unknown): AppRole | null {
  if (role === "ADMIN" || role === "OWNER" || role === "STAFF") return role;
  if (role === "APOTEKER" || role === "KASIR" || role === "INVENTORY" || role === "DOCTOR") return "STAFF";
  return null;
}

async function setUserClaims(uid: string, role: AppRole, tenantId?: string) {
  const record = await auth.getUser(uid);
  const claims = { ...(record.customClaims || {}) } as Record<string, unknown>;
  claims.role = role;
  claims.isAdmin = role === "ADMIN";
  if (tenantId) claims.tenantId = tenantId;
  else delete claims.tenantId;
  await auth.setCustomUserClaims(uid, claims);
}

export async function syncGoogleUserAccess(input: {
  uid: string;
  email?: string;
  emailVerified: boolean;
  signInProvider: string;
  isAdmin: boolean;
  tokenClaims: Record<string, unknown>;
}) {
  const { uid } = input;
  const email = normalizeEmail(input.email || "");
  const userRef = db.doc(`userAccess/${uid}`);
  const userSnap = await userRef.get();
  let userData: FirebaseFirestore.DocumentData;

  if (input.isAdmin) {
    userData = {
      uid,
      email,
      role: "ADMIN",
      active: true,
      updatedAt: FieldValue.serverTimestamp(),
      ...(userSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    };
    await userRef.set(userData, { merge: true });
  } else if (userSnap.exists) {
    userData = userSnap.data()!;
    if (userData.active !== true) throw new AccessError("account_disabled");
  } else {
    const legacyRole = normalizedRole(input.tokenClaims.role);
    const legacyTenantId = typeof input.tokenClaims.tenantId === "string"
      ? input.tokenClaims.tenantId
      : undefined;

    if (legacyRole && legacyRole !== "ADMIN" && legacyTenantId) {
      const tenant = await db.doc(`tenants/${legacyTenantId}`).get();
      if (!tenant.exists) throw new AccessError("tenant_not_found");
      userData = {
        uid,
        email,
        role: legacyRole,
        tenantId: legacyTenantId,
        active: true,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      };
      await userRef.set(userData);
    } else {
      if (input.signInProvider !== "google.com") throw new AccessError("google_sign_in_required");
      if (!email || !input.emailVerified) throw new AccessError("verified_google_email_required");
      const invitationRef = db.doc(`userInvites/${inviteId(email)}`);
      await db.runTransaction(async (transaction) => {
        const [currentUser, invitation] = await Promise.all([
          transaction.get(userRef),
          transaction.get(invitationRef),
        ]);
        if (currentUser.exists) {
          userData = currentUser.data()!;
          if (userData.active !== true) throw new AccessError("account_disabled");
          return;
        }
        if (!invitation.exists) throw new AccessError("account_not_invited");
        const invite = invitation.data()!;
        if (invite.active !== true || invite.status !== "PENDING") {
          throw new AccessError("invitation_inactive");
        }
        const tenant = await transaction.get(db.doc(`tenants/${invite.tenantId}`));
        if (!tenant.exists) throw new AccessError("tenant_not_found");
        userData = {
          uid,
          email,
          displayName: invite.displayName || "",
          role: invite.role,
          tenantId: invite.tenantId,
          active: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        transaction.set(userRef, userData);
        transaction.update(invitationRef, {
          status: "CLAIMED",
          claimedUid: uid,
          claimedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      if (!userData!) {
        const refreshed = await userRef.get();
        if (!refreshed.exists) throw new AccessError("account_not_invited");
        userData = refreshed.data()!;
      }
    }
  }

  const role = normalizedRole(userData.role);
  if (!role) throw new AccessError("invalid_account_role");
  if (role !== "ADMIN" && (typeof userData.tenantId !== "string" || !userData.tenantId)) {
    throw new AccessError("tenant_required");
  }
  await setUserClaims(uid, role, userData.tenantId);
  return {
    uid,
    email,
    displayName: userData.displayName || "",
    role,
    tenantId: userData.tenantId || null,
    isAdmin: role === "ADMIN",
  };
}

export async function validateTenantRole(role: unknown, tenantId: unknown) {
  if (role !== "OWNER" && role !== "STAFF") throw new AccessError("invalid_role");
  if (typeof tenantId !== "string" || !tenantId.trim()) throw new AccessError("tenant_required");
  const tenant = await db.doc(`tenants/${tenantId}`).get();
  if (!tenant.exists) throw new AccessError("tenant_not_found");
  return { role, tenantId } as { role: AppRole; tenantId: string };
}

export async function updateUserAccess(uid: string, input: {
  role: unknown;
  tenantId: unknown;
  active: unknown;
}) {
  const userRef = db.doc(`userAccess/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new AccessError("user_not_found");
  const current = userSnap.data()!;
  if (current.role === "ADMIN") throw new AccessError("admin_account_protected");
  const membership = await validateTenantRole(input.role, input.tenantId);
  if (typeof input.active !== "boolean") throw new AccessError("invalid_active_status");
  await userRef.update({
    ...membership,
    active: input.active,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await setUserClaims(uid, membership.role, membership.tenantId);
  if (!input.active) await auth.revokeRefreshTokens(uid);
  return { uid, ...membership, active: input.active };
}

export async function updateInvitation(invitationId: string, input: {
  role: unknown;
  tenantId: unknown;
  active: unknown;
}) {
  const invitationRef = db.doc(`userInvites/${invitationId}`);
  const invitation = await invitationRef.get();
  if (!invitation.exists) throw new AccessError("invitation_not_found");
  if (invitation.data()?.status === "CLAIMED") throw new AccessError("invitation_already_claimed");
  const membership = await validateTenantRole(input.role, input.tenantId);
  if (typeof input.active !== "boolean") throw new AccessError("invalid_active_status");
  await invitationRef.update({
    ...membership,
    active: input.active,
    status: input.active ? "PENDING" : "DISABLED",
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { id: invitationId, ...membership, active: input.active };
}