import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../lib/auth";
import {
  useDemoStore,
  newDemoId,
  type DemoUser,
  type DemoUserRole,
} from "../../lib/demoStore";

const ROLE_META: Record<DemoUserRole, { label: string; color: string; desc: string }> = {
  OWNER:    { label: "Owner",    color: "bg-brand-100 text-brand-700",   desc: "Akses penuh: pengaturan, keuangan, user, semua modul" },
  APOTEKER: { label: "Apoteker", color: "bg-accent-100 text-accent-700", desc: "Verifikasi resep, kelola inventory, scan QR pickup" },
  KASIR:    { label: "Kasir",    color: "bg-warn-100 text-warn-700",     desc: "POS, pesanan marketplace, scan QR" },
  STAFF:    { label: "Staff",    color: "bg-surface-100 text-ink-700",   desc: "Lihat inventory & pesanan saja (read-only)" },
};

const PERMISSIONS: { key: string; label: string; roles: DemoUserRole[] }[] = [
  { key: "settings",     label: "Pengaturan Apotek (branding, bank, legalitas)", roles: ["OWNER"] },
  { key: "users",        label: "Manajemen User & Role",                          roles: ["OWNER"] },
  { key: "subscription", label: "Langganan & Pembayaran",                         roles: ["OWNER"] },
  { key: "inventory",    label: "Inventory & Batch FEFO",                         roles: ["OWNER", "APOTEKER"] },
  { key: "rx",           label: "Verifikasi Resep Dokter",                        roles: ["OWNER", "APOTEKER"] },
  { key: "doctor",       label: "Jadwal Dokter & Booking",                        roles: ["OWNER", "APOTEKER"] },
  { key: "pos",          label: "POS / Kasir",                                    roles: ["OWNER", "APOTEKER", "KASIR"] },
  { key: "orders",       label: "Pesanan Marketplace",                            roles: ["OWNER", "APOTEKER", "KASIR"] },
  { key: "verify",       label: "Scan QR Pickup",                                 roles: ["OWNER", "APOTEKER", "KASIR"] },
  { key: "view",         label: "Lihat Dashboard & Laporan",                      roles: ["OWNER", "APOTEKER", "KASIR", "STAFF"] },
];

const AVATARS = ["👤", "👨‍💼", "👩‍💼", "👨‍⚕️", "👩‍⚕️", "🛒", "👨", "👩", "🧑‍💻"];

export function TenantUsers() {
  const claims = useAuth((s) => s.claims);
  const tenantId = claims?.tenantId ?? "";

  const users = useDemoStore((s) => s.users);
  const upsertUser = useDemoStore((s) => s.upsertUser);
  const removeUser = useDemoStore((s) => s.removeUser);
  const toggleActive = useDemoStore((s) => s.toggleUserActive);

  const [filter, setFilter] = useState<"all" | DemoUserRole>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<DemoUser | null>(null);
  const [showPerms, setShowPerms] = useState(false);

  const tenantUsers = useMemo(
    () => users.filter((u) => u.tenantId === tenantId),
    [users, tenantId]
  );

  const filtered = useMemo(() => {
    return tenantUsers
      .filter((u) => filter === "all" || u.role === filter)
      .filter((u) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.phone.includes(q)
        );
      });
  }, [tenantUsers, filter, search]);

  const stats = useMemo(() => {
    const byRole = { OWNER: 0, APOTEKER: 0, KASIR: 0, STAFF: 0 } as Record<DemoUserRole, number>;
    let active = 0;
    for (const u of tenantUsers) {
      byRole[u.role]++;
      if (u.active) active++;
    }
    return { total: tenantUsers.length, active, byRole };
  }, [tenantUsers]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Manajemen User & Akses</h1>
          <p className="text-sm text-ink-500">Kelola owner, apoteker, kasir, dan staff. Atur role + permission per user.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setShowPerms(true)}>
            🔐 Lihat Permission Matrix
          </button>
          <button
            className="btn-primary"
            onClick={() =>
              setEditing({
                id: `u-${newDemoId()}`,
                tenantId,
                name: "",
                email: "",
                phone: "",
                role: "STAFF",
                active: true,
                avatarEmoji: "👤",
                joinedISO: new Date().toISOString().slice(0, 10),
              })
            }
          >
            + Tambah User
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI label="Total User" value={stats.total} color="text-brand-600" />
        <KPI label="Aktif" value={stats.active} color="text-accent-600" />
        <KPI label="Owner" value={stats.byRole.OWNER} color="text-brand-700" />
        <KPI label="Apoteker" value={stats.byRole.APOTEKER} color="text-accent-700" />
        <KPI label="Kasir + Staff" value={stats.byRole.KASIR + stats.byRole.STAFF} color="text-warn-700" />
      </div>

      {/* Filter bar */}
      <div className="card p-3 flex flex-wrap gap-3 items-center">
        <input
          className="input flex-1 min-w-[200px]"
          placeholder="🔎 Cari nama, email, atau no HP…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "OWNER", "APOTEKER", "KASIR", "STAFF"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setFilter(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                filter === r
                  ? "bg-brand-500 text-white border-brand-500"
                  : "bg-white text-ink-600 border-surface-200 hover:bg-surface-50"
              }`}
            >
              {r === "all" ? "Semua" : ROLE_META[r].label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-50 text-left text-xs uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Kontak</th>
              <th className="px-4 py-3">Bergabung</th>
              <th className="px-4 py-3">Login Terakhir</th>
              <th className="px-4 py-3 text-center">Aktif</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-ink-400">
                  Tidak ada user yang sesuai filter.
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="border-t border-surface-100 hover:bg-surface-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-100 to-accent-100 flex items-center justify-center text-lg">
                        {u.avatarEmoji}
                      </div>
                      <div>
                        <div className="font-medium text-ink-900">{u.name || "(tanpa nama)"}</div>
                        {u.sipa && <div className="text-[11px] text-ink-400">SIPA: {u.sipa}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${ROLE_META[u.role].color}`}>
                      {ROLE_META[u.role].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-600">
                    <div>{u.email || "—"}</div>
                    <div className="text-ink-400">{u.phone || "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500">{fmtDate(u.joinedISO)}</td>
                  <td className="px-4 py-3 text-xs text-ink-500">
                    {u.lastLoginISO ? fmtDate(u.lastLoginISO) : <span className="text-ink-300">belum pernah</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleActive(u.id)}
                      className={`relative w-10 h-5 rounded-full transition ${u.active ? "bg-accent-500" : "bg-surface-300"}`}
                    >
                      <span
                        className={`absolute top-0.5 ${u.active ? "left-5" : "left-0.5"} w-4 h-4 rounded-full bg-white transition-all`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-xs text-brand-600 hover:underline mr-3" onClick={() => setEditing(u)}>
                      Edit
                    </button>
                    <button
                      className="text-xs text-danger-600 hover:underline"
                      onClick={() => {
                        if (u.role === "OWNER" && stats.byRole.OWNER <= 1) {
                          alert("Tidak bisa menghapus Owner terakhir.");
                          return;
                        }
                        if (confirm(`Hapus user ${u.name}?`)) removeUser(u.id);
                      }}
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      <AnimatePresence>
        {editing && (
          <UserEditor
            user={editing}
            onClose={() => setEditing(null)}
            onSave={(u) => {
              upsertUser(u);
              setEditing(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Permission matrix modal */}
      <AnimatePresence>
        {showPerms && <PermissionMatrix onClose={() => setShowPerms(false)} />}
      </AnimatePresence>
    </div>
  );
}

function KPI({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function UserEditor({
  user,
  onClose,
  onSave,
}: {
  user: DemoUser;
  onClose: () => void;
  onSave: (u: DemoUser) => void;
}) {
  const [u, setU] = useState<DemoUser>(user);
  const set = <K extends keyof DemoUser>(k: K, v: DemoUser[K]) => setU((p) => ({ ...p, [k]: v }));

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-surface-100 flex items-center justify-between">
          <h2 className="font-bold text-lg">{u.name ? `Edit ${u.name}` : "Tambah User Baru"}</h2>
          <button className="text-ink-400 hover:text-ink-700" onClick={onClose}>✕</button>
        </div>
        <div className="p-6 space-y-4">
          {/* Avatar picker */}
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">Avatar</label>
            <div className="flex gap-1.5 flex-wrap">
              {AVATARS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => set("avatarEmoji", a)}
                  className={`w-10 h-10 rounded-lg text-xl border-2 transition ${
                    u.avatarEmoji === a ? "border-brand-500 bg-brand-50" : "border-surface-200 hover:border-brand-300"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <Field label="Nama Lengkap">
            <input className="input" value={u.name} onChange={(e) => set("name", e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <input className="input" type="email" value={u.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="No HP / WhatsApp">
              <input className="input" value={u.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
          </div>

          {/* Role picker */}
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">Role</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(ROLE_META) as DemoUserRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => set("role", r)}
                  className={`text-left p-3 rounded-xl border-2 transition ${
                    u.role === r ? "border-brand-500 bg-brand-50" : "border-surface-200 hover:border-brand-300"
                  }`}
                >
                  <div className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold mb-1 ${ROLE_META[r].color}`}>
                    {ROLE_META[r].label}
                  </div>
                  <div className="text-[11px] text-ink-500">{ROLE_META[r].desc}</div>
                </button>
              ))}
            </div>
          </div>

          {u.role === "APOTEKER" && (
            <Field label="Nomor SIPA (Surat Izin Praktik Apoteker)">
              <input className="input" value={u.sipa ?? ""} onChange={(e) => set("sipa", e.target.value)} placeholder="SIPA/2024/0001" />
            </Field>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-surface-100">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={u.active} onChange={(e) => set("active", e.target.checked)} />
              <span className="text-sm">User aktif (bisa login)</span>
            </label>
          </div>
        </div>
        <div className="px-6 py-4 bg-surface-50 border-t border-surface-100 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button
            className="btn-primary"
            onClick={() => {
              if (!u.name.trim()) return alert("Nama wajib diisi");
              if (!u.email.trim()) return alert("Email wajib diisi");
              onSave(u);
            }}
          >
            Simpan
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PermissionMatrix({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-surface-100 flex items-center justify-between">
          <h2 className="font-bold text-lg">🔐 Permission Matrix per Role</h2>
          <button className="text-ink-400 hover:text-ink-700" onClick={onClose}>✕</button>
        </div>
        <div className="p-6">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-surface-50">
                <th className="text-left px-3 py-2 border border-surface-100">Modul / Akses</th>
                {(Object.keys(ROLE_META) as DemoUserRole[]).map((r) => (
                  <th key={r} className="px-2 py-2 border border-surface-100 text-xs">
                    <span className={`px-2 py-0.5 rounded ${ROLE_META[r].color}`}>{ROLE_META[r].label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p.key}>
                  <td className="px-3 py-2 border border-surface-100 text-ink-700">{p.label}</td>
                  {(Object.keys(ROLE_META) as DemoUserRole[]).map((r) => (
                    <td key={r} className="px-2 py-2 border border-surface-100 text-center">
                      {p.roles.includes(r) ? (
                        <span className="text-accent-600 font-bold">✓</span>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-ink-500 mt-4">
            <strong>Catatan:</strong> Owner adalah satu-satunya role yang bisa mengelola pengaturan apotek, user, dan langganan. Role
            APOTEKER wajib untuk verifikasi resep dokter (regulasi BPOM).
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-600 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
