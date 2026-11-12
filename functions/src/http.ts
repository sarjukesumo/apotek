// Express HTTP API mounted at /api.
import express from "express";
import { logger } from "firebase-functions";
import { OAuth2Client } from "google-auth-library";
import { authMiddleware, requireAdmin, requireAuth, requireTenant, AuthedRequest } from "./auth/middleware";
import { createSnapToken } from "./midtrans/snap";
import { midtransWebhookHandler } from "./midtrans/webhook";
import { verifyQR } from "./qr/sign";
import { db, FieldValue, auth } from "./firebase";
import { handleTask } from "./util/taskHandlers";
import { invalidateConfigCache, loadSystemConfig } from "./config";
import { cancelBooking, createBooking, getAvailableSlots } from "./doctor/schedule";
import { aiAsk } from "./ai/assistant";
import {
  AccessError,
  inviteId,
  normalizeEmail,
  syncGoogleUserAccess,
  updateInvitation,
  updateUserAccess,
  validateTenantRole,
} from "./auth/access";

export const app = express();
const taskOidcClient = new OAuth2Client();
const taskServiceAccount = process.env.TASKS_SA_EMAIL || "";
const taskAudience = process.env.TASKS_OIDC_AUDIENCE || process.env.TASK_BASE_URL || "";

// Capture raw body for webhook signature/dedupe.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
    limit: "1mb",
  })
);

app.use(authMiddleware);

app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// --- Google login membership sync ---
app.post("/api/auth/session", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const result = await syncGoogleUserAccess({
      uid: req.user!.uid,
      email: req.user!.email,
      emailVerified: req.user!.emailVerified,
      signInProvider: req.user!.signInProvider,
      isAdmin: req.user!.isAdmin,
      tokenClaims: req.user as unknown as Record<string, unknown>,
    });
    return res.json(result);
  } catch (error) {
    const status = error instanceof AccessError ? 403 : 500;
    return res.status(status).json({ error: error instanceof Error ? error.message : "session_sync_failed" });
  }
});

// --- Admin: Google user invitations and access ---
app.get("/api/admin/users", requireAuth, requireAdmin, async (_req, res) => {
  const [users, invitations] = await Promise.all([
    db.collection("userAccess").get(),
    db.collection("userInvites").get(),
  ]);
  return res.json({
    users: users.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    invitations: invitations.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  });
});

app.post("/api/admin/tenants", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const name = String(req.body?.name || "").trim();
  const slug = String(req.body?.slug || "").trim().toLowerCase();
  const city = String(req.body?.city || "").trim();
  const phone = String(req.body?.phone || "").trim();
  const reservedSlugs = new Set(["www", "app", "admin", "api", "auth", "demo", "login", "signup", "store", "marketplace"]);
  if (name.length < 3 || !/^[a-z][a-z0-9-]{1,28}[a-z0-9]$/.test(slug) || reservedSlugs.has(slug)) {
    return res.status(400).json({ error: "invalid_tenant_details" });
  }
  const existing = await db.collection("tenants").where("tenantSlug", "==", slug).limit(1).get();
  if (!existing.empty) return res.status(409).json({ error: "tenant_slug_taken" });
  const tenantRef = db.collection("tenants").doc(slug);
  try {
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(tenantRef);
      if (current.exists) throw new Error("tenant_slug_taken");
      transaction.create(tenantRef, {
        tenantSlug: slug,
        profile: { name, city, phone },
        marketplaceEnabled: false,
        subscription: { status: "SETUP" },
        createdBy: req.user!.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "tenant_slug_taken") {
      return res.status(409).json({ error: error.message });
    }
    throw error;
  }
  return res.status(201).json({ id: tenantRef.id, name, slug, city, status: "SETUP" });
});

app.post("/api/admin/users", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const email = normalizeEmail(String(req.body?.email || ""));
    const displayName = String(req.body?.displayName || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "invalid_email" });
    }
    const { role, tenantId } = await validateTenantRole(req.body?.role, req.body?.tenantId);
    const id = inviteId(email);
    const inviteRef = db.doc(`userInvites/${id}`);
    const existingInvite = await inviteRef.get();
    if (existingInvite.exists && existingInvite.data()?.status === "CLAIMED") {
      return res.status(409).json({ error: "user_already_claimed" });
    }
    const existingUsers = await db.collection("userAccess").where("email", "==", email).limit(1).get();
    if (!existingUsers.empty) return res.status(409).json({ error: "user_already_exists" });
    await inviteRef.set({
      email,
      displayName,
      ...{ role, tenantId },
      active: true,
      status: "PENDING",
      createdBy: req.user!.uid,
      createdAt: existingInvite.exists ? existingInvite.data()?.createdAt : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return res.status(201).json({ id, email, displayName, role, tenantId, active: true, status: "PENDING" });
  } catch (error) {
    const status = error instanceof AccessError ? 400 : 500;
    return res.status(status).json({ error: error instanceof Error ? error.message : "invite_create_failed" });
  }
});

app.patch("/api/admin/users/:uid", requireAuth, requireAdmin, async (req, res) => {
  try {
    return res.json(await updateUserAccess(req.params.uid, req.body || {}));
  } catch (error) {
    const status = error instanceof AccessError ? 400 : 500;
    return res.status(status).json({ error: error instanceof Error ? error.message : "user_update_failed" });
  }
});

app.patch("/api/admin/invitations/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    return res.json(await updateInvitation(req.params.id, req.body || {}));
  } catch (error) {
    const status = error instanceof AccessError ? 400 : 500;
    return res.status(status).json({ error: error instanceof Error ? error.message : "invitation_update_failed" });
  }
});

// --- Midtrans ---
app.post("/api/midtrans/webhook", (req, res) => midtransWebhookHandler(req, res));

app.post("/api/midtrans/snap-token", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const config = await loadSystemConfig();
    if (config.featureFlags?.paymentsEnabled !== true) {
      return res.status(503).json({ error: "Online payments are temporarily unavailable." });
    }
    const { type, tenantId, orderId, plan } = req.body || {};
    if (!type || !tenantId) return res.status(400).json({ error: "missing fields" });
    if (type !== "SUBSCRIPTION" && type !== "MARKETPLACE") {
      return res.status(400).json({ error: "invalid_payment_type" });
    }
    if (type === "SUBSCRIPTION") {
      if (!req.user!.isAdmin && (req.user!.tenantId !== tenantId || req.user!.role !== "OWNER")) {
        return res.status(403).json({ error: "forbidden_subscription_payment" });
      }
      if (!["BASIC", "PRO", "YEARLY"].includes(plan)) {
        return res.status(400).json({ error: "invalid_subscription_plan" });
      }
    }
    const result = await createSnapToken({
      type, tenantId, orderId, plan,
      customer: {
        uid: req.user!.uid,
        name: (req.user!.email || "Customer").split("@")[0],
        email: req.user!.email || "noemail@example.com",
      },
    });
    return res.json(result);
  } catch (e: any) {
    logger.error("snap-token error", e);
    return res.status(500).json({ error: e.message });
  }
});

// --- QR ---
app.post("/api/qr/verify", requireAuth, requireTenant("OWNER", "STAFF", "CASHIER"), async (req: AuthedRequest, res) => {
  try {
    const config = await loadSystemConfig();
    if (config.featureFlags?.qrPickupEnabled !== true) {
      return res.status(503).json({ error: "QR pickup is temporarily unavailable." });
    }
    const { signedToken } = req.body || {};
    if (!signedToken) return res.status(400).json({ error: "missing token" });
    const payload = await verifyQR(signedToken);
    if (payload.tenantId !== req.user!.tenantId) {
      return res.status(403).json({ valid: false, error: "tenant_mismatch" });
    }
    const oSnap = await db.doc(`tenants/${payload.tenantId}/marketplaceOrders/${payload.orderId}`).get();
    if (!oSnap.exists) return res.status(404).json({ valid: false, error: "order_not_found" });
    const o = oSnap.data() as any;
    return res.json({
      valid: true,
      orderSummary: {
        orderId: oSnap.id,
        orderNo: o.orderNo,
        status: o.status,
        total: o.amounts?.total,
        items: o.items,
        customer: o.customer?.name,
      },
      canComplete: ["PAID", "PREPARING", "READY_FOR_PICKUP"].includes(o.status),
    });
  } catch (e: any) {
    return res.status(400).json({ valid: false, error: e.message });
  }
});

// --- Orders ---
app.post("/api/orders/complete", requireAuth, requireTenant("OWNER", "STAFF", "CASHIER"), async (req: AuthedRequest, res) => {
  const { orderId } = req.body || {};
  if (!orderId) return res.status(400).json({ error: "missing orderId" });
  const oRef = db.doc(`tenants/${req.user!.tenantId}/marketplaceOrders/${orderId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(oRef);
    if (!snap.exists) throw new Error("order_not_found");
    const o = snap.data() as any;
    if (o.status === "COMPLETED") return;
    if (!["PAID", "PREPARING", "READY_FOR_PICKUP"].includes(o.status)) {
      throw new Error(`invalid_status_${o.status}`);
    }
    tx.update(oRef, { status: "COMPLETED", completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  return res.json({ ok: true });
});

// --- Admin: config update ---
app.post("/api/admin/config", requireAuth, requireAdmin, async (req, res) => {
  await db.doc("systemConfig/global").set(req.body || {}, { merge: true });
  invalidateConfigCache();
  return res.json({ ok: true });
});

// --- Admin: bootstrap claims (set tenant + role for a user) ---
app.post("/api/admin/claims", requireAuth, requireAdmin, async (req, res) => {
  const { uid, claims } = req.body || {};
  if (!uid || !claims) return res.status(400).json({ error: "missing fields" });
  await auth.setCustomUserClaims(uid, claims);
  return res.json({ ok: true });
});

// --- Cloud Tasks worker (single endpoint) ---
app.post("/api/_tasks/run", async (req, res) => {
  const bearer = (req.header("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer || !taskServiceAccount || !taskAudience) {
    return res.status(401).json({ error: "unauthorized_task" });
  }
  try {
    const ticket = await taskOidcClient.verifyIdToken({ idToken: bearer, audience: taskAudience });
    const identity = ticket.getPayload();
    if (identity?.email !== taskServiceAccount || identity.email_verified !== true) {
      return res.status(403).json({ error: "forbidden_task" });
    }
  } catch {
    return res.status(401).json({ error: "unauthorized_task" });
  }
  const name = req.header("x-task-name") || "";
  try {
    await handleTask(name, req.body);
    return res.status(200).send("OK");
  } catch (e: any) {
    logger.error(`task ${name} error`, e);
    return res.status(500).send(e.message);
  }
});

// --- Doctor Schedule ---
app.get("/api/doctor/slots", async (req, res) => {
  try {
    const config = await loadSystemConfig();
    if (config.featureFlags?.doctorBookingEnabled !== true) {
      return res.status(503).json({ error: "Doctor booking is temporarily unavailable." });
    }
    const { tenantId, doctorId, date } = req.query as Record<string, string>;
    if (!tenantId || !doctorId || !date) return res.status(400).json({ error: "missing fields" });
    const slots = await getAvailableSlots({ tenantId, doctorId, dateISO: date });
    return res.json({ slots });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

app.post("/api/doctor/book", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const config = await loadSystemConfig();
    if (config.featureFlags?.doctorBookingEnabled !== true) {
      return res.status(503).json({ error: "Doctor booking is temporarily unavailable." });
    }
    const { tenantId, doctorId, dateISO, startTime } = req.body || {};
    if (!tenantId || !doctorId || !dateISO || !startTime)
      return res.status(400).json({ error: "missing fields" });
    const result = await createBooking({
      tenantId, doctorId, dateISO, startTime,
      customer: {
        uid: req.user!.uid,
        name: (req.user!.email || "Customer").split("@")[0],
        email: req.user!.email || "noemail@example.com",
      },
    });
    return res.json(result);
  } catch (e: any) { return res.status(400).json({ error: e.message }); }
});

app.post("/api/doctor/cancel", requireAuth, async (req: AuthedRequest, res) => {
  const config = await loadSystemConfig();
  if (config.featureFlags?.doctorBookingEnabled !== true) {
    return res.status(503).json({ error: "Doctor booking is temporarily unavailable." });
  }
  if (!req.user?.tenantId || !["OWNER", "STAFF"].includes(req.user.role || "")) {
    return res.status(403).json({ error: "forbidden_tenant_role" });
  }
  const { bookingId } = req.body || {};
  if (!bookingId) return res.status(400).json({ error: "missing bookingId" });
  await cancelBooking(req.user.tenantId, bookingId);
  return res.json({ ok: true });
});

// --- AI Assistant ---
app.post("/api/ai/ask", requireAuth, requireTenant("OWNER", "STAFF", "CASHIER", "INVENTORY"), async (req: AuthedRequest, res) => {
  try {
    const config = await loadSystemConfig();
    if (config.featureFlags?.aiEnabled !== true) {
      return res.status(503).json({ error: "AI assistant is temporarily unavailable." });
    }
    const { question } = req.body || {};
    if (!question) return res.status(400).json({ error: "missing question" });
    const answer = await aiAsk({ tenantId: req.user!.tenantId!, question });
    return res.json({ answer });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// 404
app.use((_req, res) => res.status(404).json({ error: "not_found" }));
