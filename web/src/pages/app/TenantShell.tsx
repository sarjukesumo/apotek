import { NavLink, Outlet, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "../../lib/auth";
import { getQueuedPosSales } from "../../lib/offlinePos";
import { syncQueuedPosSales } from "../../lib/posSync";
import { db } from "../../lib/firebase";
import { subscribeTenantInventory } from "../../lib/inventoryRepository";

type NavItem = { to: string; label: string; end?: boolean; emoji?: string };
const groups: { title: string; items: NavItem[] }[] = [
  { title: "Utama", items: [
    { to: "/app", label: "Dashboard", end: true, emoji: "🏠" },
  ]},
  { title: "Operasional", items: [
    { to: "/app/pos", label: "POS", emoji: "🛒" },
    { to: "/app/inventory", label: "Inventory", emoji: "📦" },
    { to: "/app/orders", label: "Pesanan Online", emoji: "🛍" },
    { to: "/app/returns", label: "Retur Pemasok", emoji: "↩️" },
  ]},
  { title: "Keuangan", items: [
    { to: "/app/accounting", label: "Keuangan", emoji: "💰" },
  ]},
  { title: "Laporan", items: [
    { to: "/app/reports", label: "Laporan Apotek", emoji: "📊" },
  ]},
  { title: "Apotek", items: [
    { to: "/app/users", label: "Pengguna & Akses", emoji: "👥" },
    { to: "/app/suppliers", label: "Pemasok", emoji: "🏭" },
    { to: "/app/customers", label: "Pelanggan", emoji: "👤" },
    { to: "/app/settings", label: "Profil & Nota", emoji: "⚙️" },
    { to: "/app/hardware", label: "Printer & Perangkat", emoji: "🖨️" },
  ]},
  { title: "Bantuan", items: [
    { to: "/app/help", label: "Petunjuk", emoji: "❔" },
  ]},
];
const flatItems = groups.flatMap((g) => g.items);
const staffGroups: { title: string; items: NavItem[] }[] = [
  { title: "Utama", items: [
    { to: "/app", label: "Dashboard", end: true, emoji: "🏠" },
  ]},
  { title: "Operasional", items: [
    { to: "/app/inventory", label: "Inventory", emoji: "📦" },
    { to: "/app/orders", label: "Pesanan Online", emoji: "🛍" },
    { to: "/app/returns", label: "Retur Pemasok", emoji: "↩️" },
    { to: "/app/suppliers", label: "Pemasok", emoji: "🏭" },
    { to: "/app/customers", label: "Pelanggan", emoji: "👤" },
    { to: "/app/hardware", label: "Printer & Perangkat", emoji: "🖨️" },
  ]},
  { title: "Bantuan", items: [
    { to: "/app/help", label: "Petunjuk", emoji: "❔" },
  ]},
];
const staffFlatItems = staffGroups.flatMap((group) => group.items);
const cashierGroups: { title: string; items: NavItem[] }[] = [
  { title: "Utama", items: [
    { to: "/app", label: "Dashboard", end: true, emoji: "🏠" },
  ]},
  { title: "Operasional", items: [
    { to: "/app/pos", label: "POS", emoji: "🛒" },
    { to: "/app/orders", label: "Pesanan", emoji: "🛍" },
    { to: "/app/hardware", label: "Printer & Perangkat", emoji: "🖨️" },
  ]},
  { title: "Bantuan", items: [
    { to: "/app/help", label: "Petunjuk", emoji: "❔" },
  ]},
];
const cashierFlatItems = cashierGroups.flatMap((group) => group.items);

export function TenantShell() {
  const signOut = useAuth((s) => s.signOut);
  const claims = useAuth((s) => s.claims);
  const user = useAuth((s) => s.user);
  const isAdmin = useAuth((s) => s.isAdmin);
  const exitTenant = useAuth((s) => s.exitTenant);
  const [pharmacyName, setPharmacyName] = useState("D’Farma");
  const [inventoryError, setInventoryError] = useState("");
  const isStaff = claims?.role === "STAFF";
  const isCashier = claims?.role === "CASHIER";
  const visibleGroups = isStaff ? staffGroups : isCashier ? cashierGroups : groups;
  const visibleFlatItems = isStaff ? staffFlatItems : isCashier ? cashierFlatItems : visibleGroups.flatMap((group) => group.items);

  useEffect(() => {
    if (!claims?.tenantId || !user?.uid) return;
    setInventoryError("");
    return subscribeTenantInventory(claims.tenantId, claims.role === "OWNER",
      () => setInventoryError(""),
      (error) => {
        console.error("Live inventory could not be synchronized.", error);
        setInventoryError("Sinkronisasi stok gagal. Jangan lanjutkan transaksi; periksa koneksi/akses lalu buka kembali aplikasi.");
      });
  }, [claims?.tenantId, claims?.role, user?.uid]);

  useEffect(() => {
    const tenantId = claims?.tenantId;
    setPharmacyName("D’Farma");
    if (!tenantId) return;

    return onSnapshot(doc(db, "tenants", tenantId), (snapshot) => {
      if (!snapshot.exists()) {
        setPharmacyName("D’Farma");
        return;
      }
      const data = snapshot.data();
      const configuredName = typeof data.profile?.name === "string" ? data.profile.name.trim() : "";
      const legacyName = typeof data.name === "string" ? data.name.trim() : "";
      setPharmacyName(configuredName || legacyName || "D’Farma");
    }, (error) => {
      console.error("Pharmacy name could not be loaded.", error);
    });
  }, [claims?.tenantId]);

  useEffect(() => {
    document.title = pharmacyName;
    return () => { document.title = "D’Farma"; };
  }, [pharmacyName]);

  useEffect(() => {
    const tenantId = claims?.tenantId;
    if (!tenantId || !user?.uid) return;
    const sync = async () => {
      if (!navigator.onLine) return;
      try {
        const pending = await getQueuedPosSales(tenantId);
        if (!pending.length) return;
        await syncQueuedPosSales(tenantId, user.uid);
        window.dispatchEvent(new Event("pos-offline-sync-complete"));
      } catch (error) {
        console.error("Offline POS sales could not be synchronized from the app shell.", error);
      }
    };
    window.addEventListener("online", sync);
    void sync();
    return () => window.removeEventListener("online", sync);
  }, [claims?.tenantId, user?.uid]);

  async function handleSignOut() {
    try {
      if (claims?.tenantId) {
        const pending = await getQueuedPosSales(claims.tenantId);
        if (pending.length && !window.confirm(
          "Masih ada transaksi offline di PC ini. Data tetap tersimpan, tetapi hanya akun kasir pembuat transaksi yang dapat menyinkronkannya. Tetap keluar?",
        )) return;
      }
      await signOut();
    } catch (error) {
      console.error("Could not verify offline transactions before sign-out.", error);
      alert("Status transaksi lokal belum dapat diperiksa. Coba lagi sebelum keluar.");
    }
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 bg-white border-b border-surface-100 px-4 py-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-brand-600 font-bold truncate">{pharmacyName}</div>
          <div className="text-[10px] text-ink-500 truncate">{claims?.role === "OWNER" ? "Owner" : claims?.role === "CASHIER" ? "Kasir" : "Staf"} · {claims?.tenantId}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (
            <Link to="/admin" onClick={() => exitTenant()} className="text-xs bg-warn-50 text-warn-500 border border-warn-200 rounded-md px-2 py-1.5">← Admin</Link>
          )}
          <button className="btn-secondary px-3 py-1.5 text-sm" onClick={() => void handleSignOut()}>Keluar</button>
        </div>
      </header>

      <aside className="bg-white border-r border-surface-100 p-4 md:flex md:flex-col hidden overflow-y-auto max-h-screen">
        <div className="text-brand-600 font-bold text-lg px-2 py-3">{pharmacyName}</div>
        {isAdmin && (
          <Link to="/admin" onClick={() => exitTenant()} className="text-xs bg-warn-50 text-warn-500 border border-warn-200 rounded-md px-2 py-1.5 mb-2 hover:bg-warn-100 transition-colors">← Kembali ke Admin</Link>
        )}
        <div className="text-xs text-ink-500 px-2 mb-4">{claims?.role === "OWNER" ? "Owner" : claims?.role === "CASHIER" ? "Kasir" : "Staf"} · {claims?.tenantId}</div>
        <nav className="flex flex-col gap-3">
          {visibleGroups.map((g) => (
            <div key={g.title}>
              <div className="text-[10px] uppercase tracking-wider text-ink-400 px-3 mb-1 font-semibold">{g.title}</div>
              <div className="flex flex-col gap-0.5">
                {g.items.map((it) => (
                  <NavLink key={it.to} to={it.to} end={it.end}
                    className={({ isActive }) =>
                      `px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 ${isActive ? "bg-brand-50 text-brand-700 font-medium" : "hover:bg-surface-50 text-ink-700"}`
                    }>
                    {it.emoji && <span>{it.emoji}</span>}
                    <span>{it.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <button className="btn-secondary mt-4" onClick={() => void handleSignOut()}>Keluar</button>
      </aside>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-surface-100 grid z-30"
        style={{ gridTemplateColumns: `repeat(${Math.min(visibleFlatItems.filter((it) => it.to !== "/app/help").length, 5) + 1}, minmax(0, 1fr))` }}
      >
        {visibleFlatItems.filter((it) => it.to !== "/app/help").slice(0, 5).concat({ to: "/app/help", label: "Petunjuk", emoji: "❔" }).map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end}
            className={({ isActive }) => `text-xs text-center py-2 ${isActive ? "text-brand-600 font-medium" : "text-ink-500"}`}>
            <div className="text-base">{it.emoji}</div>
            {it.label}
          </NavLink>
        ))}
      </nav>

      <main className="p-4 md:p-6 pb-20 min-w-0 max-w-full overflow-x-clip">
        {inventoryError && <p role="alert" className="mb-4 text-sm text-danger-600">{inventoryError}</p>}
        <Outlet />
      </main>
    </div>
  );
}
