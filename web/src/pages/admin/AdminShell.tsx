import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../lib/auth";

const platformItems = [
  { to: "/admin", label: "📊 Dashboard", end: true },
  { to: "/admin/tenants", label: "🏢 Tenants" },
  { to: "/admin/users", label: "👥 Pengguna & Akses" },
];

const configItems = [
  { to: "/admin/config/telegram", label: "✈️ Telegram" },
];

const marketplaceItems = [
  { to: "/marketplace", label: "🛍️ Marketplace Publik" },
];

function Section({ title, items }: { title: string; items: { to: string; label: string; end?: boolean }[] }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-500 px-3 mb-1.5">{title}</div>
      <nav className="flex flex-col gap-0.5">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={(it as any).end}
            className={({ isActive }) =>
              `px-3 py-2 rounded-xl text-sm ${isActive ? "bg-brand-50 text-brand-700 font-medium" : "hover:bg-surface-50"}`
            }
          >
            {it.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function AdminShell() {
  const signOut = useAuth((s) => s.signOut);
  return (
    <div className="min-h-screen grid grid-cols-[260px_1fr]">
      <aside className="bg-white border-r border-surface-100 p-4 flex flex-col overflow-y-auto">
        <div className="text-brand-600 font-bold text-lg px-2 py-3">Batam Farma · Admin</div>
        <Section title="Konfigurasi" items={configItems} />
        <Section title="Publik" items={marketplaceItems} />

        <button className="btn-secondary mt-auto" onClick={() => signOut()}>Keluar</button>
      </aside>
      <main className="p-6 overflow-auto min-w-0 max-w-full"><Outlet /></main>
    </div>
  );
}
