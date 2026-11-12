import { useEffect, useMemo, useState, type FormEvent } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { useAuth } from "../../lib/auth";
import { loadTenantInventory, loadTenantSuppliers } from "../../lib/inventoryRepository";
import { batchZone, daysToExpiry } from "../../lib/fefo";
import type { DemoProduct } from "../../lib/demoStore";
import type { ImportSupplier } from "../../lib/inventoryCsv";
import { db } from "../../lib/firebase";
import { createSupplierReturn, type SupplierReturnReason } from "../../lib/supplierReturnRepository";

type ReturnRecord = {
  id: string;
  supplierName: string;
  productName: string;
  batchNo: string;
  qty: number;
  valueRp: number | null;
  reason: SupplierReturnReason;
  status: string;
  createdAt?: { toDate?: () => Date };
};

const REASONS: Array<{ value: SupplierReturnReason; label: string }> = [
  { value: "NEAR_EXPIRY", label: "Mendekati kedaluwarsa" },
  { value: "DAMAGED", label: "Rusak" },
  { value: "WRONG_ITEM", label: "Barang tidak sesuai" },
  { value: "RECALL", label: "Recall produk" },
  { value: "OVERSTOCK", label: "Kelebihan stok" },
  { value: "OTHER", label: "Lainnya" },
];

const rupiah = (value: number) => `Rp ${Math.round(value || 0).toLocaleString("id-ID")}`;

export function LiveSupplierReturns() {
  const tenantId = useAuth((state) => state.claims?.tenantId || "");
  const user = useAuth((state) => state.user);
  const [suppliers, setSuppliers] = useState<ImportSupplier[]>([]);
  const [products, setProducts] = useState<DemoProduct[]>([]);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState<SupplierReturnReason>("NEAR_EXPIRY");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [supplierRows, inventory, returnSnapshot] = await Promise.all([
        loadTenantSuppliers(tenantId),
        loadTenantInventory(tenantId),
        getDocs(query(collection(db, `tenants/${tenantId}/supplierReturns`), orderBy("createdAt", "desc"), limit(100))),
      ]);
      setSuppliers(supplierRows);
      setProducts(inventory.products);
      setReturns(returnSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as ReturnRecord)));
      setError(null);
    } catch {
      setError("Data retur gagal dimuat dari Firebase.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [tenantId]);

  const eligibleSuppliers = suppliers.filter((supplier) => supplier.active && supplier.returnable);
  const eligibleBatches = useMemo(() => products.flatMap((product) => product.batches
    .filter((batch) => batch.supplierId === supplierId && batch.sourceType === "PURCHASE" && batch.qty > 0)
    .filter((batch) => batchZone(batch.expiryISO) !== "EXPIRED")
    .filter((batch) => daysToExpiry(batch.expiryISO) >= (suppliers.find((supplier) => supplier.id === supplierId)?.returnMinDaysBeforeED || 0))
    .map((batch) => ({ ...batch, productId: product.id, productName: product.name, unit: product.unit }))),
  [products, supplierId, suppliers]);

  const selectedBatch = eligibleBatches.find((batch) => batch.id === batchId);
  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !user || !selectedSupplier || !selectedBatch) return;
    if (qty < 1 || qty > selectedBatch.qty) {
      setError("Jumlah retur harus antara 1 dan stok batch yang tersedia.");
      return;
    }
    if (!confirm(`Keluarkan ${qty} ${selectedBatch.unit} ${selectedBatch.productName} dari stok dan catat retur ke ${selectedSupplier.name}?`)) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await createSupplierReturn({ tenantId, supplierId, batchId, qty, reason, notes, createdBy: user.uid });
      setNotice("Retur dicatat dan stok batch berhasil dikurangi.");
      setBatchId("");
      setQty(1);
      setNotes("");
      await load();
    } catch (submitError) {
      const code = submitError instanceof Error ? submitError.message : "return_failed";
      const messages: Record<string, string> = {
        supplier_not_found: "Pemasok tidak ditemukan.",
        batch_not_found: "Batch tidak ditemukan.",
        supplier_not_returnable: "Pemasok tidak aktif atau tidak menerima retur.",
        batch_supplier_mismatch: "Batch ini bukan pembelian dari pemasok tersebut.",
        return_qty_exceeds_stock: "Jumlah retur melebihi stok batch terbaru.",
        expired_batch_requires_disposal: "Batch kedaluwarsa harus dicatat melalui pemusnahan, bukan retur.",
        supplier_return_window_passed: "Batas hari retur pemasok sudah lewat.",
      };
      setError(messages[code] || "Retur gagal disimpan. Periksa stok dan koneksi Firebase.");
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <header>
        <h1 className="text-2xl font-bold">Retur Pemasok</h1>
        <p className="text-sm text-ink-500 mt-1">Retur mengurangi stok batch dan menyimpan jejak pemasok, invoice, alasan, serta nilainya.</p>
      </header>
      {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
      {notice && <p role="status" className="text-sm text-accent-700">{notice}</p>}

      <form onSubmit={submit} className="card p-4 grid md:grid-cols-2 gap-3">
        <label className="block text-sm font-medium">Pemasok
          <select className="input mt-1 w-full" required value={supplierId} onChange={(event) => { setSupplierId(event.target.value); setBatchId(""); }}>
            <option value="">Pilih pemasok yang menerima retur</option>
            {eligibleSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code ? `${supplier.code} · ` : ""}{supplier.name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Batch pembelian
          <select className="input mt-1 w-full" required value={batchId} onChange={(event) => setBatchId(event.target.value)} disabled={!supplierId}>
            <option value="">Pilih batch</option>
            {eligibleBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.productName} · {batch.batchNo} · stok {batch.qty} · ED {batch.expiryISO}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Jumlah retur
          <input className="input mt-1 w-full" type="number" min="1" max={selectedBatch?.qty || 1} step="1" required value={qty} onChange={(event) => setQty(Number(event.target.value) || 0)} />
        </label>
        <label className="block text-sm font-medium">Alasan
          <select className="input mt-1 w-full" value={reason} onChange={(event) => setReason(event.target.value as SupplierReturnReason)}>
            {REASONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        {selectedBatch && <div className="md:col-span-2 rounded-lg bg-surface-50 p-3 text-sm">
          <div>{selectedBatch.supplierName || selectedSupplier?.name} · batch {selectedBatch.batchNo}</div>
          <div className="text-xs text-ink-500 mt-1">Invoice {selectedBatch.invoiceNo || "—"} · diterima {selectedBatch.purchaseDateISO || "—"} · HPP/unit {typeof selectedBatch.costPrice === "number" ? rupiah(selectedBatch.costPrice) : "tidak tercatat"}</div>
          <div className="font-semibold mt-1">Nilai retur: {typeof selectedBatch.costPrice === "number" ? rupiah(qty * selectedBatch.costPrice) : "HPP tidak diketahui"}</div>
        </div>}
        <label className="md:col-span-2 block text-sm font-medium">Catatan (opsional)
          <textarea className="input mt-1 w-full min-h-20" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        {eligibleSuppliers.length === 0 && <p className="md:col-span-2 text-sm text-ink-500">Belum ada pemasok aktif yang ditandai menerima retur.</p>}
        {supplierId && eligibleBatches.length === 0 && <p className="md:col-span-2 text-sm text-ink-500">Tidak ada batch pembelian yang masih dalam kebijakan retur pemasok ini.</p>}
        <div className="md:col-span-2 flex justify-end"><button className="btn-primary" disabled={saving || !selectedBatch}>{saving ? "Mencatat…" : "Keluarkan stok & catat retur"}</button></div>
      </form>

      <section className="card overflow-hidden">
        <h2 className="px-4 py-3 font-semibold border-b border-surface-100">Riwayat retur terbaru</h2>
        {loading ? <p className="p-4 text-sm text-ink-500">Memuat riwayat…</p> : returns.length === 0 ? <p className="p-4 text-sm text-ink-500">Belum ada retur tercatat.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm">
            <thead className="bg-surface-50 text-left text-xs uppercase text-ink-500"><tr><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">Pemasok</th><th className="px-4 py-3">Produk / Batch</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3">Alasan</th><th className="px-4 py-3 text-right">Nilai</th></tr></thead>
            <tbody>{returns.map((record) => <tr key={record.id} className="border-t border-surface-100"><td className="px-4 py-3">{record.createdAt?.toDate?.().toLocaleDateString("id-ID") || "—"}</td><td className="px-4 py-3">{record.supplierName}</td><td className="px-4 py-3">{record.productName} · {record.batchNo}</td><td className="px-4 py-3">{record.qty}</td><td className="px-4 py-3">{REASONS.find((item) => item.value === record.reason)?.label || record.reason}</td><td className="px-4 py-3 text-right">{typeof record.valueRp === "number" ? rupiah(record.valueRp) : "—"}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
