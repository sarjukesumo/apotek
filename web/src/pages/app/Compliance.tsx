// Compliance: laporan Narkotika/Psikotropika/OOT (SIPNAP-ready) + monitoring suhu cold-chain.
// Demo memakai data di store. Export CSV/XML disimulasikan via download Blob.

import { useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import { useDemoStore } from "../../lib/demoStore";

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function Compliance() {
  const tenantId = useAuth((s) => s.claims?.tenantId) ?? "";
  const tenant = useDemoStore((s) => s.tenants.find((t) => t.id === tenantId));
  const narcoticLogs = useDemoStore((s) => s.narcoticLogs.filter((l) => l.tenantId === tenantId));
  const ccReadings = useDemoStore((s) => s.coldChainReadings.filter((r) => r.tenantId === tenantId));
  const addColdChainReading = useDemoStore((s) => s.addColdChainReading);

  const [tab, setTab] = useState<"sipnap" | "coldchain">("sipnap");
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));

  const monthLogs = useMemo(() => narcoticLogs.filter((l) => l.dateISO.startsWith(period)), [narcoticLogs, period]);

  const exportSIPNAP = () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<SipnapReport>
  <Apotek>
    <Nama>${tenant?.name ?? ""}</Nama>
    <SIA>${tenant?.sia ?? ""}</SIA>
    <Periode>${period}</Periode>
  </Apotek>
  <Mutasi>
${monthLogs.map((l) => `    <Item>
      <Tanggal>${l.dateISO}</Tanggal>
      <Produk>${l.productName}</Produk>
      <Kategori>${l.category}</Kategori>
      <Tipe>${l.movementType}</Tipe>
      <Qty>${l.qty}</Qty>
      <SaldoAkhir>${l.balanceAfter}</SaldoAkhir>
      <Referensi>${l.refType}/${l.refNo}</Referensi>
${l.patientName ? `      <Pasien>${l.patientName}</Pasien>\n` : ""}${l.doctorName ? `      <Dokter>${l.doctorName}</Dokter>\n` : ""}    </Item>`).join("\n")}
  </Mutasi>
</SipnapReport>`;
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `sipnap-${tenant?.slug}-${period}.xml`; a.click();
    URL.revokeObjectURL(url);
  };

  const ccByUnit = useMemo(() => {
    const map: Record<string, typeof ccReadings> = {};
    for (const r of ccReadings) (map[r.unitName] ||= []).push(r);
    return map;
  }, [ccReadings]);

  const ccBreaches = ccReadings.filter((r) => !r.withinRange).length;

  const [newReading, setNewReading] = useState({ unitName: "Kulkas Vaksin 1", tempCelsius: 5, takenByName: "" });
  const recordReading = () => {
    if (!newReading.takenByName) return;
    addColdChainReading({
      tenantId, unitName: newReading.unitName, tempCelsius: newReading.tempCelsius,
      withinRange: newReading.tempCelsius >= 2 && newReading.tempCelsius <= 8,
      takenAtISO: new Date().toISOString(), takenByName: newReading.takenByName,
    });
    setNewReading({ ...newReading, takenByName: "" });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">📑 Compliance &amp; Pelaporan</h1>
        <p className="text-ink-500 text-sm mt-0.5">Laporan SIPNAP (Narkotika/Psikotropika/OOT) + monitoring cold-chain (kulkas vaksin/insulin).</p>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="card !p-4"><div className="text-xs text-ink-500">Mutasi NPP/OOT Bulan Ini</div><div className="text-2xl font-bold mt-1">{monthLogs.length}</div></div>
        <div className="card !p-4 bg-gradient-to-br from-brand-500 to-brand-600 text-white"><div className="text-xs opacity-80">Pencatatan Suhu (24h)</div><div className="text-2xl font-bold mt-1">{ccReadings.filter((r) => Date.now() - new Date(r.takenAtISO).getTime() < 86400_000).length}</div></div>
        <div className={`card !p-4 ${ccBreaches > 0 ? "border-danger-300 bg-danger-50" : ""}`}><div className="text-xs text-ink-500">Pelanggaran Suhu</div><div className={`text-2xl font-bold mt-1 ${ccBreaches > 0 ? "text-danger-700" : "text-emerald-600"}`}>{ccBreaches}</div></div>
      </div>

      <div className="flex gap-1 bg-surface-100 rounded-lg p-1 w-fit">
        {[{ k: "sipnap", l: "💊 SIPNAP / OOT" }, { k: "coldchain", l: "🧊 Cold Chain" }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-3 py-1.5 text-sm rounded-md ${tab === t.k ? "bg-white text-brand-700 font-semibold shadow-sm" : "text-ink-500"}`}>{t.l}</button>
        ))}
      </div>

      {tab === "sipnap" && (
        <div className="card">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div>
              <h2 className="font-semibold">Laporan SIPNAP — Mutasi Narkotika/Psikotropika/OOT</h2>
              <p className="text-xs text-ink-500 mt-0.5">Format SIPNAP siap diunggah ke <code>sipnap.binfar.kemkes.go.id</code> setiap tanggal 1-10.</p>
            </div>
            <div className="flex items-center gap-2">
              <input type="month" className="input !w-40" value={period} onChange={(e) => setPeriod(e.target.value)} />
              <button onClick={exportSIPNAP} className="btn-primary text-xs">📥 Export XML</button>
            </div>
          </div>
          {monthLogs.length === 0 && <div className="text-center py-10 text-ink-500"><div className="text-5xl mb-2">💊</div>Belum ada mutasi NPP/OOT pada periode {period}.<div className="text-xs mt-2">Otomatis tercatat saat dispensing resep narkotika atau penerimaan dari supplier.</div></div>}
          {monthLogs.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-left text-xs text-ink-500"><tr><th className="p-2">Tanggal</th><th className="p-2">Produk</th><th className="p-2">Kategori</th><th className="p-2">Tipe</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Saldo</th><th className="p-2">Ref</th><th className="p-2">Pasien/Dokter</th></tr></thead>
              <tbody className="divide-y divide-surface-100">
                {monthLogs.map((l) => (
                  <tr key={l.id}>
                    <td className="p-2 text-xs">{l.dateISO}</td>
                    <td className="p-2 text-xs">{l.productName}</td>
                    <td className="p-2"><span className={`badge text-[10px] ${l.category === "NARKOTIKA" ? "bg-danger-100 text-danger-700" : l.category === "PSIKOTROPIKA" ? "bg-warn-100 text-warn-700" : "bg-brand-100 text-brand-700"}`}>{l.category}</span></td>
                    <td className="p-2"><span className={`badge text-[10px] ${l.movementType === "IN" ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>{l.movementType}</span></td>
                    <td className="p-2 text-right">{l.qty}</td>
                    <td className="p-2 text-right text-ink-600">{l.balanceAfter}</td>
                    <td className="p-2 text-[10px] font-mono text-ink-500">{l.refType}/{l.refNo}</td>
                    <td className="p-2 text-xs">{l.patientName ?? l.doctorName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "coldchain" && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="font-semibold mb-3">🧊 Catat Suhu Sekarang</h2>
            <div className="grid md:grid-cols-4 gap-2">
              <div><label className="text-xs text-ink-500">Unit</label><select className="input" value={newReading.unitName} onChange={(e) => setNewReading({ ...newReading, unitName: e.target.value })}><option>Kulkas Vaksin 1</option><option>Kulkas Vaksin 2</option><option>Kulkas Insulin</option><option>Freezer Rantai Dingin</option></select></div>
              <div><label className="text-xs text-ink-500">Suhu (°C)</label><input type="number" step="0.1" className="input" value={newReading.tempCelsius} onChange={(e) => setNewReading({ ...newReading, tempCelsius: +e.target.value || 0 })} /></div>
              <div><label className="text-xs text-ink-500">Petugas *</label><input className="input" value={newReading.takenByName} onChange={(e) => setNewReading({ ...newReading, takenByName: e.target.value })} placeholder="Nama" /></div>
              <div className="flex items-end"><button onClick={recordReading} disabled={!newReading.takenByName} className="btn-primary text-sm w-full disabled:opacity-50">✅ Catat</button></div>
            </div>
            <div className="mt-2 text-[11px] text-ink-500">Range aman vaksin: <b>2 – 8 °C</b>. Otomatis flag pelanggaran jika di luar range.</div>
          </div>

          {Object.entries(ccByUnit).map(([unit, readings]) => {
            const sorted = readings.slice().sort((a, b) => b.takenAtISO.localeCompare(a.takenAtISO));
            const breaches = sorted.filter((r) => !r.withinRange).length;
            const last = sorted[0];
            return (
              <div key={unit} className="card">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold">{unit}</h3>
                    <div className="text-xs text-ink-500 mt-0.5">{sorted.length} pencatatan · {breaches > 0 ? <span className="text-danger-600 font-semibold">⚠ {breaches} pelanggaran</span> : <span className="text-emerald-600">✓ semua aman</span>}</div>
                  </div>
                  {last && (
                    <div className="text-right">
                      <div className={`text-2xl font-bold ${last.withinRange ? "text-emerald-600" : "text-danger-600"}`}>{last.tempCelsius.toFixed(1)} °C</div>
                      <div className="text-[10px] text-ink-500">terakhir {fmtDateTime(last.takenAtISO)}</div>
                    </div>
                  )}
                </div>
                <table className="w-full text-sm mt-3">
                  <thead className="bg-surface-50 text-left text-xs text-ink-500"><tr><th className="p-2">Waktu</th><th className="p-2 text-right">Suhu</th><th className="p-2">Status</th><th className="p-2">Petugas</th><th className="p-2">Catatan</th></tr></thead>
                  <tbody className="divide-y divide-surface-100">
                    {sorted.slice(0, 10).map((r) => (
                      <tr key={r.id}>
                        <td className="p-2 text-xs">{fmtDateTime(r.takenAtISO)}</td>
                        <td className={`p-2 text-right font-semibold ${r.withinRange ? "text-emerald-600" : "text-danger-600"}`}>{r.tempCelsius.toFixed(1)} °C</td>
                        <td className="p-2"><span className={`badge text-[10px] ${r.withinRange ? "bg-emerald-100 text-emerald-700" : "bg-danger-100 text-danger-700"}`}>{r.withinRange ? "✓ aman" : "⚠ pelanggaran"}</span></td>
                        <td className="p-2 text-xs">{r.takenByName}</td>
                        <td className="p-2 text-xs text-ink-600">{r.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
