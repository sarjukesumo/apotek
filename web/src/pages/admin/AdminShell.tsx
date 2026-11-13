import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { RouteContent } from "../../components/RouteContent";

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
  const mobileItems = [
    { to: "/admin", label: "Dashboard", emoji: "📊", end: true },
    { to: "/admin/tenants", label: "Apotek", emoji: "🏢" },
    { to: "/admin/users", label: "Pengguna", emoji: "👥" },
    { to: "/admin/config/telegram", label: "Telegram", emoji: "✈️" },
  ];
  return (
    <div className="min-h-screen md:grid md:grid-cols-[260px_1fr]">
      <aside className="hidden md:flex bg-white border-r border-surface-100 p-4 flex-col overflow-y-auto">
        <div className="text-brand-600 font-bold text-lg px-2 py-3">Batam Farma · Admin</div>
        <Section title="Platform" items={platformItems} />
        <Section title="Konfigurasi" items={configItems} />
        <Section title="Publik" items={marketplaceItems} />

        <button className="btn-secondary mt-auto" onClick={() => signOut()}>Keluar</button>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 bg-white border-b border-surface-100 px-4 py-2.5 flex items-center justify-between gap-2">
        <div className="text-brand-600 font-bold truncate">Batam Farma · Admin</div>
        <button className="btn-secondary px-3 py-1.5 text-sm shrink-0" onClick={() => signOut()}>Keluar</button>
      </header>

      <main className="p-4 md:p-6 pb-20 md:pb-6 overflow-auto min-w-0 max-w-full"><RouteContent><Outlet /></RouteContent></main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-surface-100 grid grid-cols-4 z-30">
        {mobileItems.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end}
            className={({ isActive }) => `text-xs text-center py-2 ${isActive ? "text-brand-600 font-medium" : "text-ink-500"}`}>
            <div className="text-base">{it.emoji}</div>
            {it.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
