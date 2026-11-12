// Loyalty / Membership: kartu member, tier, riwayat poin, ulang tahun bulan ini.

import { useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import { useDemoStore, type DemoMember, type DemoMemberTier } from "../../lib/demoStore";

const fmtRp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const tierColor: Record<DemoMemberTier, string> = {
  SILVER: "from-slate-400 to-slate-500",
  GOLD: "from-yellow-500 to-amber-600",
  PLATINUM: "from-violet-500 to-purple-700",
};

export function Members() {
  const tenantId = useAuth((s) => s.claims?.tenantId) ?? "";
  const members = useDemoStore((s) => s.members.filter((m) => m.tenantId === tenantId));
  const txs = useDemoStore((s) => s.loyaltyTxs.filter((t) => t.tenantId === tenantId));
  const upsertMember = useDemoStore((s) => s.upsertMember);
  const addLoyaltyTx = useDemoStore((s) => s.addLoyaltyTx);

  const [tab, setTab] = useState<"cards" | "history" | "birthdays">("cards");
  const [edit, setEdit] = useState<Partial<DemoMember> | null>(null);
  const [adjust, setAdjust] = useState<DemoMember | null>(null);

  const totalPoints = members.reduce((s, m) => s + m.pointsBalance, 0);
  const lifetimeSpend = members.reduce((s, m) => s + m.totalSpendRp, 0);
  const monthBirthdays = members.filter((m) => {
    if (!m.birthDateISO) return false;
    return new Date(m.birthDateISO).getMonth() === new Date().getMonth();
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">⭐ Loyalty &amp; Membership</h1>
        <p className="text-ink-500 text-sm mt-0.5">Kartu member, poin, tier privilege, dan promo ulang tahun.</p>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <div className="card !p-4"><div className="text-xs text-ink-500">Total Member</div><div className="text-2xl font-bold mt-1">{members.length}</div></div>
        <div className="card !p-4 bg-gradient-to-br from-yellow-500 to-amber-600 text-white"><div className="text-xs opacity-90">Total Poin Beredar</div><div className="text-2xl font-bold mt-1">{totalPoints.toLocaleString("id-ID")}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Lifetime Spend</div><div className="text-xl font-bold mt-1">{fmtRp(lifetimeSpend)}</div></div>
        <div className="card !p-4 bg-gradient-to-br from-pink-500 to-rose-600 text-white"><div className="text-xs opacity-90">🎂 Ulang Tahun Bulan Ini</div><div className="text-2xl font-bold mt-1">{monthBirthdays.length}</div></div>
      </div>

      <div className="flex gap-1 bg-surface-100 rounded-lg p-1 w-fit">
        {[{ k: "cards", l: `💳 Kartu Member (${members.length})` }, { k: "history", l: "📜 Riwayat Poin" }, { k: "birthdays", l: `🎂 Ulang Tahun (${monthBirthdays.length})` }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k as any)} className={`px-3 py-1.5 text-sm rounded-md ${tab === t.k ? "bg-white text-brand-700 font-semibold shadow-sm" : "text-ink-500"}`}>{t.l}</button>
        ))}
      </div>

      {tab === "cards" && (
        <>
          <div className="flex justify-end"><button onClick={() => setEdit({ tenantId, tier: "SILVER", pointsBalance: 0, totalSpendRp: 0, active: true })} className="btn-primary text-xs">➕ Member Baru</button></div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {members.map((m) => (
              <div key={m.id} className={`rounded-2xl p-4 text-white bg-gradient-to-br ${tierColor[m.tier]} shadow-lg`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-[10px] uppercase opacity-75 tracking-wider">{m.tier} MEMBER</div>
                    <div className="font-mono text-xs opacity-90 mt-1">{m.cardNo}</div>
                  </div>
                  {!m.active && <span className="bg-black/30 px-2 py-0.5 rounded text-[10px]">non-aktif</span>}
                </div>
                <div className="font-bold text-lg mt-3">{m.name}</div>
                <div className="text-xs opacity-80">{m.phone}{m.email && ` · ${m.email}`}</div>
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/30">
                  <div><div className="text-[10px] opacity-75">Poin</div><div className="font-bold text-lg">{m.pointsBalance.toLocaleString("id-ID")}</div></div>
                  <div><div className="text-[10px] opacity-75">Lifetime</div><div className="font-bold text-sm">{fmtRp(m.totalSpendRp)}</div></div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setEdit(m)} className="text-[11px] bg-white/20 hover:bg-white/30 px-2 py-1 rounded">✏ Edit</button>
                  <button onClick={() => setAdjust(m)} className="text-[11px] bg-white/20 hover:bg-white/30 px-2 py-1 rounded">🎁 Atur Poin</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "history" && (
        <div className="card">
          {txs.length === 0 && <div className="text-center py-10 text-ink-500">Belum ada transaksi poin.</div>}
          {txs.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-left text-xs text-ink-500"><tr><th className="p-2">Tanggal</th><th className="p-2">Member</th><th className="p-2">Tipe</th><th className="p-2 text-right">Poin</th><th className="p-2">Keterangan</th></tr></thead>
              <tbody className="divide-y divide-surface-100">
                {txs.slice().sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO)).map((t) => (
                  <tr key={t.id}>
                    <td className="p-2 text-xs">{new Date(t.createdAtISO).toLocaleDateString("id-ID")}</td>
                    <td className="p-2 text-xs">{members.find((m) => m.id === t.memberId)?.name ?? "—"}</td>
                    <td className="p-2"><span className={`badge text-[10px] ${t.type === "EARN" ? "bg-emerald-100 text-emerald-700" : t.type === "REDEEM" ? "bg-orange-100 text-orange-700" : "bg-ink-100 text-ink-600"}`}>{t.type}</span></td>
                    <td className={`p-2 text-right font-semibold ${t.points > 0 ? "text-emerald-600" : "text-orange-600"}`}>{t.points > 0 ? "+" : ""}{t.points}</td>
                    <td className="p-2 text-xs">{t.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "birthdays" && (
        <div className="card">
          <div className="bg-pink-50 border border-pink-200 rounded-lg p-3 mb-3 text-sm text-pink-700">🎂 Member dengan ulang tahun di bulan {new Date().toLocaleDateString("id-ID", { month: "long" })}. Cocok untuk broadcast promo ulang tahun!</div>
          {monthBirthdays.length === 0 && <div className="text-center py-10 text-ink-500">Tidak ada ulang tahun bulan ini.</div>}
          {monthBirthdays.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-left text-xs text-ink-500"><tr><th className="p-2">Nama</th><th className="p-2">Tier</th><th className="p-2">Tgl Lahir</th><th className="p-2">HP</th><th></th></tr></thead>
              <tbody className="divide-y divide-surface-100">
                {monthBirthdays.map((m) => (
                  <tr key={m.id}>
                    <td className="p-2">{m.name}</td>
                    <td className="p-2"><span className="badge text-[10px] bg-yellow-100 text-yellow-700">{m.tier}</span></td>
                    <td className="p-2 text-xs">{m.birthDateISO}</td>
                    <td className="p-2 text-xs">{m.phone}</td>
                    <td className="p-2 text-right"><a href={`https://wa.me/${m.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Selamat ulang tahun ${m.name}! 🎂 Dapatkan diskon 20% untuk pembelian di Apotek Yuyun bulan ini.`)}`} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 hover:underline">📱 WA Promo</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {edit && <MemberEditor data={edit} onClose={() => setEdit(null)} onSave={(m: any) => { upsertMember(m); setEdit(null); }} />}
      {adjust && <PointsAdjust member={adjust} tenantId={tenantId} onClose={() => setAdjust(null)} onSave={(t: any) => { addLoyaltyTx(t); setAdjust(null); }} />}
    </div>
  );
}

function MemberEditor({ data, onClose, onSave }: any) {
  const [f, setF] = useState<any>({
    id: data.id ?? `mb-${Date.now()}`,
    cardNo: data.cardNo ?? `M-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`,
    joinedISO: data.joinedISO ?? new Date().toISOString().slice(0, 10),
    name: "", phone: "", email: "", birthDateISO: "", tier: "SILVER",
    pointsBalance: 0, totalSpendRp: 0, active: true, ...data,
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md space-y-2" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold">{data.id ? "✏ Edit Member" : "➕ Member Baru"}</h3>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs">No Kartu</label><input className="input" value={f.cardNo} onChange={(e) => setF({ ...f, cardNo: e.target.value })} /></div>
          <div><label className="text-xs">Tier</label><select className="input" value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value })}><option value="SILVER">Silver</option><option value="GOLD">Gold</option><option value="PLATINUM">Platinum</option></select></div>
        </div>
        <div><label className="text-xs">Nama</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2"><div><label className="text-xs">HP</label><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div><div><label className="text-xs">Email</label><input className="input" value={f.email ?? ""} onChange={(e) => setF({ ...f, email: e.target.value })} /></div></div>
        <div><label className="text-xs">Tgl Lahir</label><input type="date" className="input" value={f.birthDateISO ?? ""} onChange={(e) => setF({ ...f, birthDateISO: e.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Aktif</label>
        <div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className="btn-secondary text-sm">Batal</button><button onClick={() => f.name && f.phone && onSave(f)} className="btn-primary text-sm">💾 Simpan</button></div>
      </div>
    </div>
  );
}

function PointsAdjust({ member, tenantId, onClose, onSave }: any) {
  const [type, setType] = useState<"EARN" | "REDEEM" | "ADJUST">("EARN");
  const [points, setPoints] = useState(100);
  const [desc, setDesc] = useState("");
  const submit = () => {
    const p = type === "REDEEM" ? -Math.abs(points) : points;
    onSave({ tenantId, memberId: member.id, type, points: p, description: desc || `${type} manual`, refType: "MANUAL" });
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-2" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold">🎁 Atur Poin — {member.name}</h3>
        <div className="text-xs text-ink-500">Saldo saat ini: <b>{member.pointsBalance}</b></div>
        <div><label className="text-xs">Tipe</label><select className="input" value={type} onChange={(e) => setType(e.target.value as any)}><option value="EARN">EARN (tambah)</option><option value="REDEEM">REDEEM (kurang)</option><option value="ADJUST">ADJUST (koreksi)</option></select></div>
        <div><label className="text-xs">Poin</label><input type="number" className="input" value={points} onChange={(e) => setPoints(+e.target.value || 0)} /></div>
        <div><label className="text-xs">Keterangan</label><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Promo ultah, kompensasi, dst" /></div>
        <div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className="btn-secondary text-sm">Batal</button><button onClick={submit} className="btn-primary text-sm">💾 Simpan</button></div>
      </div>
    </div>
  );
}
