import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import {
  deleteAccountPermanently, inviteGoogleUser, loadTenantAccess, removeTenantAccount, updateManagedAccount,
  type AccessInvitation, type AccessProfile,
} from "../../lib/access";
import { createPasswordUser, resetPasswordUser, usernameAuthErrorText } from "../../lib/usernameAuth";

type ManagedRole = "OWNER" | "STAFF" | "CASHIER";
type EditableRole = Exclude<ManagedRole, "OWNER">;
type Account = (AccessProfile | AccessInvitation) & { id: string; kind: "user" | "invitation" };

const roleName: Record<ManagedRole, string> = {
  OWNER: "Owner",
  STAFF: "Staf Apotek",
  CASHIER: "Kasir",
};

export function TenantAccess() {
  const tenantId = useAuth((state) => state.claims?.tenantId || "");
  const currentUser = useAuth((state) => state.user);
  const [accounts, setAccounts] = useState<Account[]>([]);
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
  const [role, setRole] = useState<ManagedRole>("STAFF");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<EditableRole>("STAFF");
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);

  async function load() {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const managed = await loadTenantAccess(tenantId);
      setAccounts([
        ...managed.users.map((account) => ({ ...account, kind: "user" as const })),
        ...managed.invitations
          .filter((invite) => invite.status !== "CLAIMED")
          .map((invite) => ({ ...invite, kind: "invitation" as const })),
      ].sort((a, b) => a.email.localeCompare(b.email)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat anggota apotek.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [tenantId]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return accounts.filter((account) => !needle ||
      account.email.toLowerCase().includes(needle) ||
      ((account as AccessProfile).username || "").toLowerCase().includes(needle) ||
      (account.displayName || "").toLowerCase().includes(needle));
  }, [accounts, search]);

  const activeCount = accounts.filter((account) => account.active).length;
  const invitationCount = accounts.filter((account) => account.kind === "invitation").length;

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!currentUser || !tenantId) {
      setError("Sesi Owner atau data apotek tidak tersedia. Muat ulang halaman dan coba lagi.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (loginType === "PASSWORD") {
        const created = await createPasswordUser({
          username, password, displayName, role, tenantId, createdBy: currentUser.uid,
        });
        setNotice(`Akun ${created.username} dibuat. Pengguna masuk di batam-farma.web.app dengan username dan password tersebut.`);
        setUsername("");
        setPassword("");
      } else {
        await inviteGoogleUser({ email, displayName, role, tenantId, createdBy: currentUser.uid });
        setNotice(`Akses ${email.trim()} tersimpan. Minta pengguna membuka batam-farma.web.app dan memilih Lanjutkan dengan Google menggunakan email tersebut.`);
        setEmail("");
      }
      setDisplayName("");
      setShowInvite(false);
      await load();
    } catch (inviteError) {
      const message = inviteError instanceof Error ? inviteError.message : "unknown_error";
      const code = inviteError && typeof inviteError === "object" && "code" in inviteError
        ? String(inviteError.code)
        : "";
      const messages: Record<string, string> = {
        user_already_exists: "Email ini sudah memiliki akun akses di apotek ini.",
        user_already_claimed: "Email ini sudah mengaktifkan undangan.",
        "permission-denied": "Firestore menolak penyimpanan. Pastikan Owner masih memiliki akses ke apotek ini.",
        unavailable: "Server sedang tidak terjangkau. Periksa koneksi internet lalu coba lagi.",
        "deadline-exceeded": "Koneksi ke server terlalu lama. Periksa status undangan sebelum mencoba lagi.",
        "offline": "Fitur ini hanya dapat disimpan saat internet tersambung.",
      };
      setError(
        messages[message]
        || messages[code]
        || (loginType === "PASSWORD"
          ? usernameAuthErrorText(inviteError, "Akun gagal dibuat")
          : `Undangan gagal disimpan (${message}).`),
      );
    } finally {
      setSaving(false);
    }
  }

  async function doResetPassword(account: Account) {
    const profile = account as AccessProfile;
    if (!profile.username || account.kind !== "user" || account.role === "OWNER") return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await resetPasswordUser({
        username: profile.username,
        newPassword: resetPassword,
        displayName: account.displayName || "",
        role: account.role === "CASHIER" ? "CASHIER" : "STAFF",
        tenantId,
        oldUid: account.id,
        updatedBy: currentUser?.uid || "",
      });
      setNotice(`Password ${profile.username} berhasil direset. Minta pengguna login ulang dengan password baru.`);
      setResetId(null);
      setResetPassword("");
      await load();
    } catch (resetError) {
      setError(usernameAuthErrorText(resetError, "Reset password gagal"));
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(account: Account) {
    if (account.role === "OWNER" && account.kind === "user") return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await updateManagedAccount({
        id: account.id,
        kind: account.kind,
        role: account.role === "OWNER" ? "OWNER" : editRole,
        tenantId,
        active: account.active,
        displayName: editName,
      });
      setNotice(`${account.email}: akses berhasil diperbarui.`);
      setEditingId(null);
      await load();
    } catch {
      setError("Perubahan akses gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function removeAccess(account: Account) {
    if (account.role === "OWNER" && account.kind === "user") return;
    const action = account.kind === "invitation" ? "menghapus undangan" : "menonaktifkan akses";
    if (!confirm(`Yakin ${action} ${account.email}?`)) return;
    setSaving(true);
    setError(null);
    try {
      await removeTenantAccount({ id: account.id, kind: account.kind });
      setNotice(account.kind === "invitation" ? "Undangan dihapus." : "Akses dinonaktifkan; akun Firebase tetap tersimpan.");
      await load();
    } catch {
      setError("Akses gagal dihapus.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount(account: Account) {
    if (account.kind !== "user" || account.role === "OWNER") return;
    const profile = account as AccessProfile;
    const label = profile.username || account.email;
    if (!confirm(`HAPUS PERMANEN akun ${label}?\n\nAkses dan data login aplikasinya dihapus dan tidak bisa dikembalikan.${profile.username ? ` Username "${profile.username}" bisa dipakai ulang.` : ""}\n\nRiwayat transaksi yang sudah tercatat tetap tersimpan.`)) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await deleteAccountPermanently({ uid: account.id, username: profile.username });
      setNotice(`Akun ${label} dihapus permanen.`);
      await load();
    } catch {
      setError("Akun gagal dihapus. Pastikan Anda masih Owner apotek ini.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Pengguna & Akses</h1>
          <p className="text-sm text-ink-500">Kelola akses Owner, Staf Apotek, dan Kasir untuk apotek ini.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowInvite((open) => !open)}>
          {showInvite ? "Tutup" : "+ Tambah pengguna"}
        </button>
      </header>

      {error && <p role="alert" className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-sm text-accent-700">{notice}</p>}

      {showInvite && (
        <form onSubmit={invite} className="card p-4 grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2 flex gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="loginType" checked={loginType === "PASSWORD"} onChange={() => setLoginType("PASSWORD")} />
              Username & password
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="loginType" checked={loginType === "GOOGLE"} onChange={() => setLoginType("GOOGLE")} />
              Email Google
            </label>
          </div>
          {loginType === "PASSWORD" ? (
            <>
              <p className="md:col-span-2 text-sm text-ink-600">Pengguna masuk dengan username dan password ini di halaman login. Password dikelola Firebase Authentication dan dapat direset Owner kapan saja.</p>
              <label className="text-sm font-medium">Username
                <input className="input mt-1 w-full" autoComplete="off" autoCapitalize="none" spellCheck={false} required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="mis. kasir1" />
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
              <p className="md:col-span-2 text-sm text-ink-600">Pengguna masuk dengan akun Google tersebut. Pilih peran sesuai akses yang dibutuhkan.</p>
              <label className="text-sm font-medium md:col-span-2">Email akun
                <input className="input mt-1 w-full" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@email.com" />
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
          <div className="md:col-span-2 flex items-end justify-end">
            <button className="btn-primary" disabled={saving}>{saving ? "Menyimpan…" : loginType === "PASSWORD" ? "Buat akun" : "Simpan akses"}</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-2 gap-3 max-w-md">
        <Metric label="Anggota" value={String(accounts.length)} />
        <Metric label="Aktif" value={String(activeCount)} />
      </div>

      <div className="card overflow-hidden">
        <div className="p-3 border-b border-surface-100 flex items-center justify-between gap-3 flex-wrap">
          <input className="input max-w-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, username, atau email" />
          <span className="text-xs text-ink-500">{invitationCount} menunggu login pertama</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-surface-50 text-left text-xs uppercase text-ink-500">
              <tr>
                <th className="px-4 py-3">Pengguna</th>
                <th className="px-4 py-3">Peran</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Akses</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-ink-500">Memuat anggota…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-ink-500">Belum ada anggota yang cocok.</td></tr>
              ) : filtered.map((account) => {
                const owner = account.role === "OWNER";
                const memberRole: EditableRole = account.role === "CASHIER" ? "CASHIER" : "STAFF";
                const canManage = !owner || account.kind === "invitation";
                const editing = editingId === `${account.kind}:${account.id}`;
                const accountUsername = (account as AccessProfile).username;
                const canReset = canManage && account.kind === "user" && !!accountUsername;
                const resetting = resetId === account.id;
                return (
                  <tr key={`${account.kind}:${account.id}`} className="border-t border-surface-100">
                    <td className="px-4 py-3">
                      {editing ? <input className="input py-1" value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="Nama pengguna" /> : <div className="font-medium">{account.displayName || accountUsername || account.email}</div>}
                      <div className="text-xs text-ink-500">{accountUsername ? `Username: ${accountUsername}` : account.email}</div>
                      {account.kind === "invitation" && <div className="text-[11px] text-ink-400">Menunggu login pertama</div>}
                      {resetting && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="relative">
                            <input
                              className="input py-1 pr-14 text-sm"
                              type={showResetPassword ? "text" : "password"}
                              autoComplete="new-password"
                              value={resetPassword}
                              onChange={(event) => setResetPassword(event.target.value)}
                              placeholder="Password baru"
                            />
                            <button type="button" className="absolute inset-y-0 right-2 text-xs font-medium text-brand-600" onClick={() => setShowResetPassword((visible) => !visible)}>
                              {showResetPassword ? "Tutup" : "Lihat"}
                            </button>
                          </div>
                          <button className="text-brand-600 text-sm hover:underline" disabled={saving} onClick={() => void doResetPassword(account)}>Simpan</button>
                          <button className="text-ink-500 text-sm hover:underline" onClick={() => { setResetId(null); setResetPassword(""); }}>Batal</button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {owner && !editing ? roleName.OWNER : owner ? (
                        <span>{roleName.OWNER}</span>
                      ) : editing ? (
                        <select className="input py-1" value={editRole} disabled={saving} onChange={(event) => setEditRole(event.target.value as EditableRole)}>
                          <option value="STAFF">Staf Apotek</option>
                          <option value="CASHIER">Kasir</option>
                        </select>
                      ) : (
                        roleName[memberRole]
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={account.active ? "text-accent-700" : "text-danger-600"}>
                        {account.active ? (account.kind === "invitation" ? "Undangan aktif" : "Aktif") : "Nonaktif"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage && (editing ? <>
                        <button className="text-brand-600 hover:underline mr-3" disabled={saving} onClick={() => void saveEdit(account)}>Simpan</button>
                        <button className="text-ink-500 hover:underline" onClick={() => setEditingId(null)}>Batal</button>
                      </> : <>
                        <button className="text-brand-600 hover:underline mr-3" disabled={saving} onClick={() => {
                          setEditingId(`${account.kind}:${account.id}`);
                          setEditName(account.displayName || "");
                          setEditRole(memberRole);
                        }}>Edit</button>
                        {canReset && (
                          <button className="text-warn-700 hover:underline mr-3" disabled={saving} onClick={() => {
                            setResetId(account.id);
                            setResetPassword("");
                            setShowResetPassword(false);
                          }}>Reset password</button>
                        )}
                        <button className="text-danger-600 hover:underline mr-3" disabled={saving} onClick={() => void removeAccess(account)}>
                          {account.kind === "invitation" ? "Hapus undangan" : "Nonaktifkan"}
                        </button>
                        {account.kind === "user" && !owner && (
                          <button className="text-danger-700 font-semibold hover:underline" disabled={saving} onClick={() => void deleteAccount(account)}>
                            Hapus akun
                          </button>
                        )}
                      </>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="card p-4"><div className="text-xs text-ink-500">{label}</div><div className="text-2xl font-bold mt-1">{value}</div></div>;
}