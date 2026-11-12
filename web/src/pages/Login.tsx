import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { isSignInWithEmailLink } from "firebase/auth";
import { useAuth } from "../lib/auth";
import { auth } from "../lib/firebase";
import { usernameAuthErrorText } from "../lib/usernameAuth";
import { useNavigate } from "react-router-dom";

export function Login() {
  const { signInGoogle, signInUsername, user, isAdmin, claims, authError } = useAuth();
  const nav = useNavigate();
  const reduceMotion = useReducedMotion();
  const [emailLinkNotice, setEmailLinkNotice] = useState(false);
  const [mode, setMode] = useState<"password" | "google">("password");

  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) return;
    setEmailLinkNotice(true);
    window.localStorage.removeItem("emailForSignIn");
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (isAdmin) nav("/admin");
    else if (claims?.tenantId) nav("/app");
  }, [user, isAdmin, claims, nav]);

  return (
    <div className="min-h-screen bg-surface-50">
      <main className="flex min-h-screen w-full items-center justify-center px-5 py-10">
        <motion.section
          initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="card mx-auto w-full max-w-md border border-surface-100 p-6 sm:p-8"
        >
          <motion.img
            aria-hidden="true"
            alt=""
            src="/login-illustration.svg"
            className="mx-auto mb-4 h-36 w-full max-w-[230px] object-contain"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.45, delay: reduceMotion ? 0 : 0.1 }}
          />
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">D’Farma</p>
            <h1 className="mt-3 text-2xl font-bold text-ink-900">Masuk ke akun Anda</h1>
            <p className="mt-2 text-sm text-ink-500">Masuk dengan username aplikasi atau akun Google terdaftar.</p>
          </div>

          {emailLinkNotice && (
            <p role="status" className="mt-5 rounded-lg border border-warn-200 bg-warn-50 px-3 py-2 text-sm text-warn-700">
              Login melalui email sementara dinonaktifkan. Silakan masuk dengan username atau Google.
            </p>
          )}

          <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-surface-100 p-1 text-sm font-medium">
            <button
              type="button"
              className={`rounded-lg py-2 transition ${mode === "password" ? "bg-white shadow text-ink-900" : "text-ink-500"}`}
              onClick={() => setMode("password")}
            >
              Username
            </button>
            <button
              type="button"
              className={`rounded-lg py-2 transition ${mode === "google" ? "bg-white shadow text-ink-900" : "text-ink-500"}`}
              onClick={() => setMode("google")}
            >
              Akun Google
            </button>
          </div>

          <div className="mt-5">
            {mode === "password"
              ? <UsernameLogin onSubmit={signInUsername} error={authError} />
              : <GoogleLogin onClick={signInGoogle} error={authError} />}
          </div>

          <p className="mt-5 text-center text-xs text-ink-500">Akses diberikan melalui pendaftaran oleh Admin atau Owner.</p>
        </motion.section>
      </main>
    </div>
  );
}

function UsernameLogin({ onSubmit, error }: { onSubmit: (username: string, password: string) => Promise<void>; error: string | null }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setLocalError(null);
        try { await onSubmit(username, password); }
        catch (submitError) { setLocalError(usernameAuthErrorText(submitError, "Login tidak berhasil")); }
        finally { setBusy(false); }
      }}
    >
      <label className="block text-sm font-medium text-ink-700">Username
        <input
          className="input mt-1 w-full"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="username"
        />
      </label>
      <label className="block text-sm font-medium text-ink-700">Password
        <div className="relative mt-1">
          <input
            className="input w-full pr-16"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            placeholder="••••••••"
          />
          <button
            type="button"
            className="absolute inset-y-0 right-2 text-xs font-medium text-brand-600"
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? "Sembunyikan" : "Lihat"}
          </button>
        </div>
      </label>
      <button className="btn-primary w-full h-12 text-base" disabled={busy}>
        {busy ? "Memeriksa…" : "Masuk"}
      </button>
      {(localError || error) && <p role="alert" className="text-sm text-danger-600">{localError || error}</p>}
    </form>
  );
}

function GoogleLogin({ onClick, error }: { onClick: () => Promise<void>; error: string | null }) {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  return (
    <div className="text-center">
      <button
        className="btn-primary w-full h-12 text-base"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setLocalError(null);
          try { await onClick(); }
          catch { setLocalError("Login Google tidak berhasil. Coba lagi."); }
          finally { setBusy(false); }
        }}
      >
        {busy ? "Membuka Google…" : "Lanjutkan dengan Google"}
      </button>
      {(localError || error) && <p role="alert" className="text-sm text-danger-600">{localError || error}</p>}
    </div>
  );
}
