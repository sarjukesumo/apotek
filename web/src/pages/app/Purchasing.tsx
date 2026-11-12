// Modul Pembelian: Purchase Order (PO) + Goods Receipt Note (GRN) + HPP per batch.
// Workflow:
// 1. Tab "PO": buat PO ke supplier dengan harga beli per item.
// 2. Tab "GRN": terima barang dari PO (atau langsung), input batch+ED+costPrice → batch baru otomatis ditambahkan ke produk dengan supplierId+costPrice.
// 3. AP (hutang supplier) otomatis dibuat saat GRN diposting → tab Akuntansi akan menampilkan.

import { useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import { useDemoStore, type DemoPO, type DemoPOItem, type DemoPOStatus, type DemoGRNItem } from "../../lib/demoStore";

const STATUS_META: Record<DemoPOStatus, { l: string; cls: string }> = {
  DRAFT:     { l: "Draft",      cls: "bg-surface-100 text-ink-700" },
  SENT:      { l: "Terkirim",   cls: "bg-brand-100 text-brand-700" },
  PARTIAL:   { l: "Parsial",    cls: "bg-warn-100 text-warn-700" },
  RECEIVED:  { l: "Diterima",   cls: "bg-emerald-100 text-emerald-700" },
  CANCELLED: { l: "Dibatalkan", cls: "bg-danger-100 text-danger-700" },
};

const fmtRp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const today = () => new Date().toISOString().slice(0, 10);

export function Purchasing() {
  const tenantId = useAuth((s) => s.claims?.tenantId) ?? "";
  const products = useDemoStore((s) => s.products.filter((p) => p.tenantId === tenantId));
  const suppliers = useDemoStore((s) => s.suppliers.filter((s) => s.tenantId === tenantId && s.active));
  const pos = useDemoStore((s) => s.pos_pesanan.filter((p) => p.tenantId === tenantId));
  const grns = useDemoStore((s) => s.grns.filter((g) => g.tenantId === tenantId));
  const addPO = useDemoStore((s) => s.addPO);
  const updatePOStatus = useDemoStore((s) => s.updatePOStatus);
  const addGRN = useDemoStore((s) => s.addGRN);

  const [tab, setTab] = useState<"po" | "grn" | "new-po" | "new-grn">("po");
  const [grnForPO, setGrnForPO] = useState<DemoPO | null>(null);

  const totals = useMemo(() => {
    const open = pos.filter((p) => ["SENT", "PARTIAL"].includes(p.status));
    const valueOpen = open.reduce((s, p) => s + p.totalRp, 0);
    const valueReceived = grns.reduce((s, g) => s + g.totalRp, 0);
    return { totalPO: pos.length, totalGRN: grns.length, openPO: open.length, valueOpen, valueReceived };
  }, [pos, grns]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">📥 Pembelian (PO &amp; Penerimaan)</h1>
        <p className="text-ink-500 text-sm mt-0.5">PO ke supplier, terima barang dengan HPP per batch, AP otomatis dibuat.</p>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <div className="card !p-4"><div className="text-xs text-ink-500">Total PO</div><div className="text-2xl font-bold mt-1">{totals.totalPO}</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">PO Berjalan</div><div className="text-2xl font-bold mt-1 text-warn-600">{totals.openPO}</div><div className="text-xs text-ink-500 mt-1">{fmtRp(totals.valueOpen)} pending</div></div>
        <div className="card !p-4"><div className="text-xs text-ink-500">Total GRN</div><div className="text-2xl font-bold mt-1">{totals.totalGRN}</div></div>
        <div className="card !p-4 bg-gradient-to-br from-brand-500 to-brand-600 text-white"><div className="text-xs opacity-80">Nilai Diterima</div><div className="text-2xl font-bold mt-1">{fmtRp(totals.valueReceived)}</div><div className="text-xs opacity-80 mt-1">→ AP Hutang</div></div>
      </div>

      <div className="flex gap-1 bg-surface-100 rounded-lg p-1 w-fit flex-wrap">
        {[
          { k: "po", l: `📋 Daftar PO (${pos.length})` },
          { k: "grn", l: `📦 Riwayat GRN (${grns.length})` },
          { k: "new-po", l: "➕ PO Baru" },
          { k: "new-grn", l: "➕ GRN Langsung" },
        ].map((t) => (
          <button key={t.k} onClick={() => { setTab(t.k as any); setGrnForPO(null); }}
            className={`px-3 py-1.5 text-sm rounded-md ${tab === t.k ? "bg-white text-brand-700 font-semibold shadow-sm" : "text-ink-500"}`}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === "po" && (
        <div className="card">
          {pos.length === 0 && <div className="text-center py-10 text-ink-500"><div className="text-5xl mb-2">📋</div>Belum ada PO. Klik <b>➕ PO Baru</b>.</div>}
          {pos.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-left text-xs text-ink-500">
                <tr><th className="p-2">No PO</th><th className="p-2">Tanggal</th><th className="p-2">Supplier</th><th className="p-2 text-right">Item</th><th className="p-2 text-right">Total</th><th className="p-2">Status</th><th className="p-2 text-right">Aksi</th></tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {pos.slice().sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO)).map((p) => {
                  const m = STATUS_META[p.status];
                  return (
                    <tr key={p.id}>
                      <td className="p-2 font-mono text-xs">{p.noPO}</td>
                      <td className="p-2">{p.dateISO}</td>
                      <td className="p-2">{p.supplierName}</td>
                      <td className="p-2 text-right">{p.items.length}</td>
                      <td className="p-2 text-right font-semibold">{fmtRp(p.totalRp)}</td>
                      <td className="p-2"><span className={`badge text-[10px] ${m.cls}`}>{m.l}</span></td>
                      <td className="p-2 text-right">
                        {p.status === "DRAFT" && <button onClick={() => updatePOStatus(p.id, "SENT")} className="text-xs text-brand-600 hover:underline mr-2">→ Kirim</button>}
                        {(p.status === "SENT" || p.status === "PARTIAL") && <button onClick={() => { setGrnForPO(p); setTab("new-grn"); }} className="text-xs text-emerald-600 hover:underline mr-2">→ Terima (GRN)</button>}
                        {(p.status === "DRAFT" || p.status === "SENT") && <button onClick={() => { if (confirm("Batalkan PO?")) updatePOStatus(p.id, "CANCELLED"); }} className="text-xs text-danger-500 hover:underline">batal</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "grn" && (
        <div className="card">
          {grns.length === 0 && <div className="text-center py-10 text-ink-500"><div className="text-5xl mb-2">📦</div>Belum ada GRN. Terima barang dari PO atau klik <b>➕ GRN Langsung</b>.</div>}
          {grns.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-left text-xs text-ink-500">
                <tr><th className="p-2">No GRN</th><th className="p-2">Tanggal</th><th className="p-2">Supplier</th><th className="p-2">Ref PO</th><th className="p-2 text-right">Item</th><th className="p-2 text-right">Total</th><th className="p-2">Penerima</th></tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {grns.slice().sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO)).map((g) => (
                  <tr key={g.id}>
                    <td className="p-2 font-mono text-xs">{g.noGRN}</td>
                    <td className="p-2">{g.dateISO}</td>
                    <td className="p-2">{g.supplierName}</td>
                    <td className="p-2 text-xs text-ink-500">{g.poId ? pos.find((p) => p.id === g.poId)?.noPO ?? "-" : "(tanpa PO)"}</td>
                    <td className="p-2 text-right">{g.items.length}</td>
                    <td className="p-2 text-right font-semibold">{fmtRp(g.totalRp)}</td>
                    <td className="p-2 text-xs">{g.receivedByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "new-po" && <NewPOForm tenantId={tenantId} suppliers={suppliers} products={products}
        onSubmit={(payload) => { addPO(payload); setTab("po"); }} />}

      {tab === "new-grn" && <NewGRNForm tenantId={tenantId} suppliers={suppliers} products={products} fromPO={grnForPO}
        onSubmit={(payload) => { addGRN(payload); setGrnForPO(null); setTab("grn"); }} />}
    </div>
  );
}

// ===== New PO Form =====
function NewPOForm({ tenantId, suppliers, products, onSubmit }: {
  tenantId: string;
  suppliers: ReturnType<typeof useDemoStore.getState>["suppliers"];
  products: ReturnType<typeof useDemoStore.getState>["products"];
  onSubmit: (p: Omit<DemoPO, "id" | "createdAtISO" | "noPO" | "supplierName">) => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [dateISO, setDateISO] = useState(today());
  const [expectedDateISO, setExpectedDateISO] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DemoPOItem[]>([]);

  const add = (productId: string) => {
    const p = products.find((x) => x.id === productId); if (!p) return;
    if (items.some((it) => it.productId === productId)) return;
    setItems([...items, { productId, productName: p.name, unit: p.unit, qty: 10, costPrice: Math.round(p.price * 0.7), subtotalRp: 10 * Math.round(p.price * 0.7), receivedQty: 0 }]);
  };
  const updateItem = (idx: number, patch: Partial<DemoPOItem>) => setItems((arr) => arr.map((it, i) => i === idx ? { ...it, ...patch, subtotalRp: (patch.qty ?? it.qty) * (patch.costPrice ?? it.costPrice) } : it));
  const removeItem = (idx: number) => setItems((arr) => arr.filter((_, i) => i !== idx));

  const total = items.reduce((s, it) => s + it.subtotalRp, 0);
  const valid = supplierId && items.length > 0 && items.every((it) => it.qty > 0 && it.costPrice >= 0);

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold">➕ Buat Purchase Order</h2>
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-ink-500">Supplier *</label>
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— Pilih supplier —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div><label className="text-xs text-ink-500">Tanggal PO</label><input type="date" className="input" value={dateISO} onChange={(e) => setDateISO(e.target.value)} /></div>
        <div><label className="text-xs text-ink-500">Estimasi datang</label><input type="date" className="input" value={expectedDateISO} onChange={(e) => setExpectedDateISO(e.target.value)} /></div>
      </div>

      <div>
        <label className="text-xs text-ink-500">Tambah produk</label>
        <select className="input" value="" onChange={(e) => { add(e.target.value); e.currentTarget.value = ""; }}>
          <option value="">— Pilih produk untuk ditambahkan —</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {items.length > 0 && (
        <div className="rounded-xl border border-surface-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 text-xs text-ink-500">
              <tr><th className="p-2 text-left">Produk</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Harga Beli</th><th className="p-2 text-right">Subtotal</th><th></th></tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {items.map((it, idx) => (
                <tr key={it.productId}>
                  <td className="p-2">{it.productName} <span className="text-xs text-ink-400">/ {it.unit}</span></td>
                  <td className="p-2"><input type="number" min={1} className="input !w-20 text-right" value={it.qty} onChange={(e) => updateItem(idx, { qty: +e.target.value || 0 })} /></td>
                  <td className="p-2"><input type="number" min={0} className="input !w-32 text-right" value={it.costPrice} onChange={(e) => updateItem(idx, { costPrice: +e.target.value || 0 })} /></td>
                  <td className="p-2 text-right font-semibold">{fmtRp(it.subtotalRp)}</td>
                  <td className="p-2"><button onClick={() => removeItem(idx)} className="text-xs text-danger-500">×</button></td>
                </tr>
              ))}
              <tr className="bg-brand-50 font-bold"><td colSpan={3} className="p-2 text-right">TOTAL</td><td className="p-2 text-right">{fmtRp(total)}</td><td></td></tr>
            </tbody>
          </table>
        </div>
      )}

      <textarea className="input" placeholder="Catatan untuk supplier (opsional)…" value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="flex gap-2 justify-end">
        <button disabled={!valid} onClick={() => onSubmit({ tenantId, supplierId, dateISO, expectedDateISO: expectedDateISO || undefined, status: "DRAFT", items, totalRp: total, notes: notes || undefined })} className="btn-secondary text-sm disabled:opacity-50">💾 Simpan Draft</button>
        <button disabled={!valid} onClick={() => onSubmit({ tenantId, supplierId, dateISO, expectedDateISO: expectedDateISO || undefined, status: "SENT", items, totalRp: total, notes: notes || undefined })} className="btn-primary text-sm disabled:opacity-50">📤 Kirim PO</button>
      </div>
    </div>
  );
}

// ===== New GRN Form =====
function NewGRNForm({ tenantId, suppliers, products, fromPO, onSubmit }: {
  tenantId: string;
  suppliers: ReturnType<typeof useDemoStore.getState>["suppliers"];
  products: ReturnType<typeof useDemoStore.getState>["products"];
  fromPO: DemoPO | null;
  onSubmit: (g: Omit<import("../../lib/demoStore").DemoGRN, "id" | "createdAtISO" | "noGRN" | "supplierName">) => void;
}) {
  const [supplierId, setSupplierId] = useState(fromPO?.supplierId ?? "");
  const [dateISO, setDateISO] = useState(today());
  const [receivedByName, setReceivedByName] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DemoGRNItem[]>(
    fromPO ? fromPO.items.filter((it) => it.qty - it.receivedQty > 0).map((it) => ({
      productId: it.productId, productName: it.productName, unit: it.unit,
      batchNo: "", qty: it.qty - it.receivedQty,
      expiryISO: "", costPrice: it.costPrice,
      subtotalRp: (it.qty - it.receivedQty) * it.costPrice,
    })) : []
  );
  const [showOCR, setShowOCR] = useState(false);

  const add = (productId: string) => {
    const p = products.find((x) => x.id === productId); if (!p) return;
    setItems([...items, { productId, productName: p.name, unit: p.unit, batchNo: "", qty: 1, expiryISO: "", costPrice: Math.round(p.price * 0.7), subtotalRp: Math.round(p.price * 0.7) }]);
  };
  const updateItem = (idx: number, patch: Partial<DemoGRNItem>) => setItems((arr) => arr.map((it, i) => i === idx ? { ...it, ...patch, subtotalRp: (patch.qty ?? it.qty) * (patch.costPrice ?? it.costPrice) } : it));
  const removeItem = (idx: number) => setItems((arr) => arr.filter((_, i) => i !== idx));

  // Apply OCR result: replace supplier + items, keep tanggal/penerima manual
  const applyOCR = (data: OCRResult) => {
    if (data.supplierId) setSupplierId(data.supplierId);
    if (data.invoiceDateISO) setDateISO(data.invoiceDateISO);
    if (data.notes) setNotes(data.notes);
    setItems(data.items);
    setShowOCR(false);
  };

  const total = items.reduce((s, it) => s + it.subtotalRp, 0);
  const valid = supplierId && receivedByName && items.length > 0 && items.every((it) => it.qty > 0 && it.batchNo && it.expiryISO);

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-semibold">📦 Penerimaan Barang (GRN) {fromPO && <span className="text-xs text-brand-600 font-normal">dari PO {fromPO.noPO}</span>}</h2>
        {!fromPO && (
          <button onClick={() => setShowOCR(true)} className="text-sm px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow hover:shadow-md flex items-center gap-2">
            📸 <span>Upload Faktur (OCR)</span>
            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded uppercase font-bold">cepat</span>
          </button>
        )}
      </div>
      {!fromPO && (
        <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-xs text-violet-700 flex items-start gap-2">
          <span className="text-lg">⚡</span>
          <div>
            <b>Input faktur kini lebih cepat — tanpa human error.</b><br />
            Cukup foto faktur supplier, upload, sistem akan otomatis mengisi supplier, item, batch, ED, qty, dan HPP. Anda tinggal verifikasi 1-2 field lalu posting. Hemat 5-10 menit per faktur.
          </div>
        </div>
      )}
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-ink-500">Supplier *</label>
          <select className="input" disabled={!!fromPO} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— Pilih —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div><label className="text-xs text-ink-500">Tanggal terima</label><input type="date" className="input" value={dateISO} onChange={(e) => setDateISO(e.target.value)} /></div>
        <div><label className="text-xs text-ink-500">Diterima oleh *</label><input className="input" placeholder="Nama penerima" value={receivedByName} onChange={(e) => setReceivedByName(e.target.value)} /></div>
      </div>

      {!fromPO && (
        <div>
          <label className="text-xs text-ink-500">Tambah produk manual</label>
          <select className="input" value="" onChange={(e) => { add(e.target.value); e.currentTarget.value = ""; }}>
            <option value="">— Pilih produk yang diterima —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      {items.length > 0 && (
        <div className="rounded-xl border border-surface-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 text-xs text-ink-500">
              <tr>
                <th className="p-2 text-left">Produk</th>
                <th className="p-2 text-left">No. Batch</th>
                <th className="p-2 text-left">Expiry</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-right">HPP/unit</th>
                <th className="p-2 text-right">Subtotal</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td className="p-2 text-xs">{it.productName}</td>
                  <td className="p-2"><input className="input !w-32 font-mono text-xs" value={it.batchNo} onChange={(e) => updateItem(idx, { batchNo: e.target.value.toUpperCase() })} placeholder="ABC-2027" /></td>
                  <td className="p-2"><input type="date" className="input !w-36" value={it.expiryISO} onChange={(e) => updateItem(idx, { expiryISO: e.target.value })} /></td>
                  <td className="p-2"><input type="number" min={1} className="input !w-20 text-right" value={it.qty} onChange={(e) => updateItem(idx, { qty: +e.target.value || 0 })} /></td>
                  <td className="p-2"><input type="number" min={0} className="input !w-28 text-right" value={it.costPrice} onChange={(e) => updateItem(idx, { costPrice: +e.target.value || 0 })} /></td>
                  <td className="p-2 text-right font-semibold">{fmtRp(it.subtotalRp)}</td>
                  <td className="p-2">{!fromPO && <button onClick={() => removeItem(idx)} className="text-xs text-danger-500">×</button>}</td>
                </tr>
              ))}
              <tr className="bg-brand-50 font-bold"><td colSpan={5} className="p-2 text-right">TOTAL HPP</td><td className="p-2 text-right">{fmtRp(total)}</td><td></td></tr>
            </tbody>
          </table>
        </div>
      )}

      <textarea className="input" placeholder="Catatan penerimaan…" value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-700">
        💡 Saat disimpan: batch baru otomatis ditambahkan ke produk dengan <b>HPP per batch</b>, dan <b>AP (hutang supplier)</b> otomatis dibuat (jatuh tempo 30 hari).
      </div>

      <div className="flex gap-2 justify-end">
        <button disabled={!valid} onClick={() => onSubmit({ tenantId, supplierId, poId: fromPO?.id, dateISO, items, totalRp: total, receivedByName, notes: notes || undefined })} className="btn-primary text-sm disabled:opacity-50">✅ Posting Penerimaan</button>
      </div>

      {showOCR && (
        <OCRFakturModal
          suppliers={suppliers}
          products={products}
          onClose={() => setShowOCR(false)}
          onApply={applyOCR}
        />
      )}
    </div>
  );
}

// ====== OCR Faktur Modal ======
type OCRConfidence = "high" | "medium" | "low";
type OCRItemRow = DemoGRNItem & { confidence: OCRConfidence };
interface OCRResult {
  supplierId: string;
  supplierGuess: string;
  invoiceNo: string;
  invoiceDateISO: string;
  items: DemoGRNItem[];
  notes?: string;
}

function OCRFakturModal({ suppliers, products, onClose, onApply }: {
  suppliers: ReturnType<typeof useDemoStore.getState>["suppliers"];
  products: ReturnType<typeof useDemoStore.getState>["products"];
  onClose: () => void;
  onApply: (r: OCRResult) => void;
}) {
  const [step, setStep] = useState<"upload" | "processing" | "review">("upload");
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [supplierGuess, setSupplierGuess] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDateISO, setInvoiceDateISO] = useState(today());
  const [rows, setRows] = useState<OCRItemRow[]>([]);

  const onFile = (file: File) => {
    setFileName(file.name);
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    setStep("processing");
    // Simulasi OCR 1.5 detik
    setTimeout(() => runMockOCR(), 1500);
  };

  const runMockOCR = () => {
    // Mock: pilih supplier acak, generate 3-5 item dari produk yang ada
    const supplier = suppliers[Math.floor(Math.random() * Math.max(suppliers.length, 1))];
    setSupplierId(supplier?.id ?? "");
    setSupplierGuess(supplier?.name ?? "Tidak terdeteksi");
    const yyyy = new Date().getFullYear();
    setInvoiceNo(`INV/${yyyy}/${String(Math.floor(Math.random() * 9000) + 1000)}`);
    setInvoiceDateISO(new Date(Date.now() - Math.floor(Math.random() * 5) * 86400_000).toISOString().slice(0, 10));

    const n = Math.min(products.length, 3 + Math.floor(Math.random() * 3));
    const picks: typeof products = [];
    const pool = [...products];
    for (let i = 0; i < n && pool.length > 0; i++) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);

    const ocrRows: OCRItemRow[] = picks.map((p, i) => {
      const qty = (1 + Math.floor(Math.random() * 5)) * 10;
      const costPrice = Math.round(p.price * (0.55 + Math.random() * 0.2));
      const yearsOut = 1 + Math.floor(Math.random() * 2);
      const expiryISO = new Date(Date.UTC(yyyy + yearsOut, Math.floor(Math.random() * 12), 1)).toISOString().slice(0, 10);
      const batchNo = `${p.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase()}-${String(yyyy + yearsOut).slice(-2)}${String(Math.floor(Math.random() * 99)).padStart(2, "0")}`;
      // Simulasi tingkat keyakinan: nama high, batch medium, exp medium, harga high
      const confidence: OCRConfidence = i === 1 ? "medium" : i === picks.length - 1 ? "low" : "high";
      return {
        productId: p.id, productName: p.name, unit: p.unit,
        batchNo, expiryISO, qty, costPrice,
        subtotalRp: qty * costPrice,
        confidence,
      };
    });
    setRows(ocrRows);
    setStep("review");
  };

  const updateRow = (idx: number, patch: Partial<OCRItemRow>) => setRows((arr) => arr.map((r, i) => i === idx ? { ...r, ...patch, subtotalRp: (patch.qty ?? r.qty) * (patch.costPrice ?? r.costPrice) } : r));
  const removeRow = (idx: number) => setRows((arr) => arr.filter((_, i) => i !== idx));

  const total = rows.reduce((s, r) => s + r.subtotalRp, 0);
  const lowCount = rows.filter((r) => r.confidence === "low").length;
  const medCount = rows.filter((r) => r.confidence === "medium").length;

  const apply = () => {
    onApply({
      supplierId, supplierGuess, invoiceNo, invoiceDateISO,
      items: rows.map(({ confidence, ...rest }) => rest),
      notes: `Faktur ${invoiceNo} (OCR dari ${fileName})`,
    });
  };

  const confBadge = (c: OCRConfidence) => c === "high"
    ? <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">✓ yakin</span>
    : c === "medium"
    ? <span className="text-[10px] bg-warn-100 text-warn-700 px-1.5 py-0.5 rounded">⚠ cek</span>
    : <span className="text-[10px] bg-danger-100 text-danger-700 px-1.5 py-0.5 rounded">⚠ verifikasi</span>;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-surface-100 bg-gradient-to-r from-violet-600 to-purple-600 text-white flex justify-between items-center">
          <div>
            <h2 className="font-bold flex items-center gap-2">📸 Upload Faktur Supplier <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded uppercase">OCR Beta</span></h2>
            <p className="text-xs opacity-90 mt-0.5">Foto faktur → ekstrak otomatis → verifikasi → posting GRN. Cepat, tanpa human error.</p>
          </div>
          <button onClick={onClose} className="text-2xl hover:bg-white/10 w-9 h-9 rounded-full">×</button>
        </div>

        {/* Stepper */}
        <div className="px-5 py-3 bg-surface-50 border-b border-surface-100 flex items-center gap-3 text-xs">
          {[
            { k: "upload", l: "1. Foto / Upload" },
            { k: "processing", l: "2. Proses OCR" },
            { k: "review", l: "3. Review & Apply" },
          ].map((s, i) => {
            const idx = ["upload", "processing", "review"].indexOf(step);
            const done = i < idx;
            const cur = i === idx;
            return (
              <div key={s.k} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full grid place-items-center font-bold text-[11px] ${done ? "bg-emerald-500 text-white" : cur ? "bg-violet-600 text-white" : "bg-surface-200 text-ink-400"}`}>{done ? "✓" : i + 1}</div>
                <span className={cur ? "font-semibold text-violet-700" : done ? "text-ink-700" : "text-ink-400"}>{s.l}</span>
                {i < 2 && <span className="text-ink-300 mx-1">→</span>}
              </div>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {step === "upload" && (
            <div className="space-y-4">
              <label className="block border-2 border-dashed border-violet-300 hover:border-violet-500 rounded-2xl p-10 text-center cursor-pointer bg-violet-50/30 hover:bg-violet-50 transition-colors">
                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
                <div className="text-6xl mb-3">📸</div>
                <div className="font-semibold text-violet-700">Klik untuk pilih foto/scan faktur</div>
                <div className="text-xs text-ink-500 mt-1">JPG, PNG, atau PDF · maks 10MB · bisa juga drag-drop</div>
                <div className="text-[11px] text-ink-400 mt-3">💡 Tip: foto faktur dari atas (top-down), pastikan teks terbaca jelas, hindari bayangan.</div>
              </label>
              <div className="grid md:grid-cols-3 gap-3">
                {[
                  { e: "🎯", t: "Akurat", d: "Auto-match ke master supplier & produk Anda" },
                  { e: "⚡", t: "Cepat", d: "Hemat 5-10 menit per faktur vs input manual" },
                  { e: "👁", t: "Aman", d: "Field rendah keyakinan ditandai untuk diverifikasi" },
                ].map((f) => (
                  <div key={f.t} className="bg-surface-50 rounded-xl p-3 text-sm"><div className="text-2xl">{f.e}</div><div className="font-semibold mt-1">{f.t}</div><div className="text-xs text-ink-500">{f.d}</div></div>
                ))}
              </div>
            </div>
          )}

          {step === "processing" && (
            <div className="grid md:grid-cols-2 gap-5 items-center">
              <div className="bg-ink-900 rounded-xl overflow-hidden grid place-items-center min-h-[300px]">
                {imgUrl && <img src={imgUrl} alt="Faktur" className="max-h-[400px] object-contain" />}
              </div>
              <div className="text-center">
                <div className="inline-block w-16 h-16 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin mb-4" />
                <div className="font-bold text-lg text-violet-700">Menganalisa Faktur…</div>
                <div className="text-sm text-ink-500 mt-2">Mendeteksi supplier, no faktur, item, batch, expiry, qty, dan harga.</div>
                <div className="text-xs text-ink-400 mt-3 font-mono">{fileName}</div>
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="grid md:grid-cols-[280px_1fr] gap-5">
              <div className="space-y-3">
                <div className="bg-ink-900 rounded-xl overflow-hidden">
                  {imgUrl && <img src={imgUrl} alt="Faktur" className="w-full max-h-[300px] object-contain" />}
                </div>
                <div className="text-[11px] text-ink-500 text-center">📎 {fileName}</div>
                <button onClick={() => { setStep("upload"); setImgUrl(null); }} className="text-xs text-violet-600 hover:underline w-full">↻ Ganti foto</button>
              </div>
              <div className="space-y-3">
                <div className={`rounded-lg p-3 text-xs flex items-start gap-2 ${(lowCount + medCount) > 0 ? "bg-warn-50 border border-warn-200 text-warn-700" : "bg-emerald-50 border border-emerald-200 text-emerald-700"}`}>
                  <span className="text-lg">{(lowCount + medCount) > 0 ? "⚠" : "✓"}</span>
                  <div>
                    {(lowCount + medCount) > 0
                      ? <>Verifikasi <b>{lowCount} field rendah</b> & <b>{medCount} field menengah</b> di bawah sebelum apply.</>
                      : <>Semua field terdeteksi dengan keyakinan tinggi. Cek lalu apply.</>
                    }
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-ink-500 uppercase tracking-wide">Supplier {confBadge("high")}</label>
                    <select className="input !text-sm" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                      <option value="">— pilih —</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <div className="text-[10px] text-ink-400 mt-0.5">Terdeteksi: <i>{supplierGuess}</i></div>
                  </div>
                  <div>
                    <label className="text-[10px] text-ink-500 uppercase tracking-wide">No Faktur {confBadge("medium")}</label>
                    <input className="input !text-sm font-mono" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] text-ink-500 uppercase tracking-wide">Tanggal Faktur {confBadge("high")}</label>
                    <input type="date" className="input !text-sm" value={invoiceDateISO} onChange={(e) => setInvoiceDateISO(e.target.value)} />
                  </div>
                </div>

                <div className="rounded-xl border border-surface-100 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-50 text-[10px] uppercase text-ink-500">
                      <tr>
                        <th className="p-2 text-left">Produk</th>
                        <th className="p-2 text-left">Batch</th>
                        <th className="p-2 text-left">ED</th>
                        <th className="p-2 text-right">Qty</th>
                        <th className="p-2 text-right">HPP</th>
                        <th className="p-2 text-right">Subtotal</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {rows.map((r, i) => (
                        <tr key={i} className={r.confidence === "low" ? "bg-danger-50/50" : r.confidence === "medium" ? "bg-warn-50/30" : ""}>
                          <td className="p-2"><div className="text-xs font-medium">{r.productName}</div>{confBadge(r.confidence)}</td>
                          <td className="p-2"><input className="input !w-28 !text-xs font-mono" value={r.batchNo} onChange={(e) => updateRow(i, { batchNo: e.target.value.toUpperCase() })} /></td>
                          <td className="p-2"><input type="date" className="input !w-32 !text-xs" value={r.expiryISO} onChange={(e) => updateRow(i, { expiryISO: e.target.value })} /></td>
                          <td className="p-2"><input type="number" min={1} className="input !w-16 !text-xs text-right" value={r.qty} onChange={(e) => updateRow(i, { qty: +e.target.value || 0 })} /></td>
                          <td className="p-2"><input type="number" min={0} className="input !w-24 !text-xs text-right" value={r.costPrice} onChange={(e) => updateRow(i, { costPrice: +e.target.value || 0 })} /></td>
                          <td className="p-2 text-right text-xs font-semibold">{fmtRp(r.subtotalRp)}</td>
                          <td className="p-2"><button onClick={() => removeRow(i)} className="text-xs text-danger-500">×</button></td>
                        </tr>
                      ))}
                      {rows.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-ink-400 text-xs">Tidak ada item terdeteksi.</td></tr>}
                      <tr className="bg-violet-50 font-bold"><td colSpan={5} className="p-2 text-right">TOTAL FAKTUR</td><td className="p-2 text-right text-violet-700">{fmtRp(total)}</td><td></td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-surface-100 px-5 py-3 bg-surface-50 flex justify-between items-center">
          <div className="text-[11px] text-ink-500">
            {step === "review" && <>🔒 OCR berjalan lokal (demo). Faktur asli tidak diunggah ke server.</>}
            {step === "upload" && <>Demo OCR — hasil akan di-mock berdasarkan supplier &amp; produk Anda.</>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">Batal</button>
            {step === "review" && (
              <button onClick={apply} disabled={!supplierId || rows.length === 0} className="text-sm px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow hover:shadow-md disabled:opacity-50">
                ✅ Apply ke Form GRN ({rows.length} item)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
