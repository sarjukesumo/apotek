import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, doc, getDocs, query, runTransaction, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/auth";
import { createPharmacy } from "../../lib/access";

interface UnifiedTenant {
  id: string;
  name: string;
  slug: string;
  city?: string;
  plan?: string;
  status?: string;
  marketplaceEnabled?: boolean;
}

export function AdminTenants() {
  const user = useAuth((state) => state.user);
  const enterTenant = useAuth((state) => state.enterTenant);
  const nav = useNavigate();
  const [realTenants, setRealTenants] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<"ALL" | "STARTER" | "PRO" | "ENTERPRISE">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "TRIAL" | "EXPIRED">("ALL");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");

  async function reloadTenants() {
    const snapshot = await getDocs(collection(db, "tenants"));
    setRealTenants(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
  }

  useEffect(() => {
    reloadTenants()
      .catch(() => setRealTenants([]));
  }, []);

  async function createTenant(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      if (!user) throw new Error("admin_session_required");
      const existing = await getDocs(query(collection(db, "tenants"), where("tenantSlug", "==", slug)));
      if (!existing.empty) throw new Error("tenant_slug_taken");
      await createPharmacy({ name, slug, city, phone, createdBy: user.uid });
      setName("");
      setSlug("");
      setCity("");
      setPhone("");
      setShowCreate(false);
      await reloadTenants();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Gagal membuat apotek.");
    } finally {
      setCreating(false);
    }
  }

  const unified: UnifiedTenant[] = useMemo(() => {
    return realTenants.map((r) => ({
      id: r.id,
      name: r.profile?.name ?? r.id,
      slug: r.tenantSlug ?? r.id,
      city: r.profile?.city,
      plan: r.subscription?.plan ?? "—",
      status: r.subscription?.status ?? "—",
      marketplaceEnabled: r.marketplaceEnabled === true,
    }));
  }, [realTenants]);

  const filtered = useMemo(() => {
    return unified.filter((t) => {
      if (planFilter !== "ALL" && t.plan !== planFilter) return false;
      if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (t.name + " " + t.slug + " " + (t.city ?? "")).toLowerCase().includes(q);
      }
      return true;
    });
  }, [unified, planFilter, statusFilter, search]);

  const activeCount = unified.filter((t) => t.status === "ACTIVE").length;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">🏢 Tenants Apotek</h1>
          <p className="text-sm text-ink-500">{unified.length} apotek terdaftar · {activeCount} aktif · data Firebase</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate((visible) => !visible)}>
          {showCreate ? "Tutup" : "+ Tambah apotek"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={createTenant} className="card p-4 grid gap-3 md:grid-cols-2">
          <label className="text-sm font-medium">Nama apotek
            <input className="input mt-1 w-full" required minLength={3} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="text-sm font-medium">Slug publik
            <input className="input mt-1 w-full" required pattern="[a-z][a-z0-9-]{1,28}[a-z0-9]" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} placeholder="apotek-sehat" />
          </label>
          <label className="text-sm font-medium">Kota
            <input className="input mt-1 w-full" value={city} onChange={(event) => setCity(event.target.value)} />
          </label>
          <label className="text-sm font-medium">Nomor telepon
            <input className="input mt-1 w-full" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </label>
          {createError && <p role="alert" className="md:col-span-2 text-sm text-danger-600">{createError}</p>}
          <div className="md:col-span-2 flex justify-end">
            <button className="btn-primary" disabled={creating}>{creating ? "Menyimpan…" : "Buat apotek"}</button>
          </div>
        </form>
      )}

      {/* Filter bar */}
      <div className="card p-3 flex flex-wrap gap-2 items-center">
        <input
          className="input flex-1 min-w-[200px]"
          placeholder="🔎 Cari nama / slug / kota…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input w-auto" value={planFilter} onChange={(e) => setPlanFilter(e.target.value as any)}>
          <option value="ALL">Semua Plan</option>
          <option value="STARTER">🌱 Starter</option>
          <option value="PRO">⭐ Pro</option>
          <option value="ENTERPRISE">💎 Enterprise</option>
        </select>
        <select className="input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
          <option value="ALL">Semua Status</option>
          <option value="ACTIVE">Active</option>
          <option value="TRIAL">Trial</option>
          <option value="EXPIRED">Expired</option>
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead className="bg-surface-50 text-left text-xs uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-4 py-3">Apotek</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Marketplace</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-ink-400">
                  Tidak ada tenant yang sesuai filter.
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr key={t.id} className="border-t border-surface-100 hover:bg-surface-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl grid place-items-center text-xl shrink-0 bg-brand-50">🏥</div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{t.name}</div>
                        <div className="text-[11px] text-ink-500 font-mono truncate">/{t.slug} · {t.city ?? "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <PlanBadge plan={t.plan} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-xs">{t.marketplaceEnabled ? "Aktif" : "Nonaktif"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="text-xs text-brand-600 font-semibold hover:underline"
                      onClick={() => { enterTenant(t.id); nav("/app"); }}
                    >
                      Masuk ke apotek →
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}

function PlanBadge({ plan }: { plan?: string }) {
  if (!plan || plan === "—") return <span className="text-ink-300 text-xs">—</span>;
  const map: Record<string, string> = {
    STARTER: "bg-brand-100 text-brand-700",
    PRO: "bg-accent-100 text-accent-700",
    ENTERPRISE: "bg-gradient-to-r from-warn-200 to-brand-200 text-brand-800",
  };
  const icons: Record<string, string> = { STARTER: "🌱", PRO: "⭐", ENTERPRISE: "💎" };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${map[plan] ?? "bg-surface-100"}`}>
      {icons[plan] ?? ""} {plan}
    </span>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (!status || status === "—") return <span className="text-ink-300 text-xs">—</span>;
  const map: Record<string, string> = {
    ACTIVE: "bg-accent-100 text-accent-700",
    TRIAL: "bg-warn-100 text-warn-700",
    EXPIRED: "bg-danger-100 text-danger-700",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${map[status] ?? "bg-surface-100"}`}>
      ● {status}
    </span>
  );
}
