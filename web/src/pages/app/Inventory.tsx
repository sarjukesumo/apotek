import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import type { DemoProduct, DemoBatch, DemoSupplier } from "../../lib/demoStore";
import { parseInventoryCsv, serializeInventoryCsv, listCsvSupplierRefs, type ImportSupplier } from "../../lib/inventoryCsv";
import { buildInventoryTemplateWorkbook, downloadWorkbook, excelBufferToCsvText, inventoryCsvToWorkbook } from "../../lib/inventoryExcel";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import {
  deleteTenantBatch, deleteTenantProduct, importTenantProducts, loadTenantInventory,
  loadTenantSuppliers, migrateLegacyBatchCosts, saveTenantBatch, saveTenantProduct, setTenantProductMarketplace, subscribeTenantInventory,
} from "../../lib/inventoryRepository";
import { findProductImages, type ImageCandidate } from "../../lib/imageSearch";
import { prepareProductImage } from "../../lib/productImage";
import { ProductThumbnail } from "../../components/ProductThumbnail";
import { applyQueuedSalesToInventory, getQueuedPosSales } from "../../lib/offlinePos";
import { Link } from "react-router-dom";
import { CatalogPagination, useCatalogPage } from "../../components/CatalogPagination";
import {
  batchZoneMeta, formatDaysToExpiry,
  availableQty, expiredQty, valueInZones, productWorstZone, zoneMeta,
  isReturnEligible, daysUntilReturnDeadline,
} from "../../lib/fefo";

const CATEGORIES = ["Obat Bebas", "Obat Bebas Terbatas", "Antibiotik", "Vitamin", "Herbal", "Alat Kesehatan", "Ibu & Anak", "Diabetes", "Antiseptik", "Pernapasan", "P3K", "Lainnya"];
const UNITS = ["strip", "botol", "box", "tablet", "kaplet", "kapsul", "tube", "kotak", "kaleng", "tabung", "pen", "unit", "pcs"];
const GRADIENTS = [
  "from-brand-100 to-accent-100",
  "from-accent-100 to-warn-100",
  "from-warn-100 to-brand-100",
  "from-brand-100 to-brand-200",
  "from-warn-100 to-warn-200",
  "from-danger-100 to-warn-100",
  "from-accent-100 to-brand-100",
  "from-warn-100 to-danger-100",
];

function formatRp(n: number) { return `Rp ${n.toLocaleString("id-ID")}`; }

export function Inventory() {
  const tenantId = useAuth((s) => s.claims?.tenantId);
  const canViewPurchasePrice = useAuth((s) => s.claims?.role === "OWNER");
  const [products, setProducts] = useState<DemoProduct[]>([]);
  const [suppliers, setSuppliers] = useState<ImportSupplier[]>([]);
  const [tenant, setTenant] = useState<{ name?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [editing, setEditing] = useState<DemoProduct | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "marketplace" | "warning" | "critical" | "expired">("all");

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    Promise.all([
      loadTenantInventory(tenantId, canViewPurchasePrice),
      loadTenantSuppliers(tenantId),
      getQueuedPosSales(tenantId),
    ]).then(([result, supplierOptions, pending]) => {
      if (!active) return;
      setProducts(applyQueuedSalesToInventory(result.products, pending));
      setTenant(result.tenant);
      setSuppliers(supplierOptions);
      setError("");
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Gagal memuat stok dari Firebase.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [tenantId, canViewPurchasePrice]);

  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    let revision = 0;
    const stop = subscribeTenantInventory(tenantId, canViewPurchasePrice, (inventory) => {
      const currentRevision = ++revision;
      void getQueuedPosSales(tenantId).then((pending) => {
        if (active && currentRevision === revision) setProducts(applyQueuedSalesToInventory(inventory.products, pending));
      }).catch((error: unknown) => {
        if (active) setError(error instanceof Error ? error.message : "Gagal membaca antrean lokal.");
      });
    }, (error) => { if (active) setError(error.message); });
    return () => { active = false; stop(); };
  }, [tenantId, canViewPurchasePrice]);

  useEffect(() => {
    if (!tenantId || typeof BroadcastChannel === "undefined") return;
    let active = true;
    const channel = new BroadcastChannel("batam-farma-offline-pos");
    channel.onmessage = (event: MessageEvent<{ tenantId?: string }>) => {
      if (event.data?.tenantId !== tenantId) return;
      void Promise.all([
        loadTenantInventory(tenantId, canViewPurchasePrice),
        getQueuedPosSales(tenantId),
      ]).then(([result, pending]) => {
        if (active) setProducts(applyQueuedSalesToInventory(result.products, pending));
      }).catch((refreshError) => console.error("Inventory refresh after offline sale failed.", refreshError));
    };
    return () => {
      active = false;
      channel.close();
    };
  }, [tenantId, canViewPurchasePrice]);

  const enriched = useMemo(() => products.map((p) => {
    const stock = availableQty(p.batches);          // exclude expired
    const totalAll = p.batches.reduce((sum, batch) => sum + batch.qty, 0); // include expired
    const exp = expiredQty(p.batches);
    const sortedBatches = [...p.batches].sort((a, b) => a.expiryISO.localeCompare(b.expiryISO));
    const nearestExpiry = sortedBatches[0]?.expiryISO ?? null;
    const worst = productWorstZone(p);
    const riskValue = valueInZones(p, ["WARNING", "CRITICAL"]);
    const expiredValue = valueInZones(p, ["EXPIRED"]);
    // HPP rata-rata tertimbang dari batch yang masih ada (qty > 0, exclude expired)
    const liveBatches = p.batches.filter((b) => b.qty > 0 && b.expiryISO >= new Date().toISOString().slice(0, 10) && typeof b.costPrice === "number");
    const totalCostQty = liveBatches.reduce((s, b) => s + b.qty, 0);
    const avgCost = totalCostQty > 0 ? Math.round(liveBatches.reduce((s, b) => s + b.qty * (b.costPrice || 0), 0) / totalCostQty) : 0;
    const marginRp = avgCost > 0 ? p.price - avgCost : 0;
    const marginPct = avgCost > 0 && p.price > 0 ? (marginRp / p.price) * 100 : null;
    return { ...p, stock, totalAll, exp, sortedBatches, nearestExpiry, worst, riskValue, expiredValue, avgCost, marginRp, marginPct };
  }), [products]);

  const filtered = useMemo(() => enriched.filter((p) => {
    if (search && !`${p.name} ${p.code || ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "low" && p.stock >= p.minStock) return false;
    if (filter === "marketplace" && !p.marketplaceEnabled) return false;
    if (filter === "warning" && p.worst !== "WARNING") return false;
    if (filter === "critical" && p.worst !== "CRITICAL") return false;
    if (filter === "expired" && p.exp <= 0) return false;
    return true;
  }), [enriched, search, filter]);
  const productPage = useCatalogPage(filtered, `${search}:${filter}`);

  const stats = useMemo(() => ({
    total: enriched.length,
    low: enriched.filter((p) => p.stock < p.minStock).length,
    marketplace: enriched.filter((p) => p.marketplaceEnabled).length,
    expiringSoon: enriched.filter((p) => p.worst === "WARNING" || p.worst === "CRITICAL").length,
    expiredCount: enriched.filter((p) => p.exp > 0).length,
    riskValue: enriched.reduce((s, p) => s + p.riskValue, 0),
    expiredValue: enriched.reduce((s, p) => s + p.expiredValue, 0),
  }), [enriched]);

  async function persistProduct(product: DemoProduct) {
    if (!tenantId) return false;
    const existing = products.find((item) => item.id === product.id);
    const saved = { ...product, tenantId, batches: existing?.batches ?? product.batches };
    try {
      await saveTenantProduct(tenantId, saved);
      setProducts((current) => current.some((item) => item.id === saved.id)
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [...current, saved]);
      setNotice("Produk berhasil disimpan.");
      setError("");
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gagal menyimpan produk.");
      return false;
    }
  }

  async function removeProduct(productId: string) {
    if (!tenantId) return;
    try {
      await deleteTenantProduct(tenantId, productId, canViewPurchasePrice);
      setProducts((current) => current.filter((product) => product.id !== productId));
      setNotice("Produk dan batch-nya berhasil dihapus.");
      setError("");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Gagal menghapus produk.");
    }
  }

  async function toggleMarketplace(productId: string) {
    if (!tenantId) return;
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const marketplaceEnabled = !product.marketplaceEnabled;
    try {
      await setTenantProductMarketplace(tenantId, productId, marketplaceEnabled);
      setProducts((current) => current.map((item) => item.id === productId ? { ...item, marketplaceEnabled } : item));
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gagal mengubah status marketplace.");
    }
  }

  async function addBatch(productId: string, fields: Omit<DemoBatch, "id">) {
    if (!tenantId) return;
    const batch = { ...fields, id: crypto.randomUUID() };
    try {
      await saveTenantBatch(tenantId, productId, batch, canViewPurchasePrice);
      setProducts((current) => current.map((product) => product.id === productId
        ? { ...product, batches: [...product.batches, batch] }
        : product));
      setEditing((current) => current?.id === productId
        ? { ...current, batches: [...current.batches, batch] }
        : current);
      setNotice("Batch berhasil disimpan.");
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gagal menyimpan batch.");
    }
  }

  async function removeBatch(productId: string, batchId: string) {
    if (!tenantId) return;
    try {
      await deleteTenantBatch(tenantId, batchId, canViewPurchasePrice);
      setProducts((current) => current.map((product) => product.id === productId
        ? { ...product, batches: product.batches.filter((batch) => batch.id !== batchId) }
        : product));
      setEditing((current) => current?.id === productId
        ? { ...current, batches: current.batches.filter((batch) => batch.id !== batchId) }
        : current);
      setNotice("Batch berhasil dihapus.");
      setError("");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Gagal menghapus batch.");
    }
  }

  function exportExcel() {
    const workbook = inventoryCsvToWorkbook(serializeInventoryCsv(products, canViewPurchasePrice));
    downloadWorkbook(workbook, `stok-obat-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function downloadTemplate() {
    downloadWorkbook(buildInventoryTemplateWorkbook(), "template-impor-stok.xlsx");
  }

  // Registers suppliers referenced in the file (e.g. legacy PBF column) that
  // are not yet in the master list, so migration imports work in one pass.
  async function ensureImportSuppliers(csvText: string): Promise<{ list: ImportSupplier[]; created: number }> {
    const refs = listCsvSupplierRefs(csvText);
    const list = [...suppliers];
    let created = 0;
    for (const ref of refs) {
      const exists = list.some((supplier) =>
        (ref.code && supplier.code?.trim().toUpperCase() === ref.code)
        || supplier.name.trim().toLowerCase() === ref.name.trim().toLowerCase());
      if (exists) continue;
      const docRef = await addDoc(collection(db, `tenants/${tenantId}/suppliers`), {
        name: ref.name,
        ...(ref.code ? { code: ref.code } : {}),
        phone: "",
        active: true,
        returnable: false,
        returnMinDaysBeforeED: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      list.push({ id: docRef.id, code: ref.code, name: ref.name, active: true, returnable: false, returnMinDaysBeforeED: 0 });
      created += 1;
    }
    if (created > 0) setSuppliers(list);
    return { list, created };
  }

  async function importFile(file?: File) {
    if (!tenantId || !file) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const isCsv = /\.csv$/i.test(file.name);
      const text = isCsv ? await file.text() : excelBufferToCsvText(await file.arrayBuffer());
      const { list: supplierList, created } = await ensureImportSuppliers(text);
      const imported = parseInventoryCsv(text, tenantId, supplierList);
      await importTenantProducts(tenantId, imported, canViewPurchasePrice);
      setProducts((current) => {
        const merged = new Map(current.map((product) => [product.id, product]));
        imported.forEach((product) => {
          const previous = merged.get(product.id);
          const batches = new Map((previous?.batches ?? []).map((batch) => [batch.id, batch]));
          product.batches.forEach((batch) => batches.set(batch.id, batch));
          merged.set(product.id, { ...previous, ...product, batches: [...batches.values()] });
        });
        return [...merged.values()];
      });
      setNotice(`${imported.length} produk berhasil diimpor${created > 0 ? ` dan ${created} pemasok baru didaftarkan otomatis` : ""}. Batch impor dicocokkan ke pemasok terdaftar; batch lama yang tidak ada di file tetap dipertahankan.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Gagal mengimpor file.");
    } finally {
      setBusy(false);
    }
  }

  function newProduct() {
    if (!tenantId) return;
    setEditing({
      id: crypto.randomUUID(),
      tenantId,
      name: "",
      category: "Obat Bebas",
      price: 0,
      emoji: "💊",
      gradient: "from-brand-100 to-accent-100",
      desc: "",
      unit: "strip",
      rxRequired: false,
      marketplaceEnabled: false,
      minStock: 10,
      batches: [],
    });
  }

  async function migrateLegacyCosts() {
    if (!tenantId || !canViewPurchasePrice || busy) return;
    setBusy(true);
    setError("");
    try {
      const migrated = await migrateLegacyBatchCosts(tenantId);
      const result = await loadTenantInventory(tenantId, true);
      setProducts(result.products);
      setNotice(`${migrated.migratedCosts} HPP lama dipindahkan dan ${migrated.migratedExpiry} batch diberi timestamp expiry aman.`);
    } catch (migrationError) {
      setError(migrationError instanceof Error ? migrationError.message : "Gagal memigrasikan HPP batch.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Stok Obat</h1>
          <p className="text-ink-500 text-sm mt-1">
            {tenant?.name ?? tenantId ?? "Apotek"} · Stok aktif otomatis tampil di{" "}
            <Link to="/store/apotek-yuyun" className="text-brand-600 underline">Storefront</Link> jika toggle aktif.
          </p>
          <p className="text-xs text-ink-400 mt-1">Harga jual per produk · harga beli/HPP dicatat per batch.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportExcel} disabled={loading || busy} className="btn-secondary">Ekspor Excel</button>
          <button onClick={downloadTemplate} disabled={busy} className="btn-secondary">Template impor</button>
          {canViewPurchasePrice && <button onClick={() => void migrateLegacyCosts()} disabled={loading || busy} className="btn-secondary">Migrasi data batch</button>}
          <label className={`btn-secondary cursor-pointer ${loading || busy || !tenantId ? "opacity-50 pointer-events-none" : ""}`}>
            Impor Excel
            <input
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="sr-only"
              disabled={loading || busy || !tenantId}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void importFile(file);
              }}
            />
          </label>
          <button onClick={newProduct} disabled={!tenantId || busy} className="btn-primary">+ Produk Baru</button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</div>}
      {notice && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
      {!tenantId && <div role="alert" className="rounded-md border border-warn-200 bg-warn-50 px-4 py-3 text-sm text-warn-700">Akun ini belum terhubung ke tenant apotek.</div>}
      {loading && <div className="text-sm text-ink-500">Memuat stok dari Firebase…</div>}

      {/* Stats */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: "Total Produk", v: stats.total, c: "text-ink-900" },
          { l: "Stok Menipis", v: stats.low, c: "text-warn-500" },
          { l: "Akan ED < 90 hari", v: stats.expiringSoon, c: "text-orange-600" },
          { l: "Sudah Expired", v: stats.expiredCount, c: "text-danger-600" },
        ].map((s) => (
          <div key={s.l} className="card !p-4">
            <div className="text-xs text-ink-500">{s.l}</div>
            <div className={`text-2xl font-bold mt-1 ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Risk value strip */}
      {(stats.riskValue > 0 || stats.expiredValue > 0) && (
        <div className="card !p-4 bg-gradient-to-r from-orange-50 to-danger-50 border-orange-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs text-orange-700 font-semibold uppercase tracking-wide">⚠ Nilai Stok Berisiko</div>
              <div className="flex items-baseline gap-3 mt-1">
                <div className="text-2xl font-bold text-orange-700">{formatRp(stats.riskValue)}</div>
                <div className="text-xs text-ink-500">akan ED &lt; 90 hari</div>
                {stats.expiredValue > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded bg-danger-100 text-danger-700 font-semibold">
                    + {formatRp(stats.expiredValue)} sudah expired
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {stats.riskValue > 0 && (
                <Link to="../returns" className="btn-secondary text-xs">↩️ Retur ke Supplier</Link>
              )}
              {stats.expiredValue > 0 && (
                <Link to="../disposal" className="btn-primary text-xs">🗑 Musnahkan (BAP)</Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          className="input flex-1 min-w-[200px]"
          placeholder="🔍 Cari produk…"
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-1 bg-surface-100 rounded-lg p-1 flex-wrap">
          {[
            { k: "all", l: "Semua" },
            { k: "low", l: "Stok Menipis" },
            { k: "marketplace", l: "Marketplace" },
            { k: "warning", l: "🟠 Warning" },
            { k: "critical", l: "🔴 Critical" },
            { k: "expired", l: "⚫ Expired" },
          ].map((f) => (
            <button key={f.k} onClick={() => setFilter(f.k as any)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${filter === f.k ? "bg-white text-brand-700 font-semibold shadow-sm" : "text-ink-500 hover:text-ink-900"}`}>
              {f.l}
            </button>
          ))}
        </div>
      </div>

      {/* Products table */}
      {products.some((product) => product.sampleOnly) && <div className="rounded-xl border border-warn-200 bg-warn-50 p-3 text-sm">
        Produk SAMPLE dipakai di latihan, bukan penjualan nyata. Gambar bertanda ILUSTRASI SAMPLE bukan foto kemasan asli.
        <Link to="/app/pos?mode=training" className="btn-primary inline-flex ml-3">Coba obat SAMPLE di POS latihan</Link>
      </div>}
      <CatalogPagination {...productPage} />
      <div className="card !p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-500 bg-surface-50 border-b border-surface-100">
            <tr>
              <th className="p-3">Produk</th>
              <th className="p-3">Kategori</th>
              <th className="p-3 text-right">Harga Jual</th>
              {canViewPurchasePrice && <th className="p-3 text-right">Margin / HPP</th>}
              <th className="p-3 text-right">Stok</th>
              <th className="p-3">Batch terdekat</th>
              <th className="p-3 text-center">Marketplace</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={canViewPurchasePrice ? 8 : 7} className="text-center py-12 text-ink-500">
                <div className="text-3xl">📭</div>
                <div className="mt-2">Tidak ada produk{search && ` cocok dengan "${search}"`}.</div>
              </td></tr>
            )}
            {productPage.items.map((p) => {
              const lowStock = p.stock < p.minStock;
              const nearestZone = p.nearestExpiry ? batchZoneMeta(p.nearestExpiry) : null;
              return (
                <tr key={p.id} className="border-t border-surface-100 hover:bg-surface-50/50">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div>
                        <ProductThumbnail name={p.name} imageUrl={p.imageUrl} className="w-20 h-20" />
                        {canViewPurchasePrice && <button className="text-[10px] text-brand-600 mt-1 hover:underline"
                          onClick={() => setEditing(p)}>{p.imageUrl ? "Ganti foto" : "Tambah foto"}</button>}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{p.name}</div>
                        {p.code && <div className="text-[10px] text-ink-500">{p.code}</div>}
                        <div className="flex gap-1 mt-0.5">
                          {p.sampleOnly && <span className="text-[9px] bg-warn-100 text-warn-700 px-1.5 py-0.5 rounded">SAMPLE · tidak dijual</span>}
                          {!p.sampleOnly && p.active === false && <span className="text-[9px] text-ink-500">Tidak aktif</span>}
                          {p.rxRequired && <span className="text-[9px] bg-danger-500 text-white font-bold px-1.5 py-0.5 rounded inline-block">Rx</span>}
                          {p.worst && p.worst !== "SAFE" && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded inline-block ${zoneMeta(p.worst).cls}`}>
                              {zoneMeta(p.worst).short}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-ink-500 text-xs">{p.category}</td>
                  <td className="p-3 text-right font-semibold">{formatRp(p.price)}</td>
                  {canViewPurchasePrice && <td className="p-3 text-right">
                    {p.marginPct === null ? (
                      <span className="text-[10px] text-ink-400">—</span>
                    ) : (
                      <div className="leading-tight">
                        <div className={`text-xs font-bold ${p.marginPct < 0 ? "text-danger-600" : p.marginPct < 10 ? "text-orange-600" : p.marginPct < 30 ? "text-warn-600" : "text-emerald-600"}`}>
                          {p.marginPct < 0 ? "" : "+"}{p.marginPct.toFixed(1)}%
                        </div>
                        <div className="text-[10px] text-ink-500">HPP {formatRp(p.avgCost)}</div>
                        {p.marginPct < 0 && <div className="text-[9px] text-danger-600 font-bold">⚠ RUGI</div>}
                        {p.marginPct >= 0 && p.marginPct < 10 && <div className="text-[9px] text-orange-600">⚠ tipis</div>}
                      </div>
                    )}
                  </td>}
                  <td className="p-3 text-right">
                    <span className={`font-bold ${lowStock ? "text-warn-500" : "text-ink-900"}`}>{p.stock}</span>
                    <span className="text-xs text-ink-500"> / min {p.minStock}</span>
                    {p.exp > 0 && <div className="text-[10px] text-danger-600">+ {p.exp} expired</div>}
                    {lowStock && <div className="text-[10px] text-warn-500">⚠ Restock</div>}
                  </td>
                  <td className="p-3">
                    {p.nearestExpiry && nearestZone ? (
                      <div>
                        <span className={`badge text-[10px] ${nearestZone.cls}`}>{p.nearestExpiry}</span>
                        <div className="text-[10px] text-ink-500 mt-0.5">{formatDaysToExpiry(p.nearestExpiry)}</div>
                      </div>
                    ) : <span className="text-xs text-ink-500">—</span>}
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => toggleMarketplace(p.id)}
                      disabled
                      title="Marketplace dinonaktifkan selama pilot"
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${p.marketplaceEnabled ? "bg-brand-500" : "bg-surface-200"}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${p.marketplaceEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                    </button>
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => setEditing(p)} className="text-brand-600 text-xs font-medium hover:underline">Kelola →</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && <ProductEditor
        product={editing}
        canViewPurchasePrice={canViewPurchasePrice}
        suppliers={suppliers}
        onClose={() => setEditing(null)}
        onSave={async (p) => {
          setBusy(true);
          const saved = await persistProduct(p);
          setBusy(false);
          if (saved) setEditing(null);
        }}
        onDelete={(id) => {
          if (!confirm("Hapus produk ini beserta semua batch?")) return;
          setBusy(true);
          void removeProduct(id).then(() => setEditing(null)).finally(() => setBusy(false));
        }}
        onAddBatch={(b) => addBatch(editing.id, b)}
        onRemoveBatch={(bid) => removeBatch(editing.id, bid)}
      />}
    </div>
  );
}

function ProductEditor({
  product, canViewPurchasePrice, suppliers, onClose, onSave, onDelete, onAddBatch, onRemoveBatch,
}: {
  product: DemoProduct;
  canViewPurchasePrice: boolean;
  suppliers: ImportSupplier[];
  onClose: () => void;
  onSave: (p: DemoProduct) => void;
  onDelete: (id: string) => void;
  onAddBatch: (b: Omit<DemoBatch, "id">) => void;
  onRemoveBatch: (id: string) => void;
}) {
  // Re-read from store so batch updates are live
  const live = product;
  const [form, setForm] = useState<DemoProduct>(product);
  const [imageBusy, setImageBusy] = useState(false);
  const [newBatch, setNewBatch] = useState({
    batchNo: "", qty: 0, expiryISO: "", sourceType: "OPENING_STOCK" as NonNullable<DemoBatch["sourceType"]>,
    supplierId: "", purchaseDateISO: "", invoiceNo: "", costPrice: 0,
  });

  function update<K extends keyof DemoProduct>(k: K, v: DemoProduct[K]) {
    setForm((cur) => ({ ...cur, [k]: v }));
  }

  function addBatch() {
    if (!newBatch.batchNo || !newBatch.expiryISO || newBatch.qty <= 0) return;
    if (newBatch.sourceType === "PURCHASE" && (!newBatch.supplierId || !newBatch.purchaseDateISO || newBatch.costPrice <= 0)) return;
    const supplier = suppliers.find((item) => item.id === newBatch.supplierId);
    onAddBatch({
      ...newBatch,
      supplierId: supplier?.id,
      supplierCode: supplier?.code,
      supplierName: supplier?.name,
      purchaseDateISO: newBatch.purchaseDateISO || undefined,
      invoiceNo: newBatch.invoiceNo.trim() || undefined,
      costPrice: canViewPurchasePrice && newBatch.sourceType === "PURCHASE" ? newBatch.costPrice : undefined,
    });
    setNewBatch({ batchNo: "", qty: 0, expiryISO: "", sourceType: "OPENING_STOCK", supplierId: "", purchaseDateISO: "", invoiceNo: "", costPrice: 0 });
  }

  return (
    <div className="fixed inset-0 z-[60] bg-ink-900/60 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-bold">{product.name ? `Kelola: ${product.name}` : "Produk Baru"}</h2>
            <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-surface-100 grid place-items-center">✕</button>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-4">
            {form.sampleOnly && <p role="status" className="md:col-span-2 text-sm text-warn-700">Data SAMPLE: harga, nomor batch dan tanggal ED adalah contoh, bukan untuk penjualan. Ubah data nyata melalui produk operasional terpisah.</p>}
            <div className="md:col-span-2">
              <label className="label">Kode produk</label>
              <input className="input" value={form.code || ""} onChange={(e) => update("code", e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Nama produk</label>
              <input className="input" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Mis. Paracetamol 500mg" />
            </div>
            <div>
              <label className="label">Kategori</label>
              <select className="input" value={form.category} onChange={(e) => update("category", e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Satuan</label>
              <select className="input" value={form.unit} onChange={(e) => update("unit", e.target.value)}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Harga jual (Rp)</label>
              <input type="number" min={0} step={500} className="input" value={form.price} onChange={(e) => update("price", parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <label className="label">Min. stok (alert)</label>
              <input type="number" min={0} className="input" value={form.minStock} onChange={(e) => update("minStock", parseInt(e.target.value) || 0)} />
            </div>

            {/* Product photo */}
            <div className="md:col-span-2">
              <ProductImagePicker
                name={form.name}
                imageUrl={form.imageUrl}
                emoji={form.emoji}
                onImageChange={(url) => update("imageUrl", url)}
                onBusyChange={setImageBusy}
                canSearchInternet={canViewPurchasePrice}
              />
            </div>

            <div>
              <label className="label">Emoji / ikon (fallback)</label>
              <input className="input text-2xl" maxLength={2} value={form.emoji} onChange={(e) => update("emoji", e.target.value)} />
              <div className="text-[11px] text-ink-400 mt-1">Dipakai jika gambar belum di-set.</div>
            </div>
            <div>
              <label className="label">Warna kartu</label>
              <select className="input" value={form.gradient} onChange={(e) => update("gradient", e.target.value)}>
                {GRADIENTS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Deskripsi</label>
              <textarea className="input min-h-[60px]" value={form.desc} onChange={(e) => update("desc", e.target.value)} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-brand-500" checked={form.rxRequired} onChange={(e) => update("rxRequired", e.target.checked)} />
              <span className="text-sm">Perlu resep dokter (Rx)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-brand-500" checked={false} disabled />
              <span className="text-sm">Marketplace dinonaktifkan selama pilot</span>
            </label>
          </div>

          {/* Batches */}
          <div className="mt-6">
            <h3 className="font-semibold">📦 Batch (FEFO)</h3>
            <p className="text-xs text-ink-500 mt-1">First Expired First Out — sistem otomatis pakai batch dengan kadaluarsa terdekat dulu.</p>

            <div className="mt-3 rounded-xl border border-surface-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-50 text-left text-xs text-ink-500">
                  <tr><th className="p-2">Batch / Pemasok</th><th className="p-2 text-right">Qty</th>{canViewPurchasePrice && <th className="p-2 text-right">Harga beli/unit</th>}<th className="p-2">Expiry / Invoice</th><th className="p-2"></th></tr>
                </thead>
                <tbody>
                  {[...live.batches].sort((a, b) => a.expiryISO.localeCompare(b.expiryISO)).map((b) => {
                    const zm = batchZoneMeta(b.expiryISO);
                    const sup = b.supplierId ? suppliers.find((s) => s.id === b.supplierId) : null;
                    const eligible = sup ? isReturnEligible(b, sup) : false;
                    const deadline = sup ? daysUntilReturnDeadline(b, sup) : null;
                    return (
                      <tr key={b.id} className="border-t border-surface-100">
                        <td className="p-2 font-mono text-xs">
                          {b.batchNo}
                          {(b.supplierName || sup?.name) && <div className="text-[10px] text-ink-500 font-sans">{b.supplierCode ? `${b.supplierCode} · ` : ""}{b.supplierName || sup?.name}</div>}
                          {!b.supplierId && <div className="text-[10px] text-ink-400 font-sans">{b.sourceType || "OPENING_STOCK"}</div>}
                        </td>
                        <td className="p-2 text-right font-semibold">{b.qty}</td>
                        {canViewPurchasePrice && <td className="p-2 text-right">{typeof b.costPrice === "number" ? formatRp(b.costPrice) : "—"}</td>}
                        <td className="p-2">
                          <span className={`badge text-[10px] ${zm.cls}`}>{b.expiryISO} · {zm.short}</span>
                          <div className="text-[10px] text-ink-500 mt-0.5">{formatDaysToExpiry(b.expiryISO)}</div>
                          {(b.purchaseDateISO || b.invoiceNo) && <div className="text-[10px] text-ink-500 mt-0.5">{b.purchaseDateISO || "Tanggal —"}{b.invoiceNo ? ` · Inv ${b.invoiceNo}` : ""}</div>}
                          {sup && eligible && deadline !== null && deadline <= 14 && (
                            <div className={`text-[10px] mt-0.5 font-semibold ${deadline <= 7 ? "text-danger-600" : "text-orange-600"}`}>
                              ⏰ Deadline retur: {deadline <= 0 ? "hari ini" : `${deadline} hari lagi`}
                            </div>
                          )}
                          {sup && !eligible && zm.zone !== "EXPIRED" && (b.qty || 0) > 0 && deadline !== null && deadline < 0 && (
                            <div className="text-[10px] mt-0.5 text-ink-400">
                              ⚠ Window retur sudah lewat
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          {sup && eligible && (
                            <Link to="../returns" className="text-[10px] text-brand-600 hover:underline block">↩️ retur</Link>
                          )}
                          <button onClick={() => onRemoveBatch(b.id)} className="text-xs text-danger-500 hover:underline">hapus</button>
                        </td>
                      </tr>
                    );
                  })}
                  {live.batches.length === 0 && (
                    <tr><td colSpan={canViewPurchasePrice ? 5 : 4} className="text-center py-4 text-ink-500 text-xs">Belum ada batch. Tambahkan minimal 1 agar stok terhitung.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 items-end">
              <div className="w-48">
                <label className="label">Sumber stok</label>
                <select className="input" value={newBatch.sourceType} onChange={(e) => setNewBatch({ ...newBatch, sourceType: e.target.value as NonNullable<DemoBatch["sourceType"]> })}>
                  <option value="OPENING_STOCK">Stok awal / penyesuaian</option>
                  {canViewPurchasePrice && <option value="PURCHASE">Penerimaan pembelian</option>}
                </select>
              </div>
              {newBatch.sourceType === "PURCHASE" && canViewPurchasePrice && <div className="w-52">
                <label className="label">Pemasok</label>
                <select className="input" value={newBatch.supplierId} onChange={(e) => setNewBatch({ ...newBatch, supplierId: e.target.value })}>
                  <option value="">Pilih pemasok</option>
                  {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code ? `${supplier.code} · ` : ""}{supplier.name}</option>)}
                </select>
              </div>}
              <div className="flex-1 min-w-[120px]">
                <label className="label">No. Batch</label>
                <input className="input font-mono" value={newBatch.batchNo} onChange={(e) => setNewBatch({ ...newBatch, batchNo: e.target.value.toUpperCase() })} placeholder="PCM-2026X" />
              </div>
              <div className="w-24">
                <label className="label">Qty</label>
                <input type="number" min={0} className="input" value={newBatch.qty || ""} onChange={(e) => setNewBatch({ ...newBatch, qty: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="w-44">
                <label className="label">Expiry</label>
                <input type="date" className="input" value={newBatch.expiryISO} onChange={(e) => setNewBatch({ ...newBatch, expiryISO: e.target.value })} />
              </div>
              {newBatch.sourceType === "PURCHASE" && canViewPurchasePrice && <>
                <div className="w-40">
                  <label className="label">Tanggal terima</label>
                  <input type="date" className="input" value={newBatch.purchaseDateISO} onChange={(e) => setNewBatch({ ...newBatch, purchaseDateISO: e.target.value })} />
                </div>
                <div className="w-36">
                  <label className="label">No. invoice</label>
                  <input className="input" value={newBatch.invoiceNo} onChange={(e) => setNewBatch({ ...newBatch, invoiceNo: e.target.value })} />
                </div>
                <div className="w-36">
                  <label className="label">Harga beli/unit</label>
                  <input type="number" min={0} step={1} className="input" value={newBatch.costPrice || ""} onChange={(e) => setNewBatch({ ...newBatch, costPrice: parseInt(e.target.value) || 0 })} />
                </div>
              </>}
              {canViewPurchasePrice && <div className="w-36">
                <label className="label">Harga beli/unit</label>
                <input type="number" min={0} step={1} className="input" value={newBatch.costPrice || ""} onChange={(e) => setNewBatch({ ...newBatch, costPrice: parseInt(e.target.value) || 0 })} />
              </div>}
              <button onClick={addBatch} className="btn-secondary h-10">+ Batch</button>
            </div>
          </div>

          <div className="flex gap-2 mt-6 pt-4 border-t border-surface-100">
            <button disabled={imageBusy} onClick={() => onSave(form)} className="btn-primary flex-1">{imageBusy ? "Memproses foto…" : "💾 Simpan Produk"}</button>
            <button onClick={onClose} className="btn-secondary">Batal</button>
            {live.id && live.batches.length >= 0 && (
              <button onClick={() => onDelete(form.id)} className="btn-secondary text-danger-500">🗑 Hapus</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Product photo picker =====
export function ProductImagePicker({
  name, imageUrl, emoji, onImageChange, onBusyChange, canSearchInternet = false,
}: {
  name: string;
  imageUrl?: string;
  emoji: string;
  onImageChange: (url: string | undefined) => void;
  onBusyChange?: (busy: boolean) => void;
  canSearchInternet?: boolean;
}) {
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<ImageCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState(name.replace(/^\[SAMPLE\]\s*/i, ""));
  const [selectedCandidate, setSelectedCandidate] = useState<ImageCandidate | null>(null);
  const [approved, setApproved] = useState(false);

  async function handleSearch() {
    if (!canSearchInternet) return;
    if (!searchQuery.trim()) {
      setError("Isi nama, dosis dan kemasan untuk mencari foto.");
      return;
    }
    setError(null);
    setSearching(true);
    setCandidates(null);
    setSelectedCandidate(null);
    setApproved(false);
    onBusyChange?.(true);
    try {
      const list = await findProductImages(searchQuery);
      if (list.length === 0) {
        setError("Tidak ditemukan kandidat foto berlisensi yang cocok. Jangan memakai foto obat lain; upload foto kemasan asli dari PC.");
      }
      setCandidates(list);
    } catch (e) {
      setError("Gagal mencari gambar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSearching(false);
      onBusyChange?.(false);
    }
  }

  return (
    <div>
      <label className="label flex items-center justify-between">
        <span>🖼️ Gambar Produk</span>
        <span className="text-[11px] font-normal text-ink-400">Foto kemasan harus diperiksa, bukan identifikasi obat otomatis</span>
      </label>

      <div className="flex gap-3 items-start mt-1">
        {/* Preview */}
        <div className="w-24 h-24 rounded-xl border-2 border-surface-200 bg-surface-50 grid place-items-center overflow-hidden shrink-0">
          {imageUrl ? (
            <img src={imageUrl} alt={name} className="w-full h-full object-contain" onError={() => setError("Gambar tidak dapat ditampilkan. Pilih foto lain atau periksa URL; gambar lama tidak dihapus otomatis.")} />
          ) : (
            <span className="text-4xl">{emoji || "📦"}</span>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <label className="btn-secondary text-xs px-3 h-8 cursor-pointer">
              Upload dari PC
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading || searching} className="sr-only" aria-label="Upload foto produk dari PC"
                onChange={async (event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (!file) return;
                  setError(null);
                  setUploading(true);
                  onBusyChange?.(true);
                  try { onImageChange(await prepareProductImage(file)); }
                  catch (error) { setError(error instanceof Error ? error.message : "Foto gagal diproses."); }
                  finally { setUploading(false); onBusyChange?.(false); }
                }} />
            </label>
            {canSearchInternet && <button
              type="button"
              onClick={handleSearch}
              disabled={uploading || searching || !searchQuery.trim()}
              className="btn-primary text-xs px-3 h-8 disabled:opacity-50"
            >
              {searching ? "Mencari foto…" : "Cari foto internet"}
            </button>}
            {imageUrl && (
              <button
                type="button"
                onClick={() => onImageChange(undefined)}
                disabled={uploading || searching}
                className="btn-secondary text-xs px-3 h-8 text-danger-600"
              >
                🗑 Hapus Gambar
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowManual((s) => !s)}
              disabled={uploading || searching}
              className="btn-secondary text-xs px-3 h-8"
            >
              🔗 URL Manual
            </button>
          </div>
          {canSearchInternet && <div>
            <label className="label text-xs" htmlFor="product-photo-query">Kata pencarian (nama/merek, dosis, kemasan)</label>
            <input id="product-photo-query" className="input text-xs" value={searchQuery} disabled={searching || uploading}
              onChange={(event) => setSearchQuery(event.target.value)} />
            <p className="text-[11px] text-ink-500 mt-1">Pencarian mengirim kata di atas ke Openverse saat diklik. Hasil bisa tidak cocok; Owner wajib memeriksa foto dan lisensinya.</p>
          </div>}
          {!canSearchInternet && <p className="text-[11px] text-ink-500">Pencarian dan persetujuan foto internet dilakukan Owner.</p>}
          <p className="text-[11px] text-ink-500">JPG/PNG/WebP maks. 5 MB. Foto diperkecil maks. 256 px / 24 KB dan tersimpan bersama produk setelah klik Simpan. Gunakan foto milik sendiri atau yang diizinkan.</p>

          {showManual && (
            <div className="flex gap-1.5">
              <input
                className="input text-xs h-8 flex-1"
                placeholder="https://… (paste URL gambar)"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
              />
              <button
                type="button"
                onClick={() => {
                  if (manualUrl.trim()) {
                    onImageChange(manualUrl.trim());
                    setManualUrl("");
                    setShowManual(false);
                  }
                }}
                className="btn-secondary text-xs px-3 h-8"
              >
                Pakai
              </button>
            </div>
          )}

          {error && <div role="alert" className="text-[11px] text-danger-600">{error}</div>}

          {candidates && candidates.length > 0 && (
            <div>
              <div className="text-[11px] text-ink-500 mb-1">Pilih kandidat untuk diperiksa (belum digunakan):</div>
              <div className="flex gap-2 flex-wrap">
                {candidates.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setSelectedCandidate(c);
                      setApproved(false);
                    }}
                    className={`relative w-20 h-20 rounded-lg border-2 overflow-hidden bg-white hover:ring-2 hover:ring-brand-500 transition ${
                      imageUrl === c.url ? "border-brand-500 ring-2 ring-brand-300" : "border-surface-200"
                    }`}
                    title={`${c.source}${c.title ? ` — ${c.title}` : ""}`}
                  >
                    <img src={c.thumb} alt={c.title || "Kandidat foto"} loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-contain" />
                    <span className="absolute bottom-0 left-0 right-0 text-[8px] bg-black/60 text-white px-1 truncate">
                      {c.source.replace("wikipedia-", "wiki-")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {selectedCandidate && <div className="rounded-lg border border-warn-200 bg-warn-50 p-3 space-y-2">
            <img src={selectedCandidate.thumb} alt={`Periksa foto ${selectedCandidate.title || name}`} referrerPolicy="no-referrer" className="w-40 h-40 object-contain bg-white" />
            <p className="text-xs font-semibold">{selectedCandidate.title || "Tanpa judul"}</p>
            <p className="text-[11px]">Pembuat: {selectedCandidate.creator || "Periksa pada sumber"} · Lisensi: {selectedCandidate.license || "Periksa pada sumber"}</p>
            <div className="flex gap-3 text-xs">
              <a href={selectedCandidate.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">Buka sumber</a>
              <a href={selectedCandidate.licenseUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">Periksa lisensi</a>
            </div>
            <label className="flex gap-2 text-xs">
              <input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} />
              Saya sudah memastikan merek, dosis, bentuk dan kemasan sesuai serta izin/atribusi foto terpenuhi.
            </label>
            <button type="button" className="btn-primary text-xs" disabled={!approved || searching || uploading} onClick={() => {
              onImageChange(selectedCandidate.thumb); setSelectedCandidate(null); setCandidates(null); setApproved(false);
            }}>Setujui dan gunakan foto</button>
            <p className="text-[11px]">Setelah disetujui, klik Simpan Produk. Foto tidak menggantikan pemeriksaan label obat oleh karyawan.</p>
          </div>}
        </div>
      </div>
    </div>
  );
}
