// Auth helpers: enforce admin allowlist, derive tenant context from custom claims.
import { Request, Response, NextFunction } from "express";
import { auth, db } from "../firebase";

export interface AuthedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    emailVerified: boolean;
    signInProvider: string;
    tenantId?: string;
    role?: string;
    isAdmin: boolean;
  };
}

const ADMIN_EMAIL = "sarju.kesumo@gmail.com";

export async function authMiddleware(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.header("authorization") || "";
  if (!header.startsWith("Bearer ")) { next(); return; }
  const token = header.slice(7);
  try {
    const decoded = await auth.verifyIdToken(token);
    const isAdmin = decoded.email === ADMIN_EMAIL;
    const accessSnap = isAdmin ? null : await db.doc(`userAccess/${decoded.uid}`).get();
    if (accessSnap?.exists && accessSnap.data()?.active !== true && req.path !== "/api/auth/session") {
      next();
      return;
    }
    const access = accessSnap?.data();
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: decoded.email_verified === true,
      signInProvider: decoded.firebase?.sign_in_provider || "",
      tenantId: access?.tenantId ?? (decoded as any).tenantId,
      role: access?.role ?? (decoded as any).role,
      isAdmin,
    };
  } catch {
    // ignore; route guard will reject
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user) { res.status(401).json({ error: "unauthorized" }); return; }
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user?.isAdmin) { res.status(403).json({ error: "forbidden_admin" }); return; }
  next();
}

export function requireTenant(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user?.tenantId) { res.status(403).json({ error: "forbidden_tenant" }); return; }
    if (roles.length && !roles.includes(req.user.role || "")) {
      res.status(403).json({ error: "forbidden_role" }); return;
    }
    next();
  };
}
