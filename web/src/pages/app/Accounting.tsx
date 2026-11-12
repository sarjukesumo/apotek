// Akuntansi sederhana: Buku Kas (ledger), Hutang Supplier, Piutang Pasien/Asuransi, L/R bulanan.

import { useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import { useDemoStore } from "../../lib/demoStore";

const fmtRp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

export function Accounting() {
  const tenantId = useAuth((s) => s.claims?.tenantId) ?? "";
  const ledger = useDemoStore((s) => s.ledger.filter((e) => e.tenantId === tenantId));
  const payables = useDemoStore((s) => s.payables.filter((p) => p.tenantId === tenantId));
  const receivables = useDemoStore((s) => s.receivables.filter((r) => r.tenantId === tenantId));
  const posSales = useDemoStore((s) => (s.posSales ?? []).filter((p) => p.tenantId === tenantId));
  const addLedger = useDemoStore((s) => s.addLedger);
  const payPayable = useDemoStore((s) => s.payPayable);
  const receiveReceivable = useDemoStore((s) => s.receiveReceivable);
  const addReceivable = useDemoStore((s) => s.addReceivable);

  const [tab, setTab] = useState<"ledger" | "ap" | "ar" | "pl" | "gp">("ledger");
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));

  const totals = useMemo(() => {
    const monthLedger = ledger.filter((e) => e.dateISO.startsWith(period));
    const cashIn = monthLedger.filter((e) => e.type === "CASH_IN").reduce((s, e) => s + e.amountRp, 0);
    const cashOut = monthLedger.filter((e) => e.type === "CASH_OUT").reduce((s, e) => s + e.amountRp, 0);
    const apOpen = payables.filter((p) => p.status !== "PAID").reduce((s, p) => s + (p.totalRp - p.paidRp), 0);
    const arOpen = receivables.filter((r) => r.status !== "PAID").reduce((s, r) => s + (r.totalRp - r.paidRp), 0);
    return { cashIn, cashOut, net: cashIn - cashOut, apOpen, arOpen, monthLedger };
  }, [ledger, payables, receivables, period]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">💰 Akuntansi</h1>
        <p className="text-ink-500 text-sm mt-0.5">Buku Kas, Hutang Supplier, Piutang Pasien/Asuransi, dan Laporan L/R bulanan.</p>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <div className="card !p-4 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white"><div className="text-xs opacity-80">Pendapatan ({period})</div><div className="text-xl font-bold mt-1">{fmtRp(totals.cashIn)}</div></div>
        <div className="card !p-4 bg-gradient-to-br from-orange-500 to-orange-600 text-white"><div className="text-xs opacity-80">Pengeluaran</div><div className="text-xl font-bold mt-1">{fmtRp(totals.cashOut)}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Hutang Supplier</div><div className="text-xl font-bold mt-1 text-warn-700">{fmtRp(totals.apOpen)}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Piutang Outstanding</div><div className="text-xl font-bold mt-1 text-brand-700">{fmtRp(totals.arOpen)}</div></div>
      </div>

      <div className="flex gap-1 bg-surface-100 rounded-lg p-1 w-fit">
        {[{ k: "ledger", l: "📒 Buku Kas" }, { k: "ap", l: `🧾 Hutang (${payables.filter((p) => p.status !== "PAID").length})` }, { k: "ar", l: `💳 Piutang (${receivables.filter((r) => r.status !== "PAID").length})` }, { k: "gp", l: "💎 Laba Kotor" }, { k: "pl", l: "📈 L/R Bulanan" }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-3 py-1.5 text-sm rounded-md ${tab === t.k ? "bg-white text-brand-700 font-semibold shadow-sm" : "text-ink-500"}`}>{t.l}</button>
        ))}
      </div>

      {tab === "ledger" && <LedgerTab tenantId={tenantId} entries={ledger} period={period} setPeriod={setPeriod} addLedger={addLedger} />}
      {tab === "ap" && <PayablesTab payables={payables} payPayable={payPayable} />}
      {tab === "ar" && <ReceivablesTab receivables={receivables} receive={receiveReceivable} addAR={addReceivable} tenantId={tenantId} />}
      {tab === "gp" && <GrossProfitTab period={period} setPeriod={setPeriod} sales={posSales} />}
      {tab === "pl" && <PnLTab period={period} setPeriod={setPeriod} entries={totals.monthLedger} cashIn={totals.cashIn} cashOut={totals.cashOut} />}
    </div>
  );
}

function LedgerTab({ tenantId, entries, period, setPeriod, addLedger }: any) {
  const [form, setForm] = useState({ type: "CASH_OUT" as "CASH_IN" | "CASH_OUT", category: "Beban Operasional", description: "", amountRp: 0, dateISO: new Date().toISOString().slice(0, 10) });
  const filtered = entries.filter((e: any) => e.dateISO.startsWith(period)).sort((a: any, b: any) => b.dateISO.localeCompare(a.dateISO));
  const submit = () => {
    if (!form.description || form.amountRp <= 0) return;
    addLedger({ ...form, tenantId, refType: "MANUAL" });
    setForm({ ...form, description: "", amountRp: 0 });
  };
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="card md:col-span-2">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold">📒 Mutasi Kas</h2>
          <input type="month" className="input !w-40" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
        {filtered.length === 0 && <div className="text-center py-10 text-ink-500">Belum ada transaksi pada {period}.</div>}
        {filtered.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-surface-50 text-left text-xs text-ink-500"><tr><th className="p-2">Tanggal</th><th className="p-2">Kategori</th><th className="p-2">Keterangan</th><th className="p-2 text-right">Masuk</th><th className="p-2 text-right">Keluar</th></tr></thead>
            <tbody className="divide-y divide-surface-100">
              {filtered.map((e: any) => (
                <tr key={e.id}>
                  <td className="p-2 text-xs">{e.dateISO}</td>
                  <td className="p-2 text-xs">{e.category}</td>
                  <td className="p-2 text-xs">{e.description} {e.refNo && <span className="text-ink-400 font-mono">({e.refNo})</span>}</td>
                  <td className="p-2 text-right text-emerald-600 font-semibold">{e.type === "CASH_IN" ? fmtRp(e.amountRp) : "—"}</td>
                  <td className="p-2 text-right text-orange-600 font-semibold">{e.type === "CASH_OUT" ? fmtRp(e.amountRp) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h2 className="font-semibold mb-3">➕ Catat Manual</h2>
        <div className="space-y-2">
          <div><label className="text-xs text-ink-500">Tipe</label><select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })}><option value="CASH_IN">Kas Masuk</option><option value="CASH_OUT">Kas Keluar</option></select></div>
          <div><label className="text-xs text-ink-500">Kategori</label><select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option>Beban Operasional</option><option>Beban Gaji</option><option>Beban Sewa</option><option>Beban Listrik</option><option>Penjualan POS</option><option>Pendapatan Jasa</option><option>Lainnya</option></select></div>
          <div><label className="text-xs text-ink-500">Tanggal</label><input type="date" className="input" value={form.dateISO} onChange={(e) => setForm({ ...form, dateISO: e.target.value })} /></div>
          <div><label className="text-xs text-ink-500">Keterangan</label><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><label className="text-xs text-ink-500">Nominal (Rp)</label><input type="number" className="input" value={form.amountRp} onChange={(e) => setForm({ ...form, amountRp: +e.target.value || 0 })} /></div>
          <button onClick={submit} className="btn-primary text-sm w-full">💾 Catat</button>
        </div>
      </div>
    </div>
  );
}

function PayablesTab({ payables, payPayable }: any) {
  const [pay, setPay] = useState<{ id: string; amount: number } | null>(null);
  const sorted = payables.slice().sort((a: any, b: any) => a.dueDateISO.localeCompare(b.dueDateISO));
  return (
    <div className="card">
      {sorted.length === 0 && <div className="text-center py-10 text-ink-500">Belum ada hutang.</div>}
      {sorted.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-surface-50 text-left text-xs text-ink-500"><tr><th className="p-2">Invoice</th><th className="p-2">Supplier</th><th className="p-2">Jatuh Tempo</th><th className="p-2 text-right">Total</th><th className="p-2 text-right">Dibayar</th><th className="p-2 text-right">Sisa</th><th className="p-2">Status</th><th></th></tr></thead>
          <tbody className="divide-y divide-surface-100">
            {sorted.map((p: any) => {
              const remain = p.totalRp - p.paidRp;
              const overdue = p.status !== "PAID" && new Date(p.dueDateISO) < new Date();
              return (
                <tr key={p.id} className={overdue ? "bg-danger-50" : ""}>
                  <td className="p-2 font-mono text-xs">{p.invoiceNo}</td>
                  <td className="p-2 text-xs">{p.supplierName}</td>
                  <td className="p-2 text-xs">{p.dueDateISO} {overdue && <span className="text-danger-600 font-bold">⚠</span>}</td>
                  <td className="p-2 text-right">{fmtRp(p.totalRp)}</td>
                  <td className="p-2 text-right text-emerald-600">{fmtRp(p.paidRp)}</td>
                  <td className="p-2 text-right font-semibold">{fmtRp(remain)}</td>
                  <td className="p-2"><span className={`badge text-[10px] ${p.status === "PAID" ? "bg-emerald-100 text-emerald-700" : p.status === "PARTIAL" ? "bg-warn-100 text-warn-700" : "bg-orange-100 text-orange-700"}`}>{p.status}</span></td>
                  <td className="p-2 text-right">{p.status !== "PAID" && <button onClick={() => setPay({ id: p.id, amount: remain })} className="text-xs text-brand-600 hover:underline">💸 Bayar</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {pay && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => setPay(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold mb-3">💸 Bayar Hutang</h3>
            <label className="text-xs text-ink-500">Nominal pembayaran</label>
            <input type="number" className="input" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: +e.target.value || 0 })} />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setPay(null)} className="btn-secondary text-sm">Batal</button>
              <button onClick={() => { payPayable(pay.id, pay.amount); setPay(null); }} className="btn-primary text-sm">✅ Konfirmasi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReceivablesTab({ receivables, receive, addAR, tenantId }: any) {
  const [rec, setRec] = useState<{ id: string; amount: number } | null>(null);
  const [showNew, setShowNew] = useState(false);
  const sorted = receivables.slice().sort((a: any, b: any) => a.dueDateISO.localeCompare(b.dueDateISO));
  return (
    <div className="card">
      <div className="flex justify-end mb-2"><button onClick={() => setShowNew(true)} className="btn-secondary text-xs">➕ Tambah Piutang</button></div>
      {sorted.length === 0 && <div className="text-center py-10 text-ink-500">Belum ada piutang.</div>}
      {sorted.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-surface-50 text-left text-xs text-ink-500"><tr><th className="p-2">Sumber</th><th className="p-2">Pihak</th><th className="p-2">Jatuh Tempo</th><th className="p-2 text-right">Total</th><th className="p-2 text-right">Diterima</th><th className="p-2 text-right">Sisa</th><th className="p-2">Status</th><th></th></tr></thead>
          <tbody className="divide-y divide-surface-100">
            {sorted.map((r: any) => {
              const remain = r.totalRp - r.paidRp;
              const overdue = r.status !== "PAID" && new Date(r.dueDateISO) < new Date();
              return (
                <tr key={r.id} className={overdue ? "bg-danger-50" : ""}>
                  <td className="p-2"><span className="badge text-[10px] bg-brand-100 text-brand-700">{r.source}</span></td>
                  <td className="p-2 text-xs">{r.partyName}</td>
                  <td className="p-2 text-xs">{r.dueDateISO} {overdue && "⚠"}</td>
                  <td className="p-2 text-right">{fmtRp(r.totalRp)}</td>
                  <td className="p-2 text-right text-emerald-600">{fmtRp(r.paidRp)}</td>
                  <td className="p-2 text-right font-semibold">{fmtRp(remain)}</td>
                  <td className="p-2"><span className={`badge text-[10px] ${r.status === "PAID" ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>{r.status}</span></td>
                  <td className="p-2 text-right">{r.status !== "PAID" && <button onClick={() => setRec({ id: r.id, amount: remain })} className="text-xs text-brand-600 hover:underline">💰 Terima</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {rec && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => setRec(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold mb-3">💰 Terima Pembayaran</h3>
            <input type="number" className="input" value={rec.amount} onChange={(e) => setRec({ ...rec, amount: +e.target.value || 0 })} />
            <div className="flex justify-end gap-2 mt-3"><button onClick={() => setRec(null)} className="btn-secondary text-sm">Batal</button><button onClick={() => { receive(rec.id, rec.amount); setRec(null); }} className="btn-primary text-sm">✅ Konfirmasi</button></div>
          </div>
        </div>
      )}
      {showNew && <NewARModal tenantId={tenantId} onClose={() => setShowNew(false)} addAR={addAR} />}
    </div>
  );
}

function NewARModal({ tenantId, onClose, addAR }: any) {
  const [f, setF] = useState({ source: "PATIENT" as const, partyName: "", invoiceDateISO: new Date().toISOString().slice(0, 10), dueDateISO: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10), totalRp: 0, notes: "" });
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md space-y-2" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold">➕ Piutang Baru</h3>
        <div><label className="text-xs">Sumber</label><select className="input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as any })}><option value="PATIENT">Pasien</option><option value="INSURER">Asuransi</option><option value="OTHER">Lainnya</option></select></div>
        <div><label className="text-xs">Nama</label><input className="input" value={f.partyName} onChange={(e) => setF({ ...f, partyName: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2"><div><label className="text-xs">Tgl Faktur</label><input type="date" className="input" value={f.invoiceDateISO} onChange={(e) => setF({ ...f, invoiceDateISO: e.target.value })} /></div><div><label className="text-xs">Jatuh Tempo</label><input type="date" className="input" value={f.dueDateISO} onChange={(e) => setF({ ...f, dueDateISO: e.target.value })} /></div></div>
        <div><label className="text-xs">Nominal</label><input type="number" className="input" value={f.totalRp} onChange={(e) => setF({ ...f, totalRp: +e.target.value || 0 })} /></div>
        <div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className="btn-secondary text-sm">Batal</button><button onClick={() => { if (f.partyName && f.totalRp > 0) { addAR({ ...f, tenantId }); onClose(); } }} className="btn-primary text-sm">💾 Simpan</button></div>
      </div>
    </div>
  );
}

function PnLTab({ period, setPeriod, entries, cashIn, cashOut }: any) {
  const byCat: Record<string, { in: number; out: number }> = {};
  for (const e of entries) { const b = (byCat[e.category] ||= { in: 0, out: 0 }); if (e.type === "CASH_IN") b.in += e.amountRp; else if (e.type === "CASH_OUT") b.out += e.amountRp; }
  const cats = Object.entries(byCat).sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out));
  const net = cashIn - cashOut;
  return (
    <div className="card">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-semibold">📈 Laba / Rugi (basis kas) — {period}</h2>
        <div className="flex gap-2"><input type="month" className="input !w-40" value={period} onChange={(e) => setPeriod(e.target.value)} /><button onClick={() => window.print()} className="btn-secondary text-xs">🖨 Cetak</button></div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-surface-50 text-left text-xs text-ink-500"><tr><th className="p-2">Kategori</th><th className="p-2 text-right">Pemasukan</th><th className="p-2 text-right">Pengeluaran</th></tr></thead>
        <tbody className="divide-y divide-surface-100">
          {cats.map(([cat, v]) => (<tr key={cat}><td className="p-2">{cat}</td><td className="p-2 text-right text-emerald-600">{v.in ? fmtRp(v.in) : "—"}</td><td className="p-2 text-right text-orange-600">{v.out ? fmtRp(v.out) : "—"}</td></tr>))}
        </tbody>
        <tfoot className="bg-brand-50 font-bold">
          <tr><td className="p-2">TOTAL</td><td className="p-2 text-right text-emerald-700">{fmtRp(cashIn)}</td><td className="p-2 text-right text-orange-700">{fmtRp(cashOut)}</td></tr>
          <tr className={net >= 0 ? "bg-emerald-50" : "bg-danger-50"}><td className="p-2" colSpan={2}>LABA / (RUGI) BERSIH</td><td className={`p-2 text-right ${net >= 0 ? "text-emerald-700" : "text-danger-700"}`}>{fmtRp(net)}</td></tr>
        </tfoot>
      </table>
    </div>
  );
}

function GrossProfitTab({ period, setPeriod, sales }: { period: string; setPeriod: (p: string) => void; sales: import("../../lib/demoStore").DemoPOSSale[] }) {
  const monthly = useMemo(() => sales.filter((s) => s.dateISO.startsWith(period)), [sales, period]);
  const omzet = monthly.reduce((s, x) => s + x.totalRp, 0);
  const hpp = monthly.reduce((s, x) => s + x.totalCostRp, 0);
  const gp = omzet - hpp;
  const gpPct = omzet > 0 ? (gp / omzet) * 100 : 0;

  // Per-produk
  const perProduct = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; omzet: number; hpp: number }>();
    for (const s of monthly) {
      for (const it of s.items) {
        const cur = map.get(it.productId) ?? { name: it.productName, qty: 0, omzet: 0, hpp: 0 };
        cur.qty += it.qty; cur.omzet += it.subtotalRp; cur.hpp += it.costRp;
        map.set(it.productId, cur);
      }
    }
    return [...map.values()].map((v) => ({ ...v, gp: v.omzet - v.hpp, gpPct: v.omzet > 0 ? ((v.omzet - v.hpp) / v.omzet) * 100 : 0 }))
      .sort((a, b) => b.gp - a.gp);
  }, [monthly]);

  const losers = perProduct.filter((p) => p.gpPct < 10);

  // Per-hari
  const perDay = useMemo(() => {
    const map = new Map<string, { omzet: number; hpp: number }>();
    for (const s of monthly) {
      const cur = map.get(s.dateISO) ?? { omzet: 0, hpp: 0 };
      cur.omzet += s.totalRp; cur.hpp += s.totalCostRp;
      map.set(s.dateISO, cur);
    }
    return [...map.entries()].map(([d, v]) => ({ d, ...v, gp: v.omzet - v.hpp })).sort((a, b) => b.d.localeCompare(a.d));
  }, [monthly]);

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold">💎 Laba Kotor (Gross Profit) — {period}</h2>
          <div className="flex gap-2">
            <input type="month" className="input !w-40" value={period} onChange={(e) => setPeriod(e.target.value)} />
            <button onClick={() => window.print()} className="btn-secondary text-xs">🖨 Cetak</button>
          </div>
        </div>
        {monthly.length === 0 ? (
          <div className="text-center py-12 text-ink-500">
            <div className="text-4xl">📭</div>
            <div className="mt-2">Belum ada penjualan POS pada {period}.</div>
            <div className="text-xs text-ink-400 mt-1">Lakukan transaksi di modul Kasir untuk melihat laporan ini.</div>
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-4 gap-3 mb-4">
              <div className="card !p-4 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
                <div className="text-xs opacity-80">Omzet Penjualan</div>
                <div className="text-xl font-bold mt-1">{fmtRp(omzet)}</div>
                <div className="text-[10px] opacity-80 mt-0.5">{monthly.length} transaksi</div>
              </div>
              <div className="card !p-4 bg-gradient-to-br from-orange-500 to-orange-600 text-white">
                <div className="text-xs opacity-80">HPP (Cost of Goods)</div>
                <div className="text-xl font-bold mt-1">{fmtRp(hpp)}</div>
                <div className="text-[10px] opacity-80 mt-0.5">harga beli batch terpakai</div>
              </div>
              <div className={`card !p-4 ${gp >= 0 ? "bg-gradient-to-br from-brand-500 to-brand-600" : "bg-gradient-to-br from-danger-500 to-danger-600"} text-white`}>
                <div className="text-xs opacity-80">LABA KOTOR</div>
                <div className="text-2xl font-bold mt-1">{fmtRp(gp)}</div>
              </div>
              <div className={`card !p-4 ${gpPct >= 30 ? "bg-emerald-50 border border-emerald-200" : gpPct >= 10 ? "bg-warn-50 border border-warn-200" : "bg-danger-50 border border-danger-200"}`}>
                <div className="text-xs text-ink-500">Margin Kotor</div>
                <div className={`text-2xl font-bold mt-1 ${gpPct >= 30 ? "text-emerald-700" : gpPct >= 10 ? "text-warn-700" : "text-danger-700"}`}>{gpPct.toFixed(1)}%</div>
                <div className="text-[10px] text-ink-500 mt-0.5">{gpPct >= 30 ? "✓ sehat" : gpPct >= 10 ? "⚠ tipis" : "🔴 perlu evaluasi harga"}</div>
              </div>
            </div>

            {losers.length > 0 && (
              <div className="bg-danger-50 border border-danger-200 rounded-lg p-3 mb-3">
                <div className="font-semibold text-danger-700 text-sm flex items-center gap-2">⚠ {losers.length} produk dengan margin tipis / rugi</div>
                <div className="text-xs text-danger-600 mt-1">Produk berikut memberi laba &lt; 10% — pertimbangkan revisi harga jual atau cari supplier lebih murah.</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {losers.slice(0, 8).map((l) => (
                    <span key={l.name} className="text-[10px] bg-white border border-danger-200 px-2 py-0.5 rounded text-danger-700">{l.name} ({l.gpPct.toFixed(0)}%)</span>
                  ))}
                </div>
              </div>
            )}

            <div className="grid lg:grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold text-sm mb-2">🏆 Produk Paling Untung (Top 10)</h3>
                <div className="rounded-xl border border-surface-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-50 text-[10px] text-ink-500"><tr><th className="p-2 text-left">Produk</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Omzet</th><th className="p-2 text-right">Laba</th><th className="p-2 text-right">%</th></tr></thead>
                    <tbody className="divide-y divide-surface-100">
                      {perProduct.slice(0, 10).map((p) => (
                        <tr key={p.name}>
                          <td className="p-2 truncate max-w-[140px]">{p.name}</td>
                          <td className="p-2 text-right">{p.qty}</td>
                          <td className="p-2 text-right">{fmtRp(p.omzet)}</td>
                          <td className="p-2 text-right text-emerald-600 font-semibold">{fmtRp(p.gp)}</td>
                          <td className={`p-2 text-right font-bold ${p.gpPct < 10 ? "text-danger-600" : p.gpPct < 30 ? "text-warn-600" : "text-emerald-600"}`}>{p.gpPct.toFixed(0)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-sm mb-2">📅 Laba per Hari</h3>
                <div className="rounded-xl border border-surface-100 overflow-hidden max-h-[420px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-50 text-[10px] text-ink-500 sticky top-0"><tr><th className="p-2 text-left">Tanggal</th><th className="p-2 text-right">Omzet</th><th className="p-2 text-right">HPP</th><th className="p-2 text-right">Laba</th></tr></thead>
                    <tbody className="divide-y divide-surface-100">
                      {perDay.map((d) => (
                        <tr key={d.d}>
                          <td className="p-2">{d.d}</td>
                          <td className="p-2 text-right">{fmtRp(d.omzet)}</td>
                          <td className="p-2 text-right text-orange-600">{fmtRp(d.hpp)}</td>
                          <td className="p-2 text-right text-emerald-600 font-semibold">{fmtRp(d.gp)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-ink-500 mt-4 bg-surface-50 rounded p-2">
              💡 <b>Cara hitung:</b> Setiap penjualan POS otomatis mencatat batch yang dipakai (FEFO) beserta HPP-nya. Laba Kotor = Omzet − Σ(qty × HPP batch). Berbeda dengan laporan L/R yang basis kas (mencakup beban operasional juga).
            </div>
          </>
        )}
      </div>
    </div>
  );
}
