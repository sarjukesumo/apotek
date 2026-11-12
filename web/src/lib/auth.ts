// Auth store + subscriber.
import { create } from "zustand";
import {
  isSignInWithEmailLink, onAuthStateChanged, sendSignInLinkToEmail,
  signInWithEmailLink, signInWithPopup, signOut, User
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { resolveUserAccess } from "./access";
import { signInWithUsername } from "./usernameAuth";

interface AuthState {
  user: User | null;
  ready: boolean;
  claims: { tenantId?: string; role?: string } | null;
  isAdmin: boolean;
  authError: string | null;
  signInGoogle: () => Promise<void>;
  signInUsername: (username: string, password: string) => Promise<void>;
  sendEmailSignInLink: (email: string) => Promise<void>;
  completeEmailSignIn: (email: string, url: string) => Promise<void>;
  enterTenant: (tenantId: string) => void;
  exitTenant: () => void;
  signOut: () => Promise<void>;
}

// Admin "open pharmacy" mode: per-tab marker so a platform admin can use the
// tenant app as an Owner. Firestore access still relies on the admin token.
const ACTING_TENANT_KEY = "pharmaos-admin-acting-tenant";

function readActingTenant() {
  if (typeof window === "undefined") return undefined;
  return window.sessionStorage.getItem(ACTING_TENANT_KEY) || undefined;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  ready: false,
  claims: null,
  isAdmin: false,
  authError: null,
  signInGoogle: async () => {
    useAuth.setState({ authError: null });
    await signInWithPopup(auth, googleProvider);
  },
  signInUsername: async (username, password) => {
    useAuth.setState({ authError: null });
    await signInWithUsername(username, password);
  },
  sendEmailSignInLink: async (email) => {
    useAuth.setState({ authError: null });
    await sendSignInLinkToEmail(auth, email.trim(), {
      url: `${window.location.origin}/login`,
      handleCodeInApp: true,
    });
    window.localStorage.setItem("emailForSignIn", email.trim());
  },
  completeEmailSignIn: async (email, url) => {
    if (!isSignInWithEmailLink(auth, url)) throw new Error("invalid_email_sign_in_link");
    await signInWithEmailLink(auth, email.trim(), url);
    window.localStorage.removeItem("emailForSignIn");
  },
  enterTenant: (tenantId) => {
    if (!get().isAdmin || !tenantId) return;
    window.sessionStorage.setItem(ACTING_TENANT_KEY, tenantId);
    useAuth.setState({ claims: { tenantId, role: "OWNER" } });
  },
  exitTenant: () => {
    window.sessionStorage.removeItem(ACTING_TENANT_KEY);
    if (get().isAdmin) useAuth.setState({ claims: { tenantId: undefined, role: "ADMIN" } });
  },
  signOut: async () => {
    window.sessionStorage.removeItem(ACTING_TENANT_KEY);
    await signOut(auth);
  }
}));

// Remove any old local-admin session marker; it is no longer a valid login.
if (typeof window !== "undefined") {
  window.localStorage.removeItem("pharmaos-dev-admin");
}

if (typeof window !== "undefined") {
  window.localStorage.removeItem("pharmaos-wa-session");
}

async function applyAuthState(user: User | null) {
  if (!user) {
    useAuth.setState((state) => ({
      user: null,
      ready: true,
      claims: null,
      isAdmin: false,
      authError: state.authError,
    }));
    return;
  }
  try {
    const profile = await resolveUserAccess(user);
    const isAdmin = profile.role === "ADMIN";
    const actingTenant = isAdmin ? readActingTenant() : undefined;
    useAuth.setState({
      user,
      ready: true,
      claims: actingTenant
        ? { tenantId: actingTenant, role: "OWNER" }
        : { tenantId: profile.tenantId, role: profile.role },
      isAdmin,
      authError: null,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "access_check_failed";
    if (code === "offline_access_unavailable") {
      useAuth.setState({
        user,
        ready: true,
        claims: null,
        isAdmin: false,
        authError: "Profil akses belum tersimpan di perangkat ini. Sambungkan internet dan masuk sekali untuk menyiapkan akses offline.",
      });
      return;
    }
    const messages: Record<string, string> = {
      account_not_invited: "Akun ini belum didaftarkan oleh Admin atau Owner.",
      account_disabled: "Akses akun ini sedang dinonaktifkan. Hubungi Admin.",
      invitation_inactive: "Undangan akun ini tidak aktif. Hubungi Admin.",
      verified_email_required: "Gunakan tautan login dari email yang terverifikasi.",
      tenant_not_found: "Apotek untuk akun ini tidak ditemukan. Hubungi Admin.",
    };
    try { await signOut(auth); } catch { /* Keep the account locked if sign-out itself fails. */ }
    useAuth.setState({
      user: null,
      ready: true,
      claims: null,
      isAdmin: false,
      authError: messages[code] || "Akses belum dapat diverifikasi. Coba lagi atau hubungi Admin.",
    });
  }
}

onAuthStateChanged(auth, applyAuthState);
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (auth.currentUser) void applyAuthState(auth.currentUser);
  });
}

export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const u = useAuth.getState().user;
  const headers = new Headers(init.headers);
  if (u) headers.set("Authorization", "Bearer " + (await u.getIdToken()));
  headers.set("Content-Type", "application/json");
  const response = await fetch(input, { ...init, headers });
  const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  if (url.startsWith("/api/") && !response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Fitur ini memerlukan Cloud Functions dan tidak tersedia pada paket Spark.");
  }
  return response;
}
