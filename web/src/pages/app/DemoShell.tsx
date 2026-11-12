import { NavLink, Outlet, Link } from "react-router-dom";

type NavItem = { to: string; label: string; end?: boolean };
const groups: { title: string; items: NavItem[] }[] = [
  { title: "Utama", items: [
    { to: "/demo", label: "🏠 Dashboard", end: true },
    { to: "/demo/pos", label: "🛒 POS" },
    { to: "/demo/inventory", label: "📦 Inventory" },
  ]},
  { title: "Operasional", items: [
    { to: "/demo/purchasing", label: "📋 Pembelian" },
    { to: "/demo/defekta", label: "📓 Defekta & ROP" },
    { to: "/demo/opname", label: "📊 Stock Opname" },
    { to: "/demo/disposal", label: "🗑 Pemusnahan" },
    { to: "/demo/returns", label: "🔄 Retur Supplier" },
    { to: "/demo/branches", label: "🏢 Cabang & Mutasi" },
  ]},
  { title: "Klinis", items: [
    { to: "/demo/prescriptions", label: "💊 Resep & DRP" },
    { to: "/demo/doctor", label: "👨‍⚕️ Dokter" },
    { to: "/demo/telemed", label: "📞 Telemedicine" },
    { to: "/demo/compliance", label: "📑 SIPNAP & Cold-Chain" },
  ]},
  { title: "Keuangan", items: [
    { to: "/demo/accounting", label: "💰 Akuntansi" },
    { to: "/demo/claims", label: "🏥 Asuransi & Klaim" },
  ]},
  { title: "Marketing", items: [
    { to: "/demo/members", label: "⭐ Member & Loyalty" },
    { to: "/demo/promos", label: "🏷 Promo" },
    { to: "/demo/notifications", label: "🔔 Notifikasi" },
  ]},
  { title: "Insight", items: [
    { to: "/demo/ai", label: "🤖 AI Assistant" },
    { to: "/demo/reports", label: "📈 Laporan" },
  ]},
  { title: "Sistem", items: [
    { to: "/demo/users", label: "👥 User" },
    { to: "/demo/audit", label: "🛡 Audit & Permission" },
    { to: "/demo/hardware", label: "⚙ Hardware" },
    { to: "/demo/api", label: "🔌 API & Webhook" },
    { to: "/demo/settings", label: "🔧 Pengaturan" },
  ]},
];
const flatItems = groups.flatMap((g) => g.items);

export function DemoShell() {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[260px_1fr]">
      <aside className="bg-white border-r border-surface-100 p-4 md:flex md:flex-col hidden overflow-y-auto max-h-screen">
        <div className="flex items-center gap-2 px-2 py-3">
          <span className="text-brand-600 font-bold text-lg">Batam Farma</span>
          <span className="text-[10px] font-bold bg-warn-100 text-warn-700 px-2 py-0.5 rounded-full uppercase">Demo</span>
        </div>

        <div className="bg-gradient-to-br from-brand-50 to-accent-50 border border-brand-100 rounded-xl p-3 mb-4">
          <div className="text-[11px] font-bold text-brand-700 uppercase tracking-wide">🎬 Mode Trial</div>
          <div className="text-xs text-ink-600 mt-1 leading-snug">
            Semua data simulasi & tersimpan di browser. Tidak perlu login.
          </div>
          <Link to="/signup" className="btn-primary text-xs h-8 w-full mt-2 grid place-items-center">
            🚀 Daftar Akun Asli
          </Link>
        </div>

        <nav className="flex flex-col gap-3">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="text-[10px] uppercase tracking-wider text-ink-400 px-3 mb-1 font-semibold">{g.title}</div>
              <div className="flex flex-col gap-0.5">
                {g.items.map((it) => (
                  <NavLink key={it.to} to={it.to} end={it.end}
                    className={({ isActive }) =>
                      `px-3 py-1.5 rounded-lg text-sm ${isActive ? "bg-brand-50 text-brand-700 font-medium" : "hover:bg-surface-50 text-ink-700"}`
                    }>{it.label}</NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-4 space-y-2 pt-4">
          <Link to="/" className="btn-secondary text-xs w-full grid place-items-center">
            ← Beranda
          </Link>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden bg-white border-b border-surface-100 px-3 py-2 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <span className="text-brand-600 font-bold">Batam Farma</span>
          <span className="text-[10px] font-bold bg-warn-100 text-warn-700 px-1.5 py-0.5 rounded uppercase">Demo</span>
        </div>
        <Link to="/signup" className="btn-primary text-[11px] h-7 px-2">Daftar</Link>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-surface-100 grid grid-cols-5 z-30">
        {flatItems.slice(0, 5).map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) => `text-[10px] text-center py-2 ${isActive ? "text-brand-600 font-medium" : "text-ink-500"}`}
          >
            {it.label}
          </NavLink>
        ))}
      </nav>

      <main className="p-4 md:p-6 pb-20">
        {/* Demo banner */}
        <div className="mb-4 flex items-center justify-between gap-3 bg-gradient-to-r from-warn-50 via-amber-50 to-brand-50 border border-warn-200 rounded-xl px-4 py-2.5">
          <div className="text-xs text-ink-700 leading-tight">
            <span className="font-bold text-warn-700">🎬 Anda di mode demo.</span>{" "}
            <span className="hidden sm:inline">Semua transaksi simulasi. Data Anda tersimpan lokal di browser ini.</span>
          </div>
          <Link to="/signup" className="btn-primary text-xs h-8 px-3 whitespace-nowrap">
            Daftar Gratis →
          </Link>
        </div>

        <Outlet />
      </main>
    </div>
  );
}
