import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { Login } from "./pages/Login";
import { AdminShell } from "./pages/admin/AdminShell";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { AdminConfig } from "./pages/admin/AdminConfig";
import { AdminTenants } from "./pages/admin/AdminTenants";
import { AdminUsers } from "./pages/admin/AdminUsers";
import { TenantShell } from "./pages/app/TenantShell";
import { PharmacyDashboard } from "./pages/app/PharmacyDashboard";
import { UserGuide } from "./pages/app/UserGuide";
import { POS } from "./pages/app/POS";
import { Inventory } from "./pages/app/Inventory";
import { OrdersStaff } from "./pages/app/OrdersStaff";
import { PharmacySettings } from "./pages/app/PharmacySettings";
import { TenantAccess } from "./pages/app/TenantAccess";
import { PrinterSettings } from "./pages/app/PrinterSettings";
import { PharmacyFinance } from "./pages/app/PharmacyFinance";
import { PharmacyReports } from "./pages/app/PharmacyReports";
import { BusinessContacts } from "./pages/app/BusinessContacts";
import { LiveSupplierReturns } from "./pages/app/LiveSupplierReturns";
import { OrderStatus } from "./pages/marketplace/OrderStatus";

function Guard({ children, predicate, redirect = "/login" }: { children: JSX.Element; predicate: () => boolean; redirect?: string }) {
  const ready = useAuth((s) => s.ready);
  if (!ready) return <div className="p-10">Loading…</div>;
  return predicate() ? children : <Navigate to={redirect} replace />;
}

function RoleGuard({ children, allowedRoles }: { children: JSX.Element; allowedRoles: string[] }) {
  const role = useAuth((state) => state.claims?.role);
  return allowedRoles.includes(role || "") ? children : <Navigate to="/app" replace />;
}

function OwnerOnly({ children }: { children: JSX.Element }) {
  return <RoleGuard allowedRoles={["OWNER"]}>{children}</RoleGuard>;
}

function OwnerOrCashier({ children }: { children: JSX.Element }) {
  return <RoleGuard allowedRoles={["OWNER", "CASHIER"]}>{children}</RoleGuard>;
}

function TenantMemberOnly({ children }: { children: JSX.Element }) {
  return <RoleGuard allowedRoles={["OWNER", "STAFF", "CASHIER"]}>{children}</RoleGuard>;
}

function OwnerOrStaff({ children }: { children: JSX.Element }) {
  return <RoleGuard allowedRoles={["OWNER", "STAFF"]}>{children}</RoleGuard>;
}

export default function App() {
  const isAdmin = useAuth((s) => s.isAdmin);
  const claims = useAuth((s) => s.claims);
  const user = useAuth((s) => s.user);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Navigate to="/login" replace />} />

      {/* Admin */}
      <Route
        path="/admin"
        element={<Guard predicate={() => isAdmin}><AdminShell /></Guard>}
      >
        <Route index element={<AdminDashboard />} />
        <Route path="tenants" element={<AdminTenants />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="config/telegram" element={<AdminConfig />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>

      {/* Tenant */}
      <Route
        path="/app"
        element={<Guard predicate={() => !!claims?.tenantId}><TenantShell /></Guard>}
      >
        <Route index element={<PharmacyDashboard />} />
        <Route path="help" element={<UserGuide />} />
        <Route path="pos" element={<OwnerOrCashier><POS /></OwnerOrCashier>} />
        <Route path="inventory" element={<OwnerOrStaff><Inventory /></OwnerOrStaff>} />
        <Route path="orders" element={<OrdersStaff />} />
        <Route path="hardware" element={<TenantMemberOnly><PrinterSettings /></TenantMemberOnly>} />
        <Route path="settings" element={<OwnerOnly><PharmacySettings /></OwnerOnly>} />
        <Route path="users" element={<OwnerOnly><TenantAccess /></OwnerOnly>} />
        <Route path="accounting" element={<OwnerOnly><PharmacyFinance /></OwnerOnly>} />
        <Route path="reports" element={<OwnerOnly><PharmacyReports /></OwnerOnly>} />
        <Route path="suppliers" element={<OwnerOrStaff><BusinessContacts kind="suppliers" /></OwnerOrStaff>} />
        <Route path="customers" element={<OwnerOrStaff><BusinessContacts kind="customers" /></OwnerOrStaff>} />
        <Route path="returns" element={<OwnerOrStaff><LiveSupplierReturns /></OwnerOrStaff>} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>

      <Route path="/demo/*" element={<Navigate to="/" replace />} />

      {/* Marketplace */}
      <Route path="/marketplace" element={<OnlinePaymentsPaused />} />
      <Route path="/store/:tenantSlug" element={<Navigate to="/marketplace" replace />} />
      <Route path="/store/:tenantSlug/p/:productId" element={<OnlinePaymentsPaused />} />
      <Route path="/store/:tenantSlug/dokter" element={<Navigate to="/marketplace" replace />} />
      <Route path="/checkout" element={<OnlinePaymentsPaused />} />
      <Route
        path="/order/:orderId"
        element={<Guard predicate={() => !!user} redirect="/login">
          <OrderStatus />
        </Guard>}
      />

      <Route path="*" element={<div className="p-10">404</div>} />
    </Routes>
  );
}

function OnlinePaymentsPaused() {
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="card max-w-md text-center">
        <h1 className="text-xl font-bold">Marketplace sementara dinonaktifkan</h1>
        <p className="text-sm text-ink-500 mt-2">Katalog dan pembelian online belum tersedia. Aplikasi difokuskan untuk operasional internal apotek.</p>
        <a href="/app" className="btn-primary inline-flex mt-4">Masuk aplikasi apotek</a>
      </div>
    </div>
  );
}
