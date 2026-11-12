import { FormEvent, useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { useAuth } from "../../lib/auth";
import { db } from "../../lib/firebase";
import { inviteGoogleUser, loadManagedAccess, updateManagedAccount } from "../../lib/access";
import type { AppRole } from "../../lib/access";
import { createPasswordUser, resetPasswordUser, usernameAuthErrorText } from "../../lib/usernameAuth";

type Role = AppRole;
type ManagedRole = Exclude<Role, "ADMIN">;
type Account = {
  id: string;
  kind: "user" | "invitation";
  email: string;
  displayName?: string;
  role: Role;
  tenantId?: string;
  active: boolean;
  status?: string;
  username?: string;
};
type TenantOption = { id: string; name: string };

const roleLabel: Record<Role, string> = {
  ADMIN: "Admin",
  OWNER: "Owner",
  STAFF: "Staf Apotek",
  CASHIER: "Kasir",
};

export function AdminUsers() {
  const user = useAuth((state) => state.user);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [loginType, setLoginType] = useState<"PASSWORD" | "GOOGLE">("PASSWORD");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<ManagedRole>("OWNER");
  const [tenantId, setTenantId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { role: ManagedRole; tenantId: string }>>({});
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [managed, tenantSnapshot] = await Promise.all([
        loadManagedAccess(),
        getDocs(collection(db, "tenants")),
      ]);
      const tenantOptions = tenantSnapshot.docs.map((snapshot) => {
        const data = snapshot.data();
        return { id: snapshot.id, name: data.profile?.name || data.name || snapshot.id };
      }).sort((a, b) => a.name.localeCompare(b.name));
      setTenants(tenantOptions);
      setAccounts([
        ...managed.users.map((account) => ({ ...account, kind: "user" as const })),
        ...managed.invitations
          .filter((invite) => invite.status !== "CLAIMED")
          .map((account) => ({ ...account, kind: "invitation" as const })),
      ].sort((a, b) => a.email.localeCompare(b.email)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat pengguna.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function invite(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (!user) throw new Error("admin_session_required");
      if (loginType === "PASSWORD") {
        const created = await createPasswordUser({
          username, password, displayName, role, tenantId, createdBy: user.uid,
        });
        setNotice(`Akun ${created.username} dibuat sebagai ${role === "OWNER" ? "Owner" : role === "STAFF" ? "Staf" : "Kasir"}. Pengguna masuk di batam-farma.web.app dengan username dan password tersebut.`);
        setUsername("");
        setPassword("");
      } else {
        await inviteGoogleUser({ email, displayName, role, tenantId, createdBy: user.uid });
        setNotice(`Akses untuk ${email.trim()} tersimpan. Email undangan tidak dikirim otomatis. Minta pengguna membuka batam-farma.web.app lalu masuk dengan Google menggunakan alamat ini.`);
        setEmail("");
      }
      setDisplayName("");
      setShowInvite(false);
      await load();
    } catch (saveError) {
      setError(loginType === "PASSWORD"
        ? usernameAuthErrorText(saveError, "Akun gagal dibuat")
        : saveError instanceof Error ? saveError.message : "Undangan gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function doResetPassword(account: Account) {
    if (!account.username || account.kind !== "user" || account.role === "ADMIN") return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await resetPasswordUser({
        username: account.username,
        newPassword: resetPasswordValue,
        displayName: account.displayName || "",
        role: account.role as ManagedRole,
        tenantId: account.tenantId || "",
        oldUid: account.id,
        updatedBy: user?.uid || "",
      });
      setNotice(`Password ${account.username} berhasil direset. Minta pengguna login ulang dengan password baru.`);
      setResetId(null);
      setResetPasswordValue("");
      await load();
    } catch (resetError) {
      setError(usernameAuthErrorText(resetError, "Reset password gagal"));
    } finally {
      setSaving(false);
    }
  }

  async function saveAccount(account: Account) {
    const draft = drafts[account.id] || {
      role: account.role === "CASHIER" ? "CASHIER" : account.role === "STAFF" ? "STAFF" : "OWNER",
      tenantId: account.tenantId || "",
    };
    setSaving(true);
    setError(null);
    try {
      await updateManagedAccount({
        id: account.id,
        kind: account.kind,
        ...draft,
        active: account.active,
      });
      setNotice(`Akses ${account.email} berhasil diperbarui.`);
      setDrafts((current) => { const next = { ...current }; delete next[account.id]; return next; });
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Perubahan gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(account: Account) {
    if (account.role === "ADMIN") return;
    setSaving(true);
    setError(null);
    try {
      await updateManagedAccount({
        id: account.id,
        kind: account.kind,
        role: account.role as ManagedRole,
        tenantId: account.tenantId || "",
        active: !account.active,
      });
      setNotice(`Akses ${account.email} ${account.active ? "dinonaktifkan" : "diaktifkan"}.`);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Status akses gagal diubah.");
    } finally {
      setSaving(false);
    }
  }

  const tenantName = (id?: string) => tenants.find((tenant) => tenant.id === id)?.name || id || "Belum ditetapkan";

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Pengguna & Akses</h1>
          <p className="text-sm text-ink-500">Daftarkan email akun, tetapkan peran dan apotek, lalu kelola status akses.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowInvite((open) => !open)}>
          {showInvite ? "Tutup" : "+ Tambah akses"}
        </button>
      </header>

      {error && <p role="alert" className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-sm text-accent-700">{notice}</p>}

      {showInvite && (
        <form onSubmit={invite} className="card p-4 grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2 flex gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="adminLoginType" checked={loginType === "PASSWORD"} onChange={() => setLoginType("PASSWORD")} />
              Username & password
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="adminLoginType" checked={loginType === "GOOGLE"} onChange={() => setLoginType("GOOGLE")} />
              Email Google
            </label>
          </div>
          {loginType === "PASSWORD" ? (
            <>
              <p className="md:col-span-2 text-sm text-ink-600">Pengguna masuk dengan username dan password aplikasi. Password dikelola Firebase Authentication dan dapat direset dari halaman ini.</p>
              <label className="text-sm font-medium">Username
                <input className="input mt-1 w-full" autoComplete="off" autoCapitalize="none" spellCheck={false} required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="mis. owner.dfarma" />
                <span className="mt-1 block text-xs font-normal text-ink-500">3-20 karakter: huruf kecil, angka, titik, strip, garis bawah.</span>
              </label>
              <label className="text-sm font-medium">Password
                <div className="relative mt-1">
                  <input className="input w-full pr-16" type={showPassword ? "text" : "password"} autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="min. 6 karakter, huruf + angka" />
                  <button type="button" className="absolute inset-y-0 right-2 text-xs font-medium text-brand-600" onClick={() => setShowPassword((visible) => !visible)}>
                    {showPassword ? "Sembunyikan" : "Lihat"}
                  </button>
                </div>
              </label>
            </>
          ) : (
            <>
              <p className="md:col-span-2 text-sm text-ink-600">Email undangan tidak dikirim otomatis. Setelah akses disimpan, pengguna membuka batam-farma.web.app lalu masuk dengan Google menggunakan alamat yang didaftarkan.</p>
              <label className="text-sm font-medium md:col-span-2">Email akun
                <input className="input mt-1 w-full" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@email.com" />
              </label>
            </>
          )}
          <label className="text-sm font-medium">Nama
            <input className="input mt-1 w-full" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Nama pengguna" />
          </label>
          <label className="text-sm font-medium">Peran
              <select className="input mt-1 w-full" value={role} onChange={(event) => setRole(event.target.value as ManagedRole)}>
              <option value="OWNER">Owner</option>
              <option value="STAFF">Staf Apotek</option>
                <option value="CASHIER">Kasir</option>
            </select>
          </label>
          <label className="text-sm font-medium">Apotek
            <select className="input mt-1 w-full" required value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
              <option value="">Pilih apotek</option>
              {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
            </select>
          </label>
          {tenants.length === 0 && <p className="md:col-span-2 text-sm text-warn-700">Belum ada apotek di Firebase. Buat data apotek sebelum mengundang pengguna.</p>}
          <div className="md:col-span-2 flex justify-end">
            <button className="btn-primary" disabled={saving || tenants.length === 0}>{saving ? "Menyimpan…" : loginType === "PASSWORD" ? "Buat akun" : "Simpan akses"}</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[780px] text-sm">
          <thead className="bg-surface-50 text-left text-xs uppercase text-ink-500">
            <tr>
              <th className="px-4 py-3">Pengguna</th>
              <th className="px-4 py-3">Peran</th>
              <th className="px-4 py-3">Apotek</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-500">Memuat pengguna…</td></tr>
            ) : accounts.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-500">Belum ada akun yang dikelola.</td></tr>
            ) : accounts.map((account) => {
              const draft = drafts[account.id] || {
                role: account.role === "CASHIER" ? "CASHIER" : account.role === "STAFF" ? "STAFF" : "OWNER",
                tenantId: account.tenantId || "",
              };
              const isAdmin = account.role === "ADMIN";
              const canReset = !isAdmin && account.kind === "user" && !!account.username;
              const resetting = resetId === account.id;
              return (
                <tr key={`${account.kind}:${account.id}`} className="border-t border-surface-100">
                  <td className="px-4 py-3">
                    <div className="font-medium">{account.displayName || account.username || account.email}</div>
                    <div className="text-xs text-ink-500">{account.username ? `Username: ${account.username}` : account.email}</div>
                    {account.kind === "invitation" && <div className="text-[11px] text-ink-400">Menunggu login Google pertama</div>}
                    {resetting && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="relative">
                          <input
                            className="input py-1 pr-14 text-sm"
                            type={showResetPassword ? "text" : "password"}
                            autoComplete="new-password"
                            value={resetPasswordValue}
                            onChange={(event) => setResetPasswordValue(event.target.value)}
                            placeholder="Password baru"
                          />
                          <button type="button" className="absolute inset-y-0 right-2 text-xs font-medium text-brand-600" onClick={() => setShowResetPassword((visible) => !visible)}>
                            {showResetPassword ? "Tutup" : "Lihat"}
                          </button>
                        </div>
                        <button className="text-brand-600 text-sm hover:underline" disabled={saving} onClick={() => void doResetPassword(account)}>Simpan</button>
                        <button className="text-ink-500 text-sm hover:underline" onClick={() => { setResetId(null); setResetPasswordValue(""); }}>Batal</button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin ? roleLabel.ADMIN : (
                      <select className="input py-1" value={draft.role} onChange={(event) => setDrafts((current) => ({
                        ...current,
                        [account.id]: { ...draft, role: event.target.value as ManagedRole },
                      }))}>
                        <option value="OWNER">Owner</option>
                        <option value="STAFF">Staf Apotek</option>
                        <option value="CASHIER">Kasir</option>
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin ? "Semua apotek" : (
                      <select className="input py-1" value={draft.tenantId} onChange={(event) => setDrafts((current) => ({
                        ...current,
                        [account.id]: { ...draft, tenantId: event.target.value },
                      }))}>
                        <option value="">Pilih apotek</option>
                        {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
                      </select>
                    )}
                    {!isAdmin && account.tenantId && draft.tenantId === account.tenantId && <span className="sr-only">{tenantName(account.tenantId)}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={account.active ? "text-accent-700" : "text-danger-600"}>
                      {account.active ? (account.kind === "invitation" ? "Undangan aktif" : "Aktif") : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {!isAdmin && <>
                      <button className="text-brand-600 hover:underline mr-3" disabled={saving} onClick={() => void saveAccount(account)}>Simpan</button>
                      {canReset && (
                        <button className="text-warn-700 hover:underline mr-3" disabled={saving} onClick={() => {
                          setResetId(account.id);
                          setResetPasswordValue("");
                          setShowResetPassword(false);
                        }}>Reset password</button>
                      )}
                      <button className={account.active ? "text-danger-600 hover:underline" : "text-accent-700 hover:underline"} disabled={saving} onClick={() => void toggleActive(account)}>
                        {account.active ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    </>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}