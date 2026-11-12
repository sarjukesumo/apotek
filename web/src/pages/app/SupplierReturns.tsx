// Retur ke Supplier — workflow:
// 1. Pilih supplier (yang menerima retur).
// 2. Pilih batch yang akan diretur (dari produk di tenant ini), validasi sisa hari ED ≥ kebijakan supplier.
// 3. Isi alasan + qty per batch → Buat surat retur (status DRAFT atau SENT).
// 4. Riwayat: tracking status SENT → ACCEPTED/REJECTED → COMPLETED. Cetak surat retur.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import {
  useDemoStore,
  type DemoSupplier, type DemoReturn, type DemoReturnReason, type DemoReturnStatus,
} from "../../lib/demoStore";
import { batchZone, batchZoneMeta, daysToExpiry, formatDaysToExpiry } from "../../lib/fefo";

interface SelectedItem {
  productId: string;
  productName: string;
  batchId: string;
  batchNo: string;
  qty: number;
  unit: string;
  expiryISO: string;
  price: number;
  supplierId?: string;
}

const REASON_LABEL: Record<DemoReturnReason, string> = {
  NEAR_EXPIRY: "Mendekati ED (Near-Expiry)",
  DAMAGED: "Rusak / kemasan terbuka",
  WRONG_ITEM: "Salah kirim / salah produk",
  RECALL: "Recall produsen / BPOM",
  OVERSTOCK: "Overstock / kelebihan",
  OTHER: "Lainnya",
};

const STATUS_META: Record<DemoReturnStatus, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-surface-100 text-ink-700" },
  SENT: { label: "Terkirim", cls: "bg-brand-100 text-brand-700" },
  ACCEPTED: { label: "Diterima Supplier", cls: "bg-accent-100 text-accent-700" },
  REJECTED: { label: "Ditolak", cls: "bg-danger-100 text-danger-700" },
  COMPLETED: { label: "Selesai (Diganti/Refund)", cls: "bg-emerald-100 text-emerald-700" },
};

function fmtRp(n: number) { return `Rp ${n.toLocaleString("id-ID")}`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }

export function SupplierReturnsPage() {
  const tenantId = useAuth((s) => s.claims?.tenantId) ?? "";
  const tenant = useDemoStore((s) => s.tenants.find((t) => t.id === tenantId));
  const products = useDemoStore((s) => s.products.filter((p) => p.tenantId === tenantId));
  const suppliers = useDemoStore((s) => s.suppliers.filter((x) => x.tenantId === tenantId));
  const returns = useDemoStore((s) => s.returns.filter((r) => r.tenantId === tenantId));
  const addReturn = useDemoStore((s) => s.addReturn);
  const updateReturnStatus = useDemoStore((s) => s.updateReturnStatus);
  const upsertSupplier = useDemoStore((s) => s.upsertSupplier);
  const removeSupplier = useDemoStore((s) => s.removeSupplier);
  const toggleSupplierActive = useDemoStore((s) => s.toggleSupplierActive);

  const [tab, setTab] = useState<"new" | "history" | "suppliers" | "stats">("new");
  const [showPreview, setShowPreview] = useState<DemoReturn | null>(null);
  const [editSupplier, setEditSupplier] = useState<DemoSupplier | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">↩️ Retur ke Supplier</h1>
          <p className="text-ink-500 text-sm mt-1">
            {tenant?.name} · Kembalikan stok near-expiry / rusak ke distributor sebelum jadi loss.
          </p>
        </div>
        <Link to=".." className="btn-secondary text-sm">← Dashboard</Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-100 rounded-lg p-1 w-fit">
        {[
          { k: "new", l: "📝 Buat Retur" },
          { k: "history", l: `📚 Riwayat (${returns.length})` },
          { k: "suppliers", l: `🏭 Supplier (${suppliers.length})` },
          { k: "stats", l: "📈 Statistik" },
        ].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-4 py-1.5 text-sm rounded-md ${tab === t.k ? "bg-white text-brand-700 font-semibold shadow-sm" : "text-ink-500"}`}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === "new" && (
        <NewReturnForm
          suppliers={suppliers.filter((s) => s.active && s.returnable)}
          products={products}
          onSubmit={(payload) => {
            const created = addReturn(payload);
            setShowPreview(created);
          }}
        />
      )}

      {tab === "history" && (
        <HistoryList
          returns={returns}
          onView={setShowPreview}
          onUpdateStatus={updateReturnStatus}
        />
      )}

      {tab === "suppliers" && (
        <SuppliersTab
          suppliers={suppliers}
          onEdit={(s) => setEditSupplier(s)}
          onNew={() => setEditSupplier({
            id: "sup-" + Math.random().toString(36).slice(2, 8),
            tenantId,
            name: "", picName: "", phone: "", address: "",
            returnable: true, returnMinDaysBeforeED: 90,
            active: true, createdAtISO: todayISO(),
          })}
          onToggleActive={(id) => toggleSupplierActive(id)}
          onDelete={(id) => { if (confirm("Hapus supplier ini?")) removeSupplier(id); }}
        />
      )}

      {tab === "stats" && (
        <StatsTab returns={returns} suppliers={suppliers} />
      )}

      {showPreview && tenant && (
        <ReturnPreview ret={showPreview} tenant={tenant} suppliers={suppliers} onClose={() => setShowPreview(null)} />
      )}

      {editSupplier && (
        <SupplierEditor
          supplier={editSupplier}
          onClose={() => setEditSupplier(null)}
          onSave={(s) => { upsertSupplier(s); setEditSupplier(null); }}
        />
      )}
    </div>
  );
}

// ===== New Return Form =====
function NewReturnForm({
  suppliers, products, onSubmit,
}: {
  suppliers: DemoSupplier[];
  products: ReturnType<typeof useDemoStore.getState>["products"];
  onSubmit: (payload: Omit<DemoReturn, "id" | "createdAtISO" | "noReturn" | "supplierName">) => void;
}) {
  const [supplierId, setSupplierId] = useState<string>(suppliers[0]?.id ?? "");
  const [reason, setReason] = useState<DemoReturnReason>("NEAR_EXPIRY");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<Record<string, SelectedItem>>({});
  const [filter, setFilter] = useState<"warning" | "expired" | "supplier" | "all">("supplier");

  const supplier = suppliers.find((s) => s.id === supplierId);

  // Candidate batches based on filter + supplier policy
  const candidates = useMemo(() => {
    const list: (SelectedItem & { zone: ReturnType<typeof batchZone>; eligible: boolean; reason?: string })[] = [];
    for (const p of products) {
      for (const b of p.batches) {
        const z = batchZone(b.expiryISO);
        const days = daysToExpiry(b.expiryISO);

        // Filter
        if (filter === "warning" && z !== "WARNING" && z !== "CRITICAL") continue;
        if (filter === "expired" && z !== "EXPIRED") continue;
        if (filter === "supplier" && b.supplierId !== supplierId) continue;

        // Eligibility check vs supplier policy
        let eligible = true;
        let why: string | undefined;
        if (!supplier) { eligible = false; why = "Pilih supplier dulu"; }
        else if (z === "EXPIRED") { eligible = false; why = "Sudah expired — tidak bisa retur, harus dimusnahkan (BAP)"; }
        else if (days < supplier.returnMinDaysBeforeED) {
          eligible = false;
          why = `Sisa ED ${days} hr < kebijakan supplier (min ${supplier.returnMinDaysBeforeED} hr)`;
        } else if (b.supplierId && b.supplierId !== supplierId) {
          eligible = false;
          why = "Batch ini dari supplier lain";
        }

        list.push({
          productId: p.id, productName: p.name,
          batchId: b.id, batchNo: b.batchNo,
          qty: b.qty, unit: p.unit, expiryISO: b.expiryISO, price: p.price, supplierId: b.supplierId,
          zone: z, eligible, reason: why,
        });
      }
    }
    return list.sort((a, b) => a.expiryISO.localeCompare(b.expiryISO));
  }, [products, filter, supplier, supplierId]);

  const selectedList = Object.values(selected);
  const totalValue = selectedList.reduce((s, it) => s + it.qty * it.price, 0);

  function toggle(item: SelectedItem & { eligible: boolean }) {
    if (!item.eligible) return;
    setSelected((cur) => {
      const next = { ...cur };
      if (next[item.batchId]) delete next[item.batchId];
      else next[item.batchId] = item;
      return next;
    });
  }

  function updateQty(batchId: string, qty: number) {
    setSelected((cur) => {
      const it = cur[batchId];
      if (!it) return cur;
      return { ...cur, [batchId]: { ...it, qty: Math.max(0, qty) } };
    });
  }

  function submit(asStatus: DemoReturnStatus) {
    if (!supplier) { alert("Pilih supplier."); return; }
    if (selectedList.length === 0) { alert("Pilih minimal 1 batch."); return; }
    if (asStatus === "SENT" && !confirm(
      `Kirim retur ${selectedList.length} batch (${fmtRp(totalValue)}) ke ${supplier.name}?\nStok akan dikurangi dari inventory.`,
    )) return;

    onSubmit({
      tenantId: products[0]?.tenantId ?? "",
      supplierId,
      dateISO: date,
      reason,
      status: asStatus,
      notes: notes.trim() || undefined,
      items: selectedList.map((it) => ({
        productId: it.productId,
        productName: it.productName,
        batchNo: it.batchNo,
        qty: it.qty,
        unit: it.unit,
        expiryISO: it.expiryISO,
        valueRp: it.qty * it.price,
      })),
      totalValueRp: totalValue,
    });
    setSelected({});
    setNotes("");
  }

  if (suppliers.length === 0) {
    return (
      <div className="card text-center py-12">
        <div className="text-4xl">🏭</div>
        <h3 className="font-semibold mt-2">Belum ada supplier yang menerima retur</h3>
        <p className="text-sm text-ink-500 mt-1">Tambahkan supplier dulu di tab Supplier (centang "menerima retur").</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Step 1: pilih supplier */}
      <div className="card">
        <h2 className="font-semibold">1. Pilih Supplier Tujuan Retur</h2>
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="label">Supplier</label>
            <select className="input" value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setSelected({}); }}>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tanggal Retur</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {supplier && (
          <div className="mt-3 p-3 rounded-lg bg-brand-50 border border-brand-100 text-xs">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <div className="font-semibold text-brand-800">{supplier.name}</div>
                <div className="text-ink-600">PIC: {supplier.picName} · {supplier.phone}{supplier.whatsapp ? ` · WA ${supplier.whatsapp}` : ""}</div>
                <div className="text-ink-500 mt-0.5">{supplier.address}</div>
              </div>
              <div className="text-right">
                <span className="badge bg-accent-100 text-accent-700">Min. ED {supplier.returnMinDaysBeforeED} hari</span>
              </div>
            </div>
            {supplier.returnNotes && <div className="text-[11px] text-ink-500 mt-2 italic">📋 Kebijakan: {supplier.returnNotes}</div>}
          </div>
        )}
      </div>

      {/* Step 2: pilih batch */}
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold">2. Pilih Batch untuk Retur</h2>
          <div className="flex gap-1 bg-surface-100 rounded-lg p-1">
            {[
              { k: "supplier", l: `📦 Dari supplier ini` },
              { k: "warning", l: "🟠 Warning/Critical" },
              { k: "expired", l: "⚫ Expired" },
              { k: "all", l: "Semua" },
            ].map((f) => (
              <button key={f.k} onClick={() => setFilter(f.k as any)}
                className={`px-3 py-1 text-xs rounded-md ${filter === f.k ? "bg-white text-brand-700 font-semibold shadow-sm" : "text-ink-500"}`}>
                {f.l}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-surface-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-500 bg-surface-50 border-b border-surface-100">
              <tr>
                <th className="p-2 w-10"></th>
                <th className="p-2">Produk</th>
                <th className="p-2">Batch</th>
                <th className="p-2">Expiry</th>
                <th className="p-2 text-right">Stok</th>
                <th className="p-2 text-right">Qty Retur</th>
                <th className="p-2 text-right">Nilai</th>
              </tr>
            </thead>
            <tbody>
              {candidates.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-ink-500">
                  <div className="text-3xl">🔍</div>
                  <div className="mt-2">Tidak ada batch dalam filter ini.</div>
                </td></tr>
              )}
              {candidates.map((c) => {
                const sel = selected[c.batchId];
                const zm = batchZoneMeta(c.expiryISO);
                return (
                  <tr key={c.batchId}
                    onClick={() => toggle(c)}
                    className={`border-t border-surface-100 ${
                      sel ? "bg-brand-50/40" : c.eligible ? "hover:bg-surface-50/50 cursor-pointer" : "opacity-50"
                    }`}>
                    <td className="p-2 text-center">
                      <input type="checkbox" checked={!!sel} disabled={!c.eligible} readOnly
                        className="w-4 h-4 accent-brand-500" />
                    </td>
                    <td className="p-2">
                      <div className="font-medium text-sm">{c.productName}</div>
                      <div className="text-[10px] text-ink-500">{fmtRp(c.price)} / {c.unit}</div>
                      {!c.eligible && c.reason && (
                        <div className="text-[10px] text-danger-600 mt-0.5">⚠ {c.reason}</div>
                      )}
                    </td>
                    <td className="p-2 font-mono text-xs">
                      {c.batchNo}
                      {c.supplierId && c.supplierId !== supplierId && (
                        <div className="text-[10px] text-ink-400">↪ supplier lain</div>
                      )}
                    </td>
                    <td className="p-2">
                      <span className={`badge text-[10px] ${zm.cls}`}>{c.expiryISO}</span>
                      <div className="text-[10px] text-ink-500 mt-0.5">{formatDaysToExpiry(c.expiryISO)}</div>
                    </td>
                    <td className="p-2 text-right font-semibold">{c.qty}</td>
                    <td className="p-2 text-right" onClick={(e) => e.stopPropagation()}>
                      {sel ? (
                        <input type="number" min={0} max={c.qty} value={sel.qty}
                          onChange={(e) => updateQty(c.batchId, parseInt(e.target.value) || 0)}
                          className="w-20 h-8 text-right border border-surface-200 rounded text-sm" />
                      ) : <span className="text-ink-400">—</span>}
                    </td>
                    <td className="p-2 text-right text-xs">
                      {sel ? <span className="font-semibold text-brand-700">{fmtRp(sel.qty * c.price)}</span> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Step 3: alasan & submit */}
      {selectedList.length > 0 && (
        <div className="card">
          <h2 className="font-semibold">3. Alasan & Catatan</h2>
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            <div>
              <label className="label">Alasan Retur</label>
              <select className="input" value={reason} onChange={(e) => setReason(e.target.value as DemoReturnReason)}>
                {(Object.keys(REASON_LABEL) as DemoReturnReason[]).map((k) => (
                  <option key={k} value={k}>{REASON_LABEL[k]}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <div className="card !p-3 bg-brand-50 border-brand-200 w-full">
                <div className="text-[11px] text-brand-700 uppercase font-semibold">Total Nilai Retur</div>
                <div className="text-xl font-bold text-brand-800">{fmtRp(totalValue)}</div>
                <div className="text-[10px] text-ink-500">{selectedList.length} batch dipilih</div>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="label">Catatan untuk supplier (opsional)</label>
              <textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Mis. Mohon penggantian dalam 14 hari kerja. Pickup hari Jumat." />
            </div>
          </div>

          <div className="flex gap-2 mt-4 pt-4 border-t border-surface-100">
            <button onClick={() => submit("SENT")} className="btn-primary flex-1">
              📤 Kirim Retur ke Supplier
            </button>
            <button onClick={() => submit("DRAFT")} className="btn-secondary">
              💾 Simpan Draft
            </button>
            <button onClick={() => setSelected({})} className="btn-secondary">Batal</button>
          </div>
          <p className="text-[11px] text-ink-500 mt-2">
            💡 "Kirim" akan langsung mengurangi stok dari inventory. "Simpan Draft" hanya menyimpan tanpa mengubah stok.
          </p>
        </div>
      )}
    </div>
  );
}

// ===== History =====
function HistoryList({
  returns, onView, onUpdateStatus,
}: {
  returns: DemoReturn[];
  onView: (r: DemoReturn) => void;
  onUpdateStatus: (id: string, status: DemoReturnStatus, rejectionReason?: string) => void;
}) {
  if (returns.length === 0) {
    return (
      <div className="card text-center py-12">
        <div className="text-4xl">📭</div>
        <h3 className="font-semibold mt-2">Belum ada retur</h3>
        <p className="text-sm text-ink-500 mt-1">Buat retur baru di tab "Buat Retur".</p>
      </div>
    );
  }

  function nextStatus(r: DemoReturn) {
    if (r.status === "DRAFT") onUpdateStatus(r.id, "SENT");
    else if (r.status === "SENT") {
      const ok = confirm("Tandai SUDAH DITERIMA supplier?\n(Pilih Cancel untuk Tolak)");
      if (ok) onUpdateStatus(r.id, "ACCEPTED");
      else {
        const reason = prompt("Alasan ditolak:");
        if (reason) onUpdateStatus(r.id, "REJECTED", reason);
      }
    } else if (r.status === "ACCEPTED") {
      if (confirm("Tandai SELESAI (sudah diganti / refund diterima)?")) onUpdateStatus(r.id, "COMPLETED");
    }
  }

  return (
    <div className="card !p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-500 bg-surface-50 border-b border-surface-100">
          <tr>
            <th className="p-3">No. Retur</th>
            <th className="p-3">Tanggal</th>
            <th className="p-3">Supplier</th>
            <th className="p-3">Alasan</th>
            <th className="p-3 text-right">Item</th>
            <th className="p-3 text-right">Nilai</th>
            <th className="p-3">Status</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {[...returns].reverse().map((r) => {
            const sm = STATUS_META[r.status];
            return (
              <tr key={r.id} className="border-t border-surface-100 hover:bg-surface-50/50">
                <td className="p-3 font-mono text-xs">{r.noReturn}</td>
                <td className="p-3 text-xs">{r.dateISO}</td>
                <td className="p-3 text-xs">{r.supplierName}</td>
                <td className="p-3 text-xs">{REASON_LABEL[r.reason]}</td>
                <td className="p-3 text-right text-xs">{r.items.length} batch</td>
                <td className="p-3 text-right font-semibold text-brand-700">{fmtRp(r.totalValueRp)}</td>
                <td className="p-3">
                  <span className={`badge text-[10px] ${sm.cls}`}>{sm.label}</span>
                  {r.status === "REJECTED" && r.rejectionReason && (
                    <div className="text-[10px] text-danger-600 mt-0.5">{r.rejectionReason}</div>
                  )}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button onClick={() => onView(r)} className="text-xs text-brand-600 hover:underline mr-2">Lihat</button>
                  {(r.status === "DRAFT" || r.status === "SENT" || r.status === "ACCEPTED") && (
                    <button onClick={() => nextStatus(r)} className="text-xs text-accent-700 hover:underline font-semibold">
                      {r.status === "DRAFT" ? "→ Kirim" : r.status === "SENT" ? "→ Update" : "→ Selesai"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ===== Suppliers Tab =====
function SuppliersTab({
  suppliers, onEdit, onNew, onToggleActive, onDelete,
}: {
  suppliers: DemoSupplier[];
  onEdit: (s: DemoSupplier) => void;
  onNew: () => void;
  onToggleActive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={onNew} className="btn-primary text-sm">+ Supplier Baru</button>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {suppliers.map((s) => (
          <div key={s.id} className={`card ${!s.active ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{s.name}</div>
                <div className="text-xs text-ink-500 mt-0.5">{s.picName} · {s.phone}</div>
                {s.email && <div className="text-xs text-ink-500">📧 {s.email}</div>}
                <div className="text-[11px] text-ink-500 mt-1">{s.address}</div>
              </div>
              <div className="flex flex-col gap-1 items-end">
                {s.returnable ? (
                  <span className="badge text-[10px] bg-accent-100 text-accent-700">✓ Terima retur</span>
                ) : (
                  <span className="badge text-[10px] bg-danger-100 text-danger-700">✕ Tidak retur</span>
                )}
                {s.returnable && (
                  <span className="badge text-[10px] bg-brand-50 text-brand-700">Min ED {s.returnMinDaysBeforeED}hr</span>
                )}
              </div>
            </div>
            {s.returnNotes && (
              <div className="text-[11px] text-ink-500 italic mt-2 p-2 bg-surface-50 rounded">📋 {s.returnNotes}</div>
            )}
            <div className="flex gap-2 mt-3 pt-3 border-t border-surface-100">
              <button onClick={() => onEdit(s)} className="btn-secondary text-xs flex-1">✏️ Edit</button>
              <button onClick={() => onToggleActive(s.id)} className="btn-secondary text-xs">
                {s.active ? "🚫 Nonaktifkan" : "✓ Aktifkan"}
              </button>
              <button onClick={() => onDelete(s.id)} className="btn-secondary text-xs text-danger-600">🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== Supplier Editor Modal =====
function SupplierEditor({
  supplier, onClose, onSave,
}: {
  supplier: DemoSupplier;
  onClose: () => void;
  onSave: (s: DemoSupplier) => void;
}) {
  const [form, setForm] = useState<DemoSupplier>(supplier);
  function up<K extends keyof DemoSupplier>(k: K, v: DemoSupplier[K]) {
    setForm((c) => ({ ...c, [k]: v }));
  }
  return (
    <div className="fixed inset-0 z-[60] bg-ink-900/60 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <h2 className="text-xl font-bold">{supplier.name ? `Edit: ${supplier.name}` : "Supplier Baru"}</h2>
          <div className="grid md:grid-cols-2 gap-3 mt-4">
            <div className="md:col-span-2">
              <label className="label">Nama Supplier / Distributor</label>
              <input className="input" value={form.name} onChange={(e) => up("name", e.target.value)} placeholder="PT Kimia Farma Trading & Distribution" />
            </div>
            <div>
              <label className="label">PIC / Sales</label>
              <input className="input" value={form.picName} onChange={(e) => up("picName", e.target.value)} placeholder="Bp. Hendra" />
            </div>
            <div>
              <label className="label">Telepon</label>
              <input className="input" value={form.phone} onChange={(e) => up("phone", e.target.value)} />
            </div>
            <div>
              <label className="label">WhatsApp</label>
              <input className="input" value={form.whatsapp ?? ""} onChange={(e) => up("whatsapp", e.target.value)} />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email ?? ""} onChange={(e) => up("email", e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Alamat</label>
              <textarea className="input min-h-[60px]" value={form.address} onChange={(e) => up("address", e.target.value)} />
            </div>
            <div className="md:col-span-2 p-3 rounded-lg bg-brand-50 border border-brand-100">
              <div className="text-xs font-semibold text-brand-800 mb-2">📋 Kebijakan Retur</div>
              <label className="flex items-center gap-2 mb-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-brand-500" checked={form.returnable} onChange={(e) => up("returnable", e.target.checked)} />
                <span className="text-sm">Supplier ini menerima retur</span>
              </label>
              {form.returnable && (
                <>
                  <label className="label">Minimal sisa hari ED untuk diterima</label>
                  <input type="number" min={0} className="input" value={form.returnMinDaysBeforeED}
                    onChange={(e) => up("returnMinDaysBeforeED", parseInt(e.target.value) || 0)} />
                  <label className="label mt-2">Catatan kebijakan</label>
                  <textarea className="input min-h-[50px]" value={form.returnNotes ?? ""}
                    onChange={(e) => up("returnNotes", e.target.value)}
                    placeholder="Mis. Kemasan utuh, max 5% omzet/bulan, pickup hari Jumat." />
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-4 pt-4 border-t border-surface-100">
            <button onClick={() => onSave(form)} className="btn-primary flex-1">💾 Simpan</button>
            <button onClick={onClose} className="btn-secondary">Batal</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Return Preview / Print Surat Retur =====
function ReturnPreview({
  ret, tenant, suppliers, onClose,
}: {
  ret: DemoReturn;
  tenant: any;
  suppliers: DemoSupplier[];
  onClose: () => void;
}) {
  const supplier = suppliers.find((s) => s.id === ret.supplierId);

  function handlePrint() {
    const node = document.getElementById("rtn-print-area");
    if (!node) return;
    const w = window.open("", "_blank", "width=900,height=1200");
    if (!w) return;
    w.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${ret.noReturn}</title>
<style>
  body { font-family: 'Times New Roman', serif; padding: 32px; color: #000; line-height: 1.5; }
  h1 { text-align: center; font-size: 18px; margin: 0; text-decoration: underline; }
  h2 { text-align: center; font-size: 13px; margin: 4px 0 16px; font-weight: normal; }
  .box { border: 1px solid #000; padding: 8px 12px; margin: 8px 0; }
  .row { display: flex; gap: 8px; }
  .row .lbl { width: 140px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
  th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; }
  th { background: #f0f0f0; }
  .right { text-align: right; }
  .center { text-align: center; }
  .sig { display: flex; justify-content: space-around; margin-top: 56px; gap: 32px; }
  .sig div { text-align: center; min-width: 180px; }
  .sig .name { margin-top: 70px; border-top: 1px solid #000; padding-top: 4px; font-weight: bold; }
  @media print { @page { size: A4; margin: 1.5cm; } }
</style></head><body>${node.innerHTML}<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300);}<\/script></body></html>`);
    w.document.close();
  }

  function shareWa() {
    if (!supplier?.whatsapp) { alert("Nomor WA supplier tidak ada."); return; }
    const phone = supplier.whatsapp.replace(/\D/g, "").replace(/^0/, "62");
    const lines = [
      `*Surat Retur ${ret.noReturn}*`,
      `${tenant.name}`,
      `Tgl: ${ret.dateISO}`,
      `Alasan: ${REASON_LABEL[ret.reason]}`,
      "",
      `Item retur:`,
      ...ret.items.map((it, i) => `${i + 1}. ${it.productName} | Batch ${it.batchNo} | ${it.qty} ${it.unit} | ED ${it.expiryISO}`),
      "",
      `Total nilai: ${fmtRp(ret.totalValueRp)}`,
      ret.notes ? `\nCatatan: ${ret.notes}` : "",
    ].filter(Boolean);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  }

  return (
    <div className="fixed inset-0 z-[60] bg-ink-900/60 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-surface-100 flex items-center justify-between sticky top-0 bg-white z-10 flex-wrap gap-2">
          <div>
            <div className="font-bold">📄 {ret.noReturn}</div>
            <div className="text-xs text-ink-500">{ret.dateISO} · {ret.supplierName} · {fmtRp(ret.totalValueRp)}</div>
            <span className={`badge text-[10px] mt-1 ${STATUS_META[ret.status].cls}`}>{STATUS_META[ret.status].label}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="btn-primary text-sm">🖨 Cetak / PDF</button>
            {supplier?.whatsapp && (
              <button onClick={shareWa} className="text-sm font-medium rounded-lg px-3 bg-[#25D366] hover:bg-[#1faa55] text-white">
                💬 Kirim WA
              </button>
            )}
            <button onClick={onClose} className="btn-secondary text-sm">Tutup</button>
          </div>
        </div>

        <div id="rtn-print-area" className="p-8 bg-white text-ink-900 text-sm leading-relaxed">
          <h1>SURAT RETUR BARANG</h1>
          <h2>Nomor: {ret.noReturn}</h2>

          <div className="row" style={{ display: "flex", gap: 16, marginTop: 16 }}>
            <div className="box" style={{ flex: 1, border: "1px solid #000", padding: "8px 12px" }}>
              <div style={{ fontWeight: "bold" }}>Dari (Pengirim)</div>
              <div>{tenant.name}</div>
              <div style={{ fontSize: 11 }}>{tenant.address}</div>
              {tenant.sia && <div style={{ fontSize: 11 }}>SIA: {tenant.sia}</div>}
              <div style={{ fontSize: 11 }}>Telp: {tenant.phone}</div>
            </div>
            <div className="box" style={{ flex: 1, border: "1px solid #000", padding: "8px 12px" }}>
              <div style={{ fontWeight: "bold" }}>Kepada (Supplier)</div>
              <div>{ret.supplierName}</div>
              {supplier && (
                <>
                  <div style={{ fontSize: 11 }}>{supplier.address}</div>
                  <div style={{ fontSize: 11 }}>PIC: {supplier.picName}</div>
                  <div style={{ fontSize: 11 }}>Telp: {supplier.phone}</div>
                </>
              )}
            </div>
          </div>

          <p className="mt-3">
            Tanggal: <b>{new Date(ret.dateISO).toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" })}</b>
            {" · "}Alasan retur: <b>{REASON_LABEL[ret.reason]}</b>
          </p>

          <table>
            <thead>
              <tr>
                <th className="center" style={{ width: 32 }}>No</th>
                <th>Nama Obat</th>
                <th>No. Batch</th>
                <th>Expiry</th>
                <th className="right">Qty</th>
                <th className="right">Nilai (Rp)</th>
              </tr>
            </thead>
            <tbody>
              {ret.items.map((it, i) => (
                <tr key={i}>
                  <td className="center">{i + 1}</td>
                  <td>{it.productName}</td>
                  <td style={{ fontFamily: "monospace" }}>{it.batchNo}</td>
                  <td>{it.expiryISO}</td>
                  <td className="right">{it.qty} {it.unit}</td>
                  <td className="right">{it.valueRp.toLocaleString("id-ID")}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={5} className="right" style={{ fontWeight: "bold" }}>TOTAL NILAI RETUR</td>
                <td className="right" style={{ fontWeight: "bold" }}>Rp {ret.totalValueRp.toLocaleString("id-ID")}</td>
              </tr>
            </tbody>
          </table>

          {ret.notes && (
            <p><b>Catatan:</b> {ret.notes}</p>
          )}

          <p className="mt-4">
            Mohon konfirmasi penerimaan barang & proses penggantian/refund sesuai kebijakan yang berlaku.
            Terima kasih atas kerjasamanya.
          </p>

          <div className="sig">
            <div>
              <div>Pengirim ({tenant.name})</div>
              <div className="name">_________________</div>
            </div>
            <div>
              <div>Penerima (Supplier)</div>
              <div className="name">_________________</div>
            </div>
          </div>

          <div className="text-center text-[10px] text-ink-400 mt-12">
            Dokumen digital dari Batam Farma · {ret.noReturn} · dibuat {ret.createdAtISO}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Stats Tab =====
function StatsTab({ returns, suppliers }: { returns: DemoReturn[]; suppliers: DemoSupplier[] }) {
  const stats = useMemo(() => {
    type Row = {
      supplierId: string;
      supplierName: string;
      total: number;
      sent: number;
      accepted: number;
      rejected: number;
      completed: number;
      draft: number;
      totalValueRp: number;
      acceptedValueRp: number;
      rejectedValueRp: number;
      acceptanceRate: number; // accepted+completed / (accepted+completed+rejected) — exclude DRAFT/SENT yang masih open
      avgProcessingDays: number | null;
    };
    const map = new Map<string, Row>();
    for (const sup of suppliers) {
      map.set(sup.id, {
        supplierId: sup.id, supplierName: sup.name,
        total: 0, sent: 0, accepted: 0, rejected: 0, completed: 0, draft: 0,
        totalValueRp: 0, acceptedValueRp: 0, rejectedValueRp: 0,
        acceptanceRate: 0, avgProcessingDays: null,
      });
    }
    const procDays: Record<string, number[]> = {};
    for (const r of returns) {
      const row = map.get(r.supplierId);
      if (!row) continue;
      row.total++;
      row.totalValueRp += r.totalValueRp;
      if (r.status === "DRAFT") row.draft++;
      if (r.status === "SENT") row.sent++;
      if (r.status === "ACCEPTED") { row.accepted++; row.acceptedValueRp += r.totalValueRp; }
      if (r.status === "REJECTED") { row.rejected++; row.rejectedValueRp += r.totalValueRp; }
      if (r.status === "COMPLETED") { row.completed++; row.acceptedValueRp += r.totalValueRp; }
      if (r.acceptedAtISO && r.dateISO) {
        const d = Math.max(0, Math.round((new Date(r.acceptedAtISO).getTime() - new Date(r.dateISO).getTime()) / 86400_000));
        (procDays[r.supplierId] ||= []).push(d);
      }
    }
    for (const row of map.values()) {
      const decided = row.accepted + row.completed + row.rejected;
      row.acceptanceRate = decided > 0 ? Math.round(((row.accepted + row.completed) / decided) * 100) : 0;
      const arr = procDays[row.supplierId];
      if (arr && arr.length > 0) row.avgProcessingDays = Math.round(arr.reduce((s, x) => s + x, 0) / arr.length);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [returns, suppliers]);

  const totalAll = returns.length;
  const valueAll = returns.reduce((s, r) => s + r.totalValueRp, 0);
  const acceptedAll = returns.filter((r) => r.status === "ACCEPTED" || r.status === "COMPLETED").length;
  const rejectedAll = returns.filter((r) => r.status === "REJECTED").length;
  const decidedAll = acceptedAll + rejectedAll;
  const overallRate = decidedAll > 0 ? Math.round((acceptedAll / decidedAll) * 100) : 0;
  const recoveredValue = returns
    .filter((r) => r.status === "ACCEPTED" || r.status === "COMPLETED")
    .reduce((s, r) => s + r.totalValueRp, 0);

  if (totalAll === 0) {
    return (
      <div className="card text-center py-10">
        <div className="text-5xl mb-2">📊</div>
        <h2 className="font-semibold">Belum ada data retur</h2>
        <p className="text-sm text-ink-500 mt-1">Buat retur pertama dulu di tab "📝 Buat Retur" untuk melihat statistik di sini.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall KPIs */}
      <div className="grid md:grid-cols-4 gap-3">
        <div className="card !p-4 bg-gradient-to-br from-brand-500 to-brand-600 text-white">
          <div className="text-xs opacity-80">Total Retur</div>
          <div className="text-2xl font-bold mt-1">{totalAll}</div>
          <div className="text-xs opacity-80 mt-1">surat retur dibuat</div>
        </div>
        <div className="card !p-4">
          <div className="text-xs text-ink-500">Nilai Diretur</div>
          <div className="text-2xl font-bold mt-1">{fmtRp(valueAll)}</div>
          <div className="text-xs text-ink-500 mt-1">total nominal</div>
        </div>
        <div className="card !p-4">
          <div className="text-xs text-ink-500">Berhasil Recover</div>
          <div className="text-2xl font-bold mt-1 text-emerald-600">{fmtRp(recoveredValue)}</div>
          <div className="text-xs text-ink-500 mt-1">{acceptedAll} retur diterima/selesai</div>
        </div>
        <div className="card !p-4">
          <div className="text-xs text-ink-500">Acceptance Rate</div>
          <div className="text-2xl font-bold mt-1">
            <span className={overallRate >= 80 ? "text-emerald-600" : overallRate >= 50 ? "text-orange-600" : "text-danger-600"}>
              {overallRate}%
            </span>
          </div>
          <div className="text-xs text-ink-500 mt-1">{acceptedAll} diterima · {rejectedAll} ditolak</div>
        </div>
      </div>

      {/* Per supplier table */}
      <div className="card">
        <h2 className="font-semibold">📋 Per Supplier</h2>
        <p className="text-xs text-ink-500 mt-0.5">
          Evaluasi kualitas distributor — tingkat penerimaan tinggi & proses cepat = supplier terpercaya.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 text-left text-xs text-ink-500">
              <tr>
                <th className="p-2">Supplier</th>
                <th className="p-2 text-right">Total Retur</th>
                <th className="p-2 text-right">Nilai</th>
                <th className="p-2 text-right">Diterima</th>
                <th className="p-2 text-right">Ditolak</th>
                <th className="p-2 text-right">Open</th>
                <th className="p-2 text-right">Acceptance</th>
                <th className="p-2 text-right">Avg Proses</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {stats.map((r) => {
                const open = r.draft + r.sent;
                const rateColor = r.acceptanceRate >= 80 ? "text-emerald-600" : r.acceptanceRate >= 50 ? "text-orange-600" : "text-danger-600";
                return (
                  <tr key={r.supplierId}>
                    <td className="p-2 font-medium">🏭 {r.supplierName}</td>
                    <td className="p-2 text-right font-semibold">{r.total}</td>
                    <td className="p-2 text-right">{fmtRp(r.totalValueRp)}</td>
                    <td className="p-2 text-right text-emerald-700">{r.accepted + r.completed}</td>
                    <td className="p-2 text-right text-danger-600">{r.rejected}</td>
                    <td className="p-2 text-right text-ink-500">{open}</td>
                    <td className={`p-2 text-right font-semibold ${rateColor}`}>
                      {r.accepted + r.rejected + r.completed > 0 ? `${r.acceptanceRate}%` : "—"}
                    </td>
                    <td className="p-2 text-right text-ink-600">
                      {r.avgProcessingDays !== null ? `${r.avgProcessingDays} hari` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-[11px] text-ink-400">
          💡 <b>Acceptance rate</b> = (diterima + selesai) ÷ (diterima + selesai + ditolak). Draft & terkirim belum dihitung. ·
          {" "}<b>Avg proses</b> = rata-rata hari dari kirim ke diterima.
        </div>
      </div>

      {/* Reasons breakdown */}
      <div className="card">
        <h2 className="font-semibold">🔍 Alasan Retur</h2>
        <div className="mt-3 grid sm:grid-cols-2 md:grid-cols-3 gap-2">
          {(Object.keys(REASON_LABEL) as DemoReturnReason[]).map((reason) => {
            const list = returns.filter((r) => r.reason === reason);
            if (list.length === 0) return null;
            const value = list.reduce((s, r) => s + r.totalValueRp, 0);
            const pct = Math.round((list.length / totalAll) * 100);
            return (
              <div key={reason} className="border border-surface-100 rounded-lg p-3">
                <div className="text-xs text-ink-500">{REASON_LABEL[reason]}</div>
                <div className="text-lg font-bold mt-1">{list.length} <span className="text-xs text-ink-400 font-normal">({pct}%)</span></div>
                <div className="text-xs text-ink-500 mt-0.5">{fmtRp(value)}</div>
                <div className="h-1.5 bg-surface-100 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-brand-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

