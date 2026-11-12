// Audit Log (read-only, filterable) + Editor Matriks Permission per Role.

import { useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import { useDemoStore, type DemoUserRole, type DemoPermission } from "../../lib/demoStore";

const ALL_PERMISSIONS: { key: DemoPermission; label: string; group: string }[] = [
  { key: "POS_USE", label: "Gunakan POS", group: "POS" },
  { key: "POS_VOID", label: "Void Transaksi POS", group: "POS" },
  { key: "PRODUCT_EDIT", label: "Edit Produk", group: "Produk" },
  { key: "PRICE_EDIT", label: "Edit Harga", group: "Produk" },
  { key: "BATCH_EDIT", label: "Edit Batch/Stok", group: "Produk" },
  { key: "PURCHASE_CREATE", label: "Buat PO", group: "Pembelian" },
  { key: "PURCHASE_RECEIVE", label: "Terima Barang (GRN)", group: "Pembelian" },
  { key: "RETURN_MANAGE", label: "Kelola Retur", group: "Pembelian" },
  { key: "DISPOSAL_APPROVE", label: "Approve Pemusnahan", group: "Compliance" },
  { key: "OPNAME_POST", label: "Posting Stock Opname", group: "Compliance" },
  { key: "RX_DISPENSE", label: "Dispensing Resep", group: "Klinis" },
  { key: "RX_COUNSEL", label: "Konseling Pasien", group: "Klinis" },
  { key: "PAYABLE_PAY", label: "Bayar Hutang", group: "Keuangan" },
  { key: "RECEIVABLE_RECEIVE", label: "Terima Piutang", group: "Keuangan" },
  { key: "CLAIM_SUBMIT", label: "Ajukan Klaim Asuransi", group: "Keuangan" },
  { key: "MEMBER_MANAGE", label: "Kelola Member", group: "Marketing" },
  { key: "PROMO_MANAGE", label: "Kelola Promo", group: "Marketing" },
  { key: "REPORT_VIEW", label: "Lihat Laporan", group: "Laporan" },
  { key: "REPORT_EXPORT", label: "Export Laporan", group: "Laporan" },
  { key: "USER_MANAGE", label: "Kelola User", group: "Sistem" },
  { key: "ROLE_MANAGE", label: "Kelola Role", group: "Sistem" },
  { key: "AUDIT_VIEW", label: "Lihat Audit Log", group: "Sistem" },
  { key: "SETTINGS_EDIT", label: "Edit Pengaturan", group: "Sistem" },
];
const ROLES: DemoUserRole[] = ["OWNER", "APOTEKER", "KASIR", "STAFF"];
const ROLE_LABEL: Record<DemoUserRole, string> = { OWNER: "Owner/Admin", APOTEKER: "Apoteker", KASIR: "Kasir", STAFF: "Staff Gudang" };

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function AuditPermissions() {
  const tenantId = useAuth((s) => s.claims?.tenantId) ?? "";
  const auditLogs = useDemoStore((s) => s.auditLogs.filter((l) => l.tenantId === tenantId));
  const rolePermissions = useDemoStore((s) => s.rolePermissions);
  const setRolePermissions = useDemoStore((s) => s.setRolePermissions);

  const [tab, setTab] = useState<"audit" | "perms">("audit");
  const [filterRole, setFilterRole] = useState<DemoUserRole | "ALL">("ALL");
  const [filterAction, setFilterAction] = useState("");
  const [filterDate, setFilterDate] = useState("");

  const filtered = useMemo(() => auditLogs.filter((l) =>
    (filterRole === "ALL" || l.userRole === filterRole) &&
    (!filterAction || l.action.toLowerCase().includes(filterAction.toLowerCase())) &&
    (!filterDate || l.createdAtISO.startsWith(filterDate))
  ).sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO)), [auditLogs, filterRole, filterAction, filterDate]);

  const groups = useMemo(() => {
    const g: Record<string, typeof ALL_PERMISSIONS> = {};
    for (const p of ALL_PERMISSIONS) (g[p.group] ||= []).push(p);
    return g;
  }, []);

  const toggle = (role: DemoUserRole, perm: DemoPermission) => {
    const current = rolePermissions[role] ?? [];
    const next = current.includes(perm) ? current.filter((p) => p !== perm) : [...current, perm];
    setRolePermissions(role, next);
  };

  const exportCSV = () => {
    const rows = [["Waktu", "User", "Role", "Aksi", "Target", "Detail", "IP"], ...filtered.map((l) => [fmtDateTime(l.createdAtISO), l.userName, l.userRole, l.action, l.target, l.details ?? "", l.ipAddress ?? ""])];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">🛡 Audit &amp; Permission</h1>
        <p className="text-ink-500 text-sm mt-0.5">Jejak audit semua aksi penting + matriks hak akses per role.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="card !p-4"><div className="text-xs text-ink-500">Total Aksi Tercatat</div><div className="text-2xl font-bold mt-1">{auditLogs.length}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Role Aktif</div><div className="text-2xl font-bold mt-1">{ROLES.length}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Permission Tersedia</div><div className="text-2xl font-bold mt-1">{ALL_PERMISSIONS.length}</div></div>
      </div>

      <div className="flex gap-1 bg-surface-100 rounded-lg p-1 w-fit">
        {[{ k: "audit", l: `📜 Audit Log (${auditLogs.length})` }, { k: "perms", l: "🔐 Matriks Permission" }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k as any)} className={`px-3 py-1.5 text-sm rounded-md ${tab === t.k ? "bg-white text-brand-700 font-semibold shadow-sm" : "text-ink-500"}`}>{t.l}</button>
        ))}
      </div>

      {tab === "audit" && (
        <div className="card">
          <div className="flex flex-wrap gap-2 items-end mb-3">
            <div><label className="text-xs text-ink-500">Role</label><select className="input !w-36" value={filterRole} onChange={(e) => setFilterRole(e.target.value as any)}><option value="ALL">Semua</option>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></div>
            <div><label className="text-xs text-ink-500">Aksi mengandung</label><input className="input !w-40" value={filterAction} onChange={(e) => setFilterAction(e.target.value)} placeholder="POS_VOID, BATCH..." /></div>
            <div><label className="text-xs text-ink-500">Tanggal</label><input type="date" className="input !w-40" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} /></div>
            <button onClick={() => { setFilterRole("ALL"); setFilterAction(""); setFilterDate(""); }} className="btn-secondary text-xs">Reset</button>
            <div className="ml-auto"><button onClick={exportCSV} className="btn-primary text-xs">📥 Export CSV</button></div>
          </div>
          {filtered.length === 0 && <div className="text-center py-10 text-ink-500"><div className="text-5xl mb-2">📜</div>Belum ada audit log yang cocok dengan filter.<div className="text-xs mt-2 text-ink-400">Audit log otomatis terisi saat aksi sensitif (void POS, edit harga, posting opname, dll).</div></div>}
          {filtered.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-left text-xs text-ink-500"><tr><th className="p-2">Waktu</th><th className="p-2">User</th><th className="p-2">Role</th><th className="p-2">Aksi</th><th className="p-2">Target</th><th className="p-2">Detail</th></tr></thead>
              <tbody className="divide-y divide-surface-100">
                {filtered.slice(0, 200).map((l) => (
                  <tr key={l.id}>
                    <td className="p-2 text-xs whitespace-nowrap">{fmtDateTime(l.createdAtISO)}</td>
                    <td className="p-2 text-xs">{l.userName}</td>
                    <td className="p-2"><span className="badge text-[10px] bg-brand-100 text-brand-700">{l.userRole}</span></td>
                    <td className="p-2 font-mono text-[11px]">{l.action}</td>
                    <td className="p-2 text-xs text-ink-600">{l.target}</td>
                    <td className="p-2 text-xs text-ink-500">{l.details ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {filtered.length > 200 && <div className="text-center text-xs text-ink-400 mt-2">Menampilkan 200 baris pertama dari {filtered.length} log. Gunakan filter atau export CSV.</div>}
        </div>
      )}

      {tab === "perms" && (
        <div className="card overflow-x-auto">
          <div className="text-xs text-ink-500 mb-3">Centang untuk memberi izin. Perubahan langsung tersimpan.</div>
          <table className="w-full text-sm border-collapse">
            <thead className="bg-surface-50">
              <tr><th className="p-2 text-left text-xs text-ink-500 sticky left-0 bg-surface-50">Permission</th>{ROLES.map((r) => <th key={r} className="p-2 text-center text-xs">{ROLE_LABEL[r]}</th>)}</tr>
            </thead>
            <tbody>
              {Object.entries(groups).map(([group, perms]) => (
                <>
                  <tr key={group} className="bg-brand-50/50"><td colSpan={ROLES.length + 1} className="p-2 font-semibold text-xs text-brand-700">{group}</td></tr>
                  {perms.map((p) => (
                    <tr key={p.key} className="border-b border-surface-100">
                      <td className="p-2 sticky left-0 bg-white"><div className="text-xs">{p.label}</div><div className="text-[10px] font-mono text-ink-400">{p.key}</div></td>
                      {ROLES.map((r) => (
                        <td key={r} className="p-2 text-center">
                          <input type="checkbox" className="scale-125" checked={(rolePermissions[r] ?? []).includes(p.key)} onChange={() => toggle(r, p.key)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
