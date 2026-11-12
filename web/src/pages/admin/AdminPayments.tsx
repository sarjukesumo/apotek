import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query, limit } from "firebase/firestore";
import { db } from "../../lib/firebase";

const fmtRp = (n: number) => "Rp " + n.toLocaleString("id-ID");
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("id-ID");

type PaymentType = "SUBSCRIPTION" | "MARKETPLACE" | "PAYOUT";
type PaymentStatus = "SUCCESS" | "PENDING" | "FAILED" | "REFUNDED";

interface UnifiedPayment {
  id: string;
  midtransOrderId: string;
  type: PaymentType;
  amount: number;
  status: PaymentStatus;
  tenantId?: string;
  tenantName?: string;
  customer?: string;
  method?: string;
  fee?: number;
  net?: number;
  createdAtISO: string;
}

export function AdminPayments() {
  const [realPayments, setRealPayments] = useState<any[]>([]);
  const [typeFilter, setTypeFilter] = useState<"ALL" | PaymentType>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | PaymentStatus>("ALL");
  const [tenantFilter, setTenantFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    getDocs(query(collection(db, "payments"), orderBy("createdAt", "desc"), limit(50)))
      .then((s) => setRealPayments(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))))
      .catch(() => setRealPayments([]));
  }, []);

  const allPayments: UnifiedPayment[] = useMemo(() => {
    return realPayments.map((r) => ({
      id: r.id,
      midtransOrderId: r.midtransOrderId ?? r.id,
      type: (r.type as PaymentType) ?? "MARKETPLACE",
      amount: Number(r.amount ?? 0),
      status: (r.status as PaymentStatus) ?? "PENDING",
      tenantId: r.tenantId,
      tenantName: r.tenantName,
      method: r.method,
      createdAtISO: r.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
    }));
  }, [realPayments]);

  const filtered = useMemo(() => {
    return allPayments.filter((p) => {
      if (typeFilter !== "ALL" && p.type !== typeFilter) return false;
      if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
      if (tenantFilter !== "ALL" && p.tenantId !== tenantFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (p.midtransOrderId + " " + (p.tenantName ?? "") + " " + (p.customer ?? "")).toLowerCase().includes(q);
      }
      return true;
    });
  }, [allPayments, typeFilter, statusFilter, tenantFilter, search]);

  // Stats
  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const isToday = (iso: string) => iso.slice(0, 10) === today;
    const success = (x: UnifiedPayment) => x.status === "SUCCESS";

    return {
      todaySubscription: allPayments.filter((p) => isToday(p.createdAtISO) && p.type === "SUBSCRIPTION" && success(p)).reduce((s, p) => s + p.amount, 0),
      todayMarketplace: allPayments.filter((p) => isToday(p.createdAtISO) && p.type === "MARKETPLACE" && success(p)).reduce((s, p) => s + p.amount, 0),
      todayFee: allPayments.filter((p) => isToday(p.createdAtISO) && p.type === "MARKETPLACE" && success(p)).reduce((s, p) => s + (p.fee ?? 0), 0),
      pendingPayout: allPayments.filter((p) => p.type === "PAYOUT" && p.status === "PENDING").reduce((s, p) => s + p.amount, 0),
      total: allPayments.length,
      pending: allPayments.filter((p) => p.status === "PENDING").length,
      failed: allPayments.filter((p) => p.status === "FAILED").length,
    };
  }, [allPayments]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">💳 Pembayaran & Payout</h1>
        <p className="text-sm text-ink-500">
          Subscription billing tenant + transaksi marketplace + payout IRIS ke rekening apotek.
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI title="Subscription Hari Ini" value={fmtRp(stats.todaySubscription)} subtitle="dari MRR tenant" color="from-brand-500 to-accent-500" />
        <KPI title="Marketplace Hari Ini" value={fmtRp(stats.todayMarketplace)} subtitle={`Fee platform ${fmtRp(stats.todayFee)}`} color="from-accent-500 to-brand-500" />
        <KPI title="Payout Pending" value={fmtRp(stats.pendingPayout)} subtitle="Menunggu IRIS proses" color="from-warn-500 to-accent-500" />
        <KPI title="Total Transaksi" value={String(stats.total)} subtitle={`${stats.pending} pending · ${stats.failed} failed`} color="from-brand-600 to-brand-400" />
      </div>

      {/* Filter bar */}
      <div className="card p-3 flex flex-wrap gap-2 items-center">
        <input
          className="input flex-1 min-w-[200px]"
          placeholder="🔎 Cari Order ID / tenant / customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input w-auto" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)}>
          <option value="ALL">Semua Tipe</option>
          <option value="SUBSCRIPTION">📅 Subscription</option>
          <option value="MARKETPLACE">🛍 Marketplace</option>
          <option value="PAYOUT">🏦 Payout IRIS</option>
        </select>
        <select className="input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
          <option value="ALL">Semua Status</option>
          <option value="SUCCESS">Success</option>
          <option value="PENDING">Pending</option>
          <option value="FAILED">Failed</option>
          <option value="REFUNDED">Refunded</option>
        </select>
        <select className="input w-auto" value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)}>
          <option value="ALL">Semua Apotek</option>
          {[...new Map(allPayments.filter((payment) => payment.tenantId).map((payment) => [payment.tenantId, payment.tenantName || payment.tenantId])).entries()].map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead className="bg-surface-50 text-left text-xs uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3">Order ID</th>
              <th className="px-4 py-3">Tipe</th>
              <th className="px-4 py-3">Apotek / Pihak</th>
              <th className="px-4 py-3">Metode</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Fee</th>
              <th className="px-4 py-3 text-right">Net</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-ink-400">
                  Tidak ada transaksi.
                </td>
              </tr>
            ) : (
              filtered.slice(0, 200).map((p) => (
                <tr key={p.id} className="border-t border-surface-100 hover:bg-surface-50/50">
                  <td className="px-4 py-2.5 text-xs text-ink-600">{fmtDateTime(p.createdAtISO)}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-mono text-xs">{p.midtransOrderId}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <TypeBadge type={p.type} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-xs">{p.tenantName ?? "—"}</div>
                    {p.customer && <div className="text-[11px] text-ink-500">{p.customer}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-xs">{p.method ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{fmtRp(p.amount)}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-warn-700">
                    {p.fee ? `−${fmtRp(p.fee)}` : <span className="text-ink-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-accent-700 font-medium">
                    {p.net !== undefined ? fmtRp(p.net) : <span className="text-ink-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={p.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-ink-400">
        💡 Menampilkan max 200 transaksi terakhir. Subscription = billing bulanan tenant. Marketplace = pembelian customer.
        Payout = pencairan dana ke rekening apotek via Midtrans IRIS (mingguan).
      </p>
    </div>
  );
}

function KPI({ title, value, subtitle, color }: { title: string; value: string; subtitle?: string; color: string }) {
  return (
    <div className={`card p-4 bg-gradient-to-br ${color} text-white border-0`}>
      <div className="text-[11px] uppercase tracking-wider opacity-80">{title}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
      {subtitle && <div className="text-[11px] opacity-80 mt-0.5">{subtitle}</div>}
    </div>
  );
}

function TypeBadge({ type }: { type: PaymentType }) {
  const map: Record<PaymentType, { c: string; i: string }> = {
    SUBSCRIPTION: { c: "bg-brand-100 text-brand-700", i: "📅" },
    MARKETPLACE:  { c: "bg-accent-100 text-accent-700", i: "🛍" },
    PAYOUT:       { c: "bg-warn-100 text-warn-700", i: "🏦" },
  };
  const m = map[type];
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${m.c}`}>{m.i} {type}</span>;
}

function StatusBadge({ status }: { status: PaymentStatus }) {
  const map: Record<PaymentStatus, string> = {
    SUCCESS:  "bg-accent-100 text-accent-700",
    PENDING:  "bg-warn-100 text-warn-700",
    FAILED:   "bg-danger-100 text-danger-700",
    REFUNDED: "bg-surface-200 text-ink-600",
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${map[status]}`}>● {status}</span>;
}
