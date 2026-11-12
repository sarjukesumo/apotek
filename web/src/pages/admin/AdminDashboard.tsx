import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/auth";
import { loadManagedAccess } from "../../lib/access";

type TenantSummary = { id: string; name: string; plan: string; status: string };

export function AdminDashboard() {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [activeUsers, setActiveUsers] = useState(0);
  const [pendingInvitations, setPendingInvitations] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const enterTenant = useAuth((state) => state.enterTenant);
  const nav = useNavigate();

  useEffect(() => {
    let active = true;
    Promise.all([
      getDocs(collection(db, "tenants")),
      loadManagedAccess(),
    ]).then(([tenantSnapshot, access]) => {
      if (!active) return;
      setTenants(tenantSnapshot.docs.map((document) => {
        const data = document.data();
        return {
          id: document.id,
          name: data.profile?.name || data.name || document.id,
          plan: data.subscription?.plan || "—",
          status: data.subscription?.status || "—",
        };
      }));
      setActiveUsers(access.users.filter((user) => user.active).length);
      setPendingInvitations(access.invitations.filter((invite) => invite.status === "PENDING" && invite.active).length);
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard Admin</h1>
        <p className="text-sm text-ink-500">Ringkasan data apotek dan akses pengguna dari Firebase.</p>
      </div>
      {loadError && <p role="alert" className="text-sm text-danger-600">Data Firebase gagal dimuat.</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Apotek terdaftar" value={String(tenants.length)} to="/admin/tenants" />
        <Stat label="Pengguna aktif" value={String(activeUsers)} to="/admin/users" />
        <Stat label="Undangan menunggu" value={String(pendingInvitations)} to="/admin/users" />
      </div>
      <section className="card overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b border-surface-100">
          <h2 className="font-semibold">Apotek</h2>
          <Link to="/admin/tenants" className="text-sm text-brand-600 hover:underline">Semua apotek</Link>
        </div>
        {tenants.length === 0 ? <p className="p-6 text-sm text-ink-500">Belum ada data apotek di Firebase.</p> : (
          <div className="divide-y divide-surface-100">
            {tenants.slice(0, 8).map((tenant) => (
              <div key={tenant.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{tenant.name}</div>
                  <div className="text-xs text-ink-500">{tenant.plan}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-ink-600">{tenant.status}</span>
                  <button
                    className="btn-primary px-3 py-1.5 text-sm"
                    onClick={() => { enterTenant(tenant.id); nav("/app"); }}
                  >
                    Masuk ke apotek →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <Link to="/admin/users" className="btn-primary inline-flex">Kelola pengguna</Link>
    </div>
  );
}

function Stat({ label, value, hint, to }: { label: string; value: string; hint?: string; to?: string }) {
  const body = (
    <>
      <div className="text-[11px] uppercase tracking-wider text-ink-500 flex items-center justify-between gap-2">
        <span>{label}</span>
        {to && <span aria-hidden="true" className="text-ink-300">›</span>}
      </div>
      <div className="text-lg font-bold text-ink-900 mt-0.5">{value}</div>
      {hint && <div className="text-[10px] text-ink-400">{hint}</div>}
    </>
  );
  if (to) {
    return <Link to={to} className="card p-3 block hover:border-brand-300 transition-colors" title={`Lihat ${label.toLowerCase()}`}>{body}</Link>;
  }
  return <div className="card p-3">{body}</div>;
}

