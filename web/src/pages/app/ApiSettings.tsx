// API & Webhook integrations.

import { useState } from "react";
import { useAuth } from "../../lib/auth";
import { useDemoStore, type DemoWebhook, type DemoApiKey } from "../../lib/demoStore";

const EVENTS = [
  "pos.completed", "pos.voided", "stock.low", "stock.expired",
  "rx.received", "rx.dispensed", "grn.received",
  "payable.due", "claim.approved", "member.created",
];
const SCOPES = ["read:products", "write:products", "read:orders", "write:orders", "read:reports", "webhook:manage"];

export function ApiSettings() {
  const tenantId = useAuth((s) => s.claims?.tenantId) ?? "";
  const webhooks = useDemoStore((s) => s.webhooks.filter((w) => w.tenantId === tenantId));
  const apiKeys = useDemoStore((s) => s.apiKeys.filter((k) => k.tenantId === tenantId));
  const upsertWebhook = useDemoStore((s) => s.upsertWebhook);
  const removeWebhook = useDemoStore((s) => s.removeWebhook);
  const upsertApiKey = useDemoStore((s) => s.upsertApiKey);
  const removeApiKey = useDemoStore((s) => s.removeApiKey);

  const [tab, setTab] = useState<"webhooks" | "keys">("webhooks");
  const [editWh, setEditWh] = useState<Partial<DemoWebhook> | null>(null);
  const [editKey, setEditKey] = useState<Partial<DemoApiKey> | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">🔌 API &amp; Webhook</h1>
        <p className="text-ink-500 text-sm mt-0.5">Integrasikan dengan sistem ERP/eHospital/marketplace via REST API + webhook.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="card !p-4"><div className="text-xs text-ink-500">Webhook Aktif</div><div className="text-2xl font-bold mt-1">{webhooks.filter((w) => w.active).length} / {webhooks.length}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">API Key Aktif</div><div className="text-2xl font-bold mt-1">{apiKeys.filter((k) => k.active).length} / {apiKeys.length}</div></div>
      </div>

      <div className="flex gap-1 bg-surface-100 rounded-lg p-1 w-fit">
        {[{ k: "webhooks", l: `🔔 Webhook (${webhooks.length})` }, { k: "keys", l: `🔑 API Key (${apiKeys.length})` }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k as any)} className={`px-3 py-1.5 text-sm rounded-md ${tab === t.k ? "bg-white text-brand-700 font-semibold shadow-sm" : "text-ink-500"}`}>{t.l}</button>
        ))}
      </div>

      {tab === "webhooks" && (
        <div className="card">
          <div className="flex justify-end mb-3"><button onClick={() => setEditWh({ tenantId, active: true, events: [], secretMasked: `whsec_***${Math.random().toString(36).slice(-4)}` })} className="btn-primary text-xs">➕ Webhook Baru</button></div>
          {webhooks.length === 0 && <div className="text-center py-10 text-ink-500"><div className="text-5xl mb-2">🔔</div>Belum ada webhook.<div className="text-xs mt-2">Webhook men-trigger HTTP POST ke URL Anda saat event terjadi.</div></div>}
          {webhooks.length > 0 && (
            <div className="space-y-2">
              {webhooks.map((w) => (
                <div key={w.id} className="border border-surface-100 rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><div className="font-semibold">{w.name}</div>{!w.active && <span className="badge text-[10px] bg-ink-100 text-ink-600">paused</span>}</div>
                      <div className="text-xs text-ink-500 font-mono truncate mt-0.5">{w.url}</div>
                      <div className="flex flex-wrap gap-1 mt-2">{w.events.map((e) => <span key={e} className="badge text-[10px] bg-brand-100 text-brand-700">{e}</span>)}</div>
                      <div className="text-[10px] text-ink-400 mt-2">Secret: <code>{w.secretMasked}</code> {w.lastDeliveryISO && `· last ${new Date(w.lastDeliveryISO).toLocaleString("id-ID")} (${w.lastStatus})`}</div>
                    </div>
                    <div className="flex flex-col gap-1"><button onClick={() => setEditWh(w)} className="text-xs text-brand-600 hover:underline">✏ Edit</button><button onClick={() => { if (confirm(`Hapus webhook ${w.name}?`)) removeWebhook(w.id); }} className="text-xs text-danger-600 hover:underline">🗑</button></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "keys" && (
        <div className="card">
          <div className="flex justify-end mb-3"><button onClick={() => setEditKey({ tenantId, active: true, scopes: [], keyMasked: `pk_live_***${Math.random().toString(36).slice(-4)}` })} className="btn-primary text-xs">➕ API Key Baru</button></div>
          {apiKeys.length === 0 && <div className="text-center py-10 text-ink-500"><div className="text-5xl mb-2">🔑</div>Belum ada API key.<div className="text-xs mt-2">Gunakan API key untuk autentikasi REST API.</div></div>}
          {apiKeys.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-left text-xs text-ink-500"><tr><th className="p-2">Nama</th><th className="p-2">Key</th><th className="p-2">Scopes</th><th className="p-2">Last Used</th><th className="p-2">Status</th><th></th></tr></thead>
              <tbody className="divide-y divide-surface-100">
                {apiKeys.map((k) => (
                  <tr key={k.id}>
                    <td className="p-2 font-medium">{k.name}</td>
                    <td className="p-2 font-mono text-xs">{k.keyMasked}</td>
                    <td className="p-2"><div className="flex flex-wrap gap-1">{k.scopes.map((s) => <span key={s} className="badge text-[10px] bg-emerald-100 text-emerald-700">{s}</span>)}</div></td>
                    <td className="p-2 text-xs text-ink-500">{k.lastUsedISO ? new Date(k.lastUsedISO).toLocaleString("id-ID") : "—"}</td>
                    <td className="p-2"><span className={`badge text-[10px] ${k.active ? "bg-emerald-100 text-emerald-700" : "bg-ink-100 text-ink-600"}`}>{k.active ? "active" : "revoked"}</span></td>
                    <td className="p-2 text-right"><button onClick={() => setEditKey(k)} className="text-xs text-brand-600 hover:underline mr-2">✏</button><button onClick={() => { if (confirm(`Revoke ${k.name}?`)) removeApiKey(k.id); }} className="text-xs text-danger-600 hover:underline">🗑</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {editWh && <WebhookEditor data={editWh} onClose={() => setEditWh(null)} onSave={(w: any) => { upsertWebhook(w); setEditWh(null); }} />}
      {editKey && <ApiKeyEditor data={editKey} onClose={() => setEditKey(null)} onSave={(k: any) => { upsertApiKey(k); setEditKey(null); }} />}
    </div>
  );
}

function WebhookEditor({ data, onClose, onSave }: any) {
  const [f, setF] = useState<any>({ id: data.id ?? `wh-${Date.now()}`, name: "", url: "", events: [], active: true, secretMasked: "whsec_***xxxx", ...data });
  const toggle = (e: string) => setF({ ...f, events: f.events.includes(e) ? f.events.filter((x: string) => x !== e) : [...f.events, e] });
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto space-y-2" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold">{data.id ? "✏ Edit Webhook" : "➕ Webhook Baru"}</h3>
        <div><label className="text-xs">Nama</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Sync ke ERP" /></div>
        <div><label className="text-xs">URL</label><input className="input font-mono text-xs" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://erp.example.com/webhook" /></div>
        <div><label className="text-xs">Events</label><div className="grid grid-cols-2 gap-1 mt-1">{EVENTS.map((e) => <label key={e} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.events.includes(e)} onChange={() => toggle(e)} /> <span className="font-mono">{e}</span></label>)}</div></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Aktif</label>
        <div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className="btn-secondary text-sm">Batal</button><button onClick={() => f.name && f.url && onSave(f)} className="btn-primary text-sm">💾 Simpan</button></div>
      </div>
    </div>
  );
}

function ApiKeyEditor({ data, onClose, onSave }: any) {
  const [f, setF] = useState<any>({ id: data.id ?? `ak-${Date.now()}`, name: "", scopes: [], active: true, keyMasked: "pk_live_***xxxx", ...data });
  const toggle = (s: string) => setF({ ...f, scopes: f.scopes.includes(s) ? f.scopes.filter((x: string) => x !== s) : [...f.scopes, s] });
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md space-y-2" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold">{data.id ? "✏ Edit API Key" : "➕ API Key Baru"}</h3>
        <div><label className="text-xs">Nama</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Marketplace Integration" /></div>
        <div className="bg-surface-100 rounded p-2 font-mono text-xs">Key: <b>{f.keyMasked}</b><div className="text-[10px] text-ink-500 mt-1">⚠ Key sebenarnya hanya muncul sekali saat dibuat (mock).</div></div>
        <div><label className="text-xs">Scopes</label><div className="grid grid-cols-1 gap-1 mt-1">{SCOPES.map((s) => <label key={s} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.scopes.includes(s)} onChange={() => toggle(s)} /> <span className="font-mono">{s}</span></label>)}</div></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Aktif</label>
        <div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className="btn-secondary text-sm">Batal</button><button onClick={() => f.name && onSave(f)} className="btn-primary text-sm">💾 Simpan</button></div>
      </div>
    </div>
  );
}
