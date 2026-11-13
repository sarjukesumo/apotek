import { lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { RouteContent } from "./components/RouteContent";

const Login = lazy(() => import("./pages/Login").then((module) => ({ default: module.Login })));
const AdminShell = lazy(() => import("./pages/admin/AdminShell").then((module) => ({ default: module.AdminShell })));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard").then((module) => ({ default: module.AdminDashboard })));
const AdminConfig = lazy(() => import("./pages/admin/AdminConfig").then((module) => ({ default: module.AdminConfig })));
const AdminTenants = lazy(() => import("./pages/admin/AdminTenants").then((module) => ({ default: module.AdminTenants })));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers").then((module) => ({ default: module.AdminUsers })));
const TenantShell = lazy(() => import("./pages/app/TenantShell").then((module) => ({ default: module.TenantShell })));
const PharmacyDashboard = lazy(() => import("./pages/app/PharmacyDashboard").then((module) => ({ default: module.PharmacyDashboard })));
const UserGuide = lazy(() => import("./pages/app/UserGuide").then((module) => ({ default: module.UserGuide })));
const POS = lazy(() => import("./pages/app/POS").then((module) => ({ default: module.POS })));
const Inventory = lazy(() => import("./pages/app/Inventory").then((module) => ({ default: module.Inventory })));
const OrdersStaff = lazy(() => import("./pages/app/OrdersStaff").then((module) => ({ default: module.OrdersStaff })));
const PharmacySettings = lazy(() => import("./pages/app/PharmacySettings").then((module) => ({ default: module.PharmacySettings })));
const TenantAccess = lazy(() => import("./pages/app/TenantAccess").then((module) => ({ default: module.TenantAccess })));
const PrinterSettings = lazy(() => import("./pages/app/PrinterSettings").then((module) => ({ default: module.PrinterSettings })));
const PharmacyFinance = lazy(() => import("./pages/app/PharmacyFinance").then((module) => ({ default: module.PharmacyFinance })));
const PharmacyReports = lazy(() => import("./pages/app/PharmacyReports").then((module) => ({ default: module.PharmacyReports })));
const BusinessContacts = lazy(() => import("./pages/app/BusinessContacts").then((module) => ({ default: module.BusinessContacts })));
const LiveSupplierReturns = lazy(() => import("./pages/app/LiveSupplierReturns").then((module) => ({ default: module.LiveSupplierReturns })));
const OrderStatus = lazy(() => import("./pages/marketplace/OrderStatus").then((module) => ({ default: module.OrderStatus })));

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
    <RouteContent>
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
    </RouteContent>
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
