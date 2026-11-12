import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../lib/auth";
import type { DemoProduct } from "../../lib/demoStore";
import { availableQty, pickFefo, expiredQty, productWorstZone } from "../../lib/fefo";
import { loadTenantInventory, subscribeTenantInventory } from "../../lib/inventoryRepository";
import { CatalogPagination, useCatalogPage } from "../../components/CatalogPagination";
import { completePosSale } from "../../lib/posRepository";
import {
  acknowledgeQueuedPosSale, applyQueuedSalesToInventory, getQueuedPosSales, queueOfflinePosSale,
  type QueuedPosSale,
} from "../../lib/offlinePos";
import { isNetworkError, retryQueuedPosSales, syncQueuedPosSales } from "../../lib/posSync";
import { persistentFirestoreCache } from "../../lib/firebase";
import { searchPosProducts, SYNONYMS } from "../../lib/posSearch";
import { ProductThumbnail } from "../../components/ProductThumbnail";
import { PosCustomerPicker } from "../../components/PosCustomerPicker";
import { createReceiptPdf, downloadReceiptPdf } from "../../lib/receiptPdf";
import { normalizeWaPhone, whatsappWebReceiptUrl, printReceipt } from "../../lib/receiptActions";
import { useSearchParams } from "react-router-dom";
import { applyTrainingSales, completeTrainingSale, readTrainingSales, resetTrainingSales, type TrainingSale } from "../../lib/trainingPos";

// ---------- Types ----------
interface CartItem {
  productId: string;
  name: string;
  unit: string;
  emoji: string;
  price: number;
  qty: number;
  rxRequired: boolean;
  maxStock: number;
}

type PaymentMethod = "TUNAI" | "DEBIT" | "TRANSFER";
type PaperWidth = "58mm" | "80mm";
type ReceiptTenant = {
  id: string;
  name: string;
  address: string;
  phone: string;
  whatsapp: string;
  npwp?: string;
  logoUrl?: string;
  primaryColor: string;
};
type ReceiptSettings = {
  paperWidth: PaperWidth;
  header: string;
  footer: string;
  showLogo: boolean;
};

interface Receipt {
  trxId: string;
  ts: string;
  pendingSync: boolean;
  training: boolean;
  items: CartItem[];
  subtotal: number;
  discountPct: number;
  discount: number;
  total: number;
  method: PaymentMethod;
  cash: number;
  change: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  cashier: string;
  tenant: ReceiptTenant;
  receiptSettings: ReceiptSettings;
}

const fmtRp = (n: number) => "Rp " + n.toLocaleString("id-ID");

// WhatsApp text receipt (uses *bold* + monospace blocks)
function buildWaReceipt(r: Receipt): string {
  const t = r.tenant;
  const lines: string[] = [];
  if (r.receiptSettings.header) lines.push(r.receiptSettings.header);
  lines.push(`*🧾 Nota ${t.name}*`);
  if (r.training) lines.push("*LATIHAN — BUKAN TRANSAKSI NYATA. TIDAK ADA PEMBAYARAN.*");
  lines.push(t.address);
  lines.push(`Telp: ${t.phone}`);
  lines.push("");
  lines.push(`No. Trx : *${r.trxId}*`);
  if (r.pendingSync) lines.push("*OFFLINE — BELUM TERSINKRON KE SERVER*");
  lines.push(`Tanggal : ${r.ts}`);
  lines.push(`Kasir   : ${r.cashier}`);
  if (r.customerName) lines.push(`Pembeli : ${r.customerName}`);
  lines.push("--------------------------------");
  for (const i of r.items) {
    lines.push(`${i.name}`);
    const right = `${fmtRp(i.qty * i.price)}`;
    lines.push(`  ${i.qty} x ${fmtRp(i.price)}   ${right}`);
  }
  lines.push("--------------------------------");
  lines.push(`Subtotal : ${fmtRp(r.subtotal)}`);
  if (r.discount > 0) lines.push(`Diskon ${r.discountPct}% : -${fmtRp(r.discount)}`);
  lines.push(`*TOTAL    : ${fmtRp(r.total)}*`);
  lines.push(`Metode   : ${r.method}`);
  if (r.method === "TUNAI") {
    lines.push(`Tunai    : ${fmtRp(r.cash)}`);
    lines.push(`Kembali  : ${fmtRp(r.change)}`);
  }
  lines.push("");
  lines.push(r.receiptSettings.footer || "Terima kasih atas kunjungan Anda");
  return lines.join("\n");
}

export function POS() {
  const claims = useAuth((s) => s.claims);
  const user = useAuth((s) => s.user);
  const isAdmin = useAuth((s) => s.isAdmin);
  const isOwner = claims?.role === "OWNER" || isAdmin;
  const tenantId = claims?.tenantId ?? "";

  const [products, setProducts] = useState<DemoProduct[]>([]);
  const [queuedSales, setQueuedSales] = useState<QueuedPosSale[]>([]);
  const [queueReady, setQueueReady] = useState(false);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [tenant, setTenant] = useState<ReceiptTenant | null>(null);
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>({ paperWidth: "58mm", header: "", footer: "Terima kasih atas kunjungan Anda", showLogo: true });
  const [productsLoading, setProductsLoading] = useState(true);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [cashierMaxDiscountPct, setCashierMaxDiscountPct] = useState(10);
  const [offlineEnabled, setOfflineEnabled] = useState(false);
  const maxAllowedDiscountPct = isOwner ? 100 : cashierMaxDiscountPct;
  const [searchParams] = useSearchParams();
  const [training, setTraining] = useState(() => searchParams.get("mode") === "training");
  const [trainingSales, setTrainingSales] = useState<TrainingSale[]>([]);
  const [trainingError, setTrainingError] = useState("");
  const [customerInfoOpen, setCustomerInfoOpen] = useState(false);

  useEffect(() => {
    const refresh = () => {
      try { setTrainingSales(readTrainingSales(tenantId)); setTrainingError(""); }
      catch (error) { setTrainingError(error instanceof Error ? error.message : "Data latihan gagal dibaca."); }
    };
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    let revision = 0;
    setQueueReady(false);
    setProductsLoading(true);
    if (!tenantId) {
      setProductsLoading(false);
      return;
    }
    const failed = (error: Error) => {
      if (!active) return;
      revision++;
      setQueueReady(false);
      setProductsLoading(false);
      console.error("POS inventory or offline queue failed to load.", error);
      alert("Data inventory atau antrean transaksi lokal gagal dimuat. Transaksi baru belum dapat diproses.");
    };
    const stop = subscribeTenantInventory(tenantId, isOwner, (result) => {
      const currentRevision = ++revision;
      void getQueuedPosSales(tenantId).then((pending) => {
        if (!active || currentRevision !== revision) return;
        const data = result.tenant as {
          name?: string;
          profile?: { name?: string; address?: string; phone?: string; whatsapp?: string; npwp?: string };
          branding?: { logoUrl?: string; primaryColor?: string };
          receipt?: { paperWidth?: string; header?: string; footer?: string; showLogo?: boolean };
          posSettings?: { cashierMaxDiscountPct?: number; offlineEnabled?: boolean };
        } | null;
        const profile = data?.profile || {};
        setOfflineEnabled(data?.posSettings?.offlineEnabled === true);
        setQueuedSales(pending);
        setProducts(applyQueuedSalesToInventory(result.products, pending));
        setTenant(data ? {
          id: tenantId,
          name: profile.name || data.name || "Apotek",
          address: profile.address || "",
          phone: profile.phone || "",
          whatsapp: profile.whatsapp || "",
          npwp: profile.npwp,
          logoUrl: data.branding?.logoUrl,
          primaryColor: data.branding?.primaryColor || "#10b981",
        } : null);
        setReceiptSettings({
          paperWidth: data?.receipt?.paperWidth === "80mm" ? "80mm" : "58mm",
          header: data?.receipt?.header || "",
          footer: data?.receipt?.footer || "Terima kasih atas kunjungan Anda",
          showLogo: data?.receipt?.showLogo !== false,
        });
        setCashierMaxDiscountPct(Number.isFinite(data?.posSettings?.cashierMaxDiscountPct)
          ? Math.max(0, Math.min(100, data!.posSettings!.cashierMaxDiscountPct!))
          : 10);
        setQueueReady(true);
        setProductsLoading(false);
      }).catch(failed);
    }, failed);
    return () => { active = false; stop(); };
  }, [tenantId, isOwner]);

  useEffect(() => {
    let active = true;
    const refreshInventory = () => {
      void Promise.all([
        getQueuedPosSales(tenantId),
        loadTenantInventory(tenantId, isOwner),
      ]).then(([pending, inventory]) => {
        if (!active) return;
        setQueuedSales(pending);
        setProducts(applyQueuedSalesToInventory(inventory.products, pending));
      }).catch((error) => console.error("POS inventory refresh failed.", error));
    };
    const handleOnline = () => {
      setIsOnline(true);
      refreshInventory();
    };
    const handleOffline = () => setIsOnline(false);
    const refreshFromLocalQueue = () => {
      void Promise.all([
        getQueuedPosSales(tenantId),
        loadTenantInventory(tenantId, isOwner),
      ]).then(([pending, inventory]) => {
        if (!active) return;
        setQueuedSales(pending);
        setProducts(applyQueuedSalesToInventory(inventory.products, pending));
      }).catch((error) => console.error("POS refresh after background sync failed.", error));
    };
    const handleSyncComplete = () => refreshFromLocalQueue();
    const channel = typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel("batam-farma-offline-pos");
    if (channel) {
      channel.onmessage = (event: MessageEvent<{ tenantId?: string }>) => {
        if (event.data?.tenantId === tenantId) refreshFromLocalQueue();
      };
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("pos-offline-sync-complete", handleSyncComplete);
    return () => {
      active = false;
      channel?.close();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("pos-offline-sync-complete", handleSyncComplete);
    };
  }, [tenantId, isOwner]);

  useEffect(() => {
    if (!isOnline || !queueReady || queuedSales.length === 0 || !tenantId || !user?.uid) return;
    let active = true;
    setSyncing(true);
    void syncQueuedPosSales(tenantId, user.uid).then(async () => {
      const [pending, inventory] = await Promise.all([
        getQueuedPosSales(tenantId),
        loadTenantInventory(tenantId, isOwner),
      ]);
      if (!active) return;
      setSyncing(false);
      setQueuedSales(pending);
      setProducts(applyQueuedSalesToInventory(inventory.products, pending));
    }).catch((error) => {
      console.error("Queued POS sales could not be synchronized.", error);
    }).finally(() => {
      if (active) setSyncing(false);
    });
    return () => { active = false; };
  }, [isOnline, queueReady, queuedSales.length, tenantId, user?.uid, isOwner]);

  const cashierName = user?.displayName || (isAdmin ? "Admin" : user?.email?.split("@")[0] || "Kasir");

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("Semua");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountPct, setDiscountPct] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("TUNAI");
  const [cashReceived, setCashReceived] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [showReceipt, setShowReceipt] = useState<Receipt | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showProfit, setShowProfit] = useState(false); // owner mode: tampilkan HPP & laba di kasir
  const checkoutRequestId = useRef<string | null>(null);
  const [aiHint, setAiHint] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { searchRef.current?.focus(); }, []);

  // Tenant products only
  const tenantProducts = useMemo(
    () => training ? applyTrainingSales(products.filter((p) => p.tenantId === tenantId), trainingSales)
      : products.filter((p) => p.tenantId === tenantId && p.active !== false && !p.sampleOnly),
    [products, tenantId, training, trainingSales]
  );
  const sampleCount = products.filter((product) => product.tenantId === tenantId && product.sampleOnly).length;
  function switchMode(value: boolean) {
    if (checkoutBusy || cart.length > 0) return;
    setTraining(value); setSearch(""); setActiveCategory("Semua"); setShowReceipt(null);
    setCashReceived(0); setDiscountPct(0); checkoutRequestId.current = null;
  }

  const categories = useMemo(() => {
    const set = new Set<string>(["Semua"]);
    tenantProducts.forEach((p) => set.add(p.category));
    return Array.from(set);
  }, [tenantProducts]);

  // AI-enhanced search + filter
  const filtered = useMemo(() => {
    return searchPosProducts(tenantProducts, search, activeCategory);
  }, [tenantProducts, search, activeCategory]);
  const productPage = useCatalogPage(filtered, `${search}:${activeCategory}`);

  // AI hint when no exact match found but synonym suggests something
  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) { setAiHint(null); return; }
    const hasExact = tenantProducts.some((p) =>
      p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    );
    if (hasExact) { setAiHint(null); return; }
    for (const [key, hints] of Object.entries(SYNONYMS)) {
      if (q.includes(key)) {
        const matchedProduct = tenantProducts.find((p) =>
          hints.some((h) => `${p.name} ${p.category}`.toLowerCase().includes(h))
        );
        if (matchedProduct) {
          setAiHint(`💡 AI: "${q}" → kami sarankan "${matchedProduct.name}"`);
          return;
        }
      }
    }
    if (filtered.length === 0) setAiHint(`🔎 Tidak ada produk cocok. Coba kata kunci: "demam", "batuk", "vitamin", "luka"…`);
    else setAiHint(null);
  }, [search, tenantProducts, filtered.length]);

  // Cart helpers
  function addToCart(p: DemoProduct) {
    const stock = availableQty(p.batches);
    if (stock <= 0) {
      const exp = expiredQty(p.batches);
      alert(exp > 0
        ? `${p.name}: tidak ada stok aktif. (${exp} pcs sudah EXPIRED — musnahkan via menu Pemusnahan).`
        : `${p.name} stok habis.`);
      return;
    }
    setCart((c) => {
      const existing = c.find((x) => x.productId === p.id);
      if (existing) {
        if (existing.qty >= stock) {
          alert(`Stok ${p.name} hanya ${stock} ${p.unit}.`);
          return c;
        }
        return c.map((x) => (x.productId === p.id ? { ...x, qty: x.qty + 1 } : x));
      }
      return [...c, {
        productId: p.id,
        name: p.name,
        unit: p.unit,
        emoji: p.emoji,
        price: p.price,
        qty: 1,
        rxRequired: training ? false : p.rxRequired,
        maxStock: stock,
      }];
    });
  }

  function setQty(productId: string, qty: number) {
    setCart((c) => {
      if (qty <= 0) return c.filter((x) => x.productId !== productId);
      return c.map((x) =>
        x.productId === productId
          ? { ...x, qty: Math.min(qty, x.maxStock) }
          : x
      );
    });
  }

  function removeItem(productId: string) {
    setCart((c) => c.filter((x) => x.productId !== productId));
  }

  // Totals
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = cart.reduce((sum, item) => sum + Math.round(item.price * item.qty * discountPct / 100), 0);
  const total = subtotal - discount;
  const change = paymentMethod === "TUNAI" ? cashReceived - total : 0;

  // Estimasi HPP & laba kotor (untuk owner mode) — simulasi FEFO tanpa mutasi
  const estCostTotal = useMemo(() => {
    if (!isOwner || !showProfit) return 0;
    let sum = 0;
    for (const item of cart) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) continue;
      const r = pickFefo(product.batches, item.qty);
      if (r) sum += r.consumed.reduce((s, c) => s + c.qty * (c.costPrice || 0), 0);
    }
    return sum;
  }, [cart, products, showProfit, isOwner]);
  const estProfit = total - estCostTotal;
  const estProfitPct = total > 0 ? (estProfit / total) * 100 : 0;
  const itemCount = cart.reduce((s, i) => s + i.qty, 0);
  const hasRx = cart.some((i) => i.rxRequired);
  const attentionSale = queuedSales.find((sale) => sale.status === "needs-attention");
  const pendingAttention = !!attentionSale;
  const queueBlockedByOtherCashier = !!queuedSales.length && queuedSales[0].cashierUid !== user?.uid;
  const attentionMessage = attentionSale?.lastError === "insufficient_stock"
    ? "Stok server berbeda atau tidak cukup; Owner perlu mencocokkan stok fisik."
    : attentionSale?.lastError === "offline_price_changed"
      ? "Harga berubah saat PC offline; Owner perlu meninjau nota dan harga."
      : attentionSale?.lastError === "permission-denied"
        ? "Server menolak transaksi; Owner perlu memeriksa hak akses atau status transaksi."
        : pendingAttention
          ? "Sinkronisasi ditolak server. Minta Owner memeriksa transaksi ini sebelum melanjutkan."
          : null;

  async function retryPendingSync() {
    if (!isOnline || !user?.uid || syncing) return;
    setSyncing(true);
    try {
      await retryQueuedPosSales(tenantId, user.uid);
      const [pending, inventory] = await Promise.all([
        getQueuedPosSales(tenantId),
        loadTenantInventory(tenantId, isOwner),
      ]);
      setQueuedSales(pending);
      setProducts(applyQueuedSalesToInventory(inventory.products, pending));
    } catch (error) {
      console.error("Manual POS synchronization failed.", error);
      alert("Sinkronisasi gagal. Transaksi tetap tersimpan di PC dan dapat dicoba lagi.");
    } finally {
      setSyncing(false);
    }
  }

  // Hotkeys
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "F4" && cart.length > 0) { e.preventDefault(); handlePay(); }
      if (e.key === "Escape") { setShowReceipt(null); setShowHelp(false); }
      if (e.key === "?" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) { e.preventDefault(); setShowHelp((v) => !v); }
      if (e.key === "F1") { e.preventDefault(); setShowHelp(true); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlePay]);

  async function handlePay() {
    if (cart.length === 0 || checkoutBusy) return;
    if (productsLoading || !queueReady || (training ? !!trainingError : !offlineEnabled && queuedSales.length > 0)) {
      alert("Tunggu pemuatan stok dan sinkronisasi transaksi selesai sebelum membayar.");
      return;
    }
    if (paymentMethod === "TUNAI" && cashReceived < total) {
      alert(`Uang kurang Rp ${(total - cashReceived).toLocaleString("id-ID")}`);
      return;
    }
    if (hasRx) {
      alert("Produk wajib resep tidak dapat dijual sampai proses verifikasi resep apoteker tersedia.");
      return;
    }

    if (!tenant || !user) {
      alert("Data apotek atau akun kasir tidak ditemukan.");
      return;
    }
    if (!training && (pendingAttention || queueBlockedByOtherCashier)) {
      alert("Ada transaksi offline yang perlu diselesaikan dahulu. Sinkronkan atau hubungi Owner sebelum transaksi berikutnya.");
      return;
    }
    setCheckoutBusy(true);
    try {
      const saleInput = {
        tenantId,
        cashierUid: user.uid,
        cashierName,
        requestId: checkoutRequestId.current || (checkoutRequestId.current = crypto.randomUUID()),
        items: cart.map((item) => ({ productId: item.productId, qty: item.qty })),
        discountPct,
        paymentMethod,
        cashReceived,
        isOwner,
      };
      let completed;
      let queuedSale: QueuedPosSale | null = null;
      if (training) {
        const inventory = await loadTenantInventory(tenantId);
        completed = await completeTrainingSale({ ...saleInput, products: inventory.products, maxDiscountPct: maxAllowedDiscountPct });
        setTrainingSales(readTrainingSales(tenantId));
      } else if (!navigator.onLine) {
        if (!offlineEnabled) throw new Error("offline_pilot_disabled");
        const offlineSale = await queueOfflinePosSale(saleInput, products, queuedSales, cashierMaxDiscountPct);
        completed = offlineSale;
        queuedSale = offlineSale.queuedSale;
      } else {
        const intent = await queueOfflinePosSale(saleInput, products, queuedSales, cashierMaxDiscountPct);
        try {
          completed = await completePosSale({ ...saleInput, products, expectedPrices: intent.queuedSale.expectedPrices });
        } catch (error) {
          if (!isNetworkError(error)) {
            await acknowledgeQueuedPosSale(intent.queuedSale.key, tenantId);
            throw error;
          }
          if (!offlineEnabled) {
            setQueuedSales(await getQueuedPosSales(tenantId));
            throw new Error("offline_pilot_disabled");
          }
          completed = intent;
          queuedSale = intent.queuedSale;
        }
        if (!queuedSale) await acknowledgeQueuedPosSale(intent.queuedSale.key, tenantId);
      }
      if (queuedSale) {
        setQueuedSales((current) => [...current, queuedSale!]);
        setProducts((current) => applyQueuedSalesToInventory(current, [queuedSale!]));
      }
      const receiptTs = completed.createdAt.toLocaleString("id-ID");
      setShowReceipt({
        trxId: completed.trxId,
        ts: receiptTs,
        pendingSync: queuedSale !== null,
        training,
        items: cart.map((item) => {
          const serverItem = completed.items.find((line) => line.productId === item.productId);
          return serverItem ? { ...item, name: serverItem.name, price: serverItem.unitPrice, qty: serverItem.qty } : item;
        }),
        subtotal: completed.subtotalRp,
        discountPct: completed.discountPct,
        discount: completed.discountRp,
        total: completed.totalRp,
        method: paymentMethod,
        cash: cashReceived,
        change: Math.max(0, cashReceived - completed.totalRp),
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim(),
        cashier: cashierName,
        tenant,
        receiptSettings,
      });
      checkoutRequestId.current = null;
      setCart([]);
      setCashReceived(0);
      setDiscountPct(0);
      setCustomerName("");
      setCustomerPhone("");
      setCustomerEmail("");
      if (!training && !queuedSale) {
        void Promise.all([
          loadTenantInventory(tenantId, isOwner),
          getQueuedPosSales(tenantId),
        ]).then(([result, pending]) => {
          setQueuedSales(pending);
          setProducts(applyQueuedSalesToInventory(result.products, pending));
        }).catch((error) => console.error("POS inventory refresh failed after checkout.", error));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "checkout_failed";
      const messages: Record<string, string> = {
        insufficient_stock: "Stok berubah atau tidak cukup. Muat ulang POS lalu coba lagi.",
        insufficient_cash: "Uang tunai kurang dari total transaksi.",
        discount_limit_exceeded: "Diskon melebihi batas yang diizinkan untuk akun ini.",
        rx_verification_required: "Penjualan obat resep dinonaktifkan sampai verifikasi resep terhubung ke backend.",
        too_many_batches_for_checkout: "Terlalu banyak batch aktif untuk satu produk. Minta Owner merapikan batch lalu coba lagi.",
        sale_has_too_many_batches: "Checkout Spark membatasi transaksi ke empat produk. Pisahkan item ke transaksi berikutnya.",
        quantity_crosses_batch_boundary: "Jumlah item melewati stok pada batch FEFO pertama. Kurangi jumlah atau selesaikan batch sebelumnya dahulu.",
        batch_expiry_migration_required: "Batch belum dimigrasikan. Minta Owner jalankan Migrasi data batch sebelum checkout.",
        invalid_sale_total: "Nilai transaksi terlalu besar untuk diproses dengan aman.",
        offline_price_changed: "Harga produk berubah sejak transaksi offline. Hubungi Owner untuk meninjau transaksi sebelum mengulang.",
        offline_concurrency_unavailable: "Browser ini belum mendukung transaksi offline aman. Gunakan Chrome atau Edge terbaru, atau tunggu internet kembali.",
        offline_pilot_disabled: "Pilot menggunakan transaksi online. Internet terputus; jangan ulangi pembayaran. Sambungkan internet dan gunakan keranjang yang sama untuk memastikan transaksi sebelumnya sebelum melanjutkan.",
        checkout_request_conflict: "ID transaksi sudah dipakai untuk keranjang berbeda. Hubungi Owner dan periksa transaksi sebelum melanjutkan.",
        training_sample_only: "Mode latihan hanya menerima produk SAMPLE. Pilih ulang produk dari katalog latihan.",
      };
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      alert(messages[message] || (code === "permission-denied"
        ? "Transaksi ditolak oleh Rules Spark. Pastikan batch sudah dimigrasikan dan ulangi setelah memeriksa transaksi terbaru."
        : "Transaksi gagal dicatat. Pastikan apakah pembayaran sudah diterima sebelum mengulang."));
    } finally {
      setCheckoutBusy(false);
    }
  }

  // Quick cash buttons
  const cashSuggestions = useMemo(() => {
    if (total <= 0) return [];
    const round = (n: number, step: number) => Math.ceil(n / step) * step;
    return Array.from(new Set([
      total,
      round(total, 5000),
      round(total, 10000),
      round(total, 50000),
      round(total, 100000),
    ])).sort((a, b) => a - b);
  }, [total]);

  return (
    <div className="grid lg:grid-cols-[1fr_400px] gap-4 lg:h-[calc(100vh-100px)]">
      <div className={`card lg:col-span-2 p-3 text-sm ${training ? "border-2 border-warn-500 bg-warn-50" : ""}`}>
        <div className="flex items-center justify-between gap-3">
          <strong>{training ? "LATIHAN — BUKAN TRANSAKSI NYATA" : "POS operasional"}</strong>
          <button className="btn-secondary" disabled={checkoutBusy || cart.length > 0} onClick={() => switchMode(!training)}>{training ? "Kembali ke POS operasional" : `Mode latihan (${sampleCount} produk SAMPLE)`}</button>
        </div>
        {training && <div className="mt-2">
          <p>Hanya produk SAMPLE. Stok latihan tersimpan di browser ini; tidak mengurangi stok database dan tidak masuk omzet/laporan. Jangan menerima uang atau menyerahkan obat.</p>
          <p>{trainingSales.length} transaksi latihan lokal.</p>
          <button className="btn-secondary mt-2" disabled={checkoutBusy || cart.length > 0} onClick={async () => {
            if (!confirm("Reset seluruh transaksi dan stok latihan di browser ini? Data operasional tidak berubah.")) return;
            try { await resetTrainingSales(tenantId); setTrainingSales([]); setTrainingError(""); checkoutRequestId.current = null; }
            catch (error) { setTrainingError(error instanceof Error ? error.message : "Reset latihan gagal."); }
          }}>Reset latihan</button>
          {trainingError && <p role="alert" className="text-danger-600">{trainingError}</p>}
        </div>}
      </div>
      {(!isOnline || queuedSales.length > 0 || !persistentFirestoreCache) && (
        <div className={`card lg:col-span-2 flex flex-wrap items-center justify-between gap-3 p-3 text-sm ${
          pendingAttention ? "border border-danger-200 bg-danger-50 text-danger-800" : "border border-warn-200 bg-warn-50 text-warn-800"
        }`}>
          <div>
            {!persistentFirestoreCache && <p>Cache data offline browser tidak tersedia; POS offline mungkin tidak dapat membaca stok.</p>}
            {!isOnline && <p>{offlineEnabled ? "Internet terputus. Transaksi baru akan disimpan di PC ini dan stok lokal dikurangi." : "Pilot online: transaksi baru ditunda sampai internet kembali. Jangan mengulang pembayaran."}</p>}
            {queuedSales.length > 0 && (
              <p>
                {queuedSales.length} transaksi menunggu sinkronisasi
                {pendingAttention ? ". Ada transaksi yang perlu ditinjau sebelum dijual lagi." : syncing ? " — sedang dikirim…" : "."}
                {attentionMessage && ` ${attentionMessage}`}
                {queueBlockedByOtherCashier && " Masuk kembali dengan akun kasir yang membuat transaksi pertama agar dapat disinkronkan."}
                {" "}Owner baru melihatnya setelah sinkronisasi berhasil.
              </p>
            )}
          </div>
          {queuedSales.length > 0 && (
            <button
              className="btn-secondary"
              onClick={() => void retryPendingSync()}
              disabled={!isOnline || syncing || queueBlockedByOtherCashier}
            >
              {syncing ? "Menyinkronkan…" : "Sinkronkan sekarang"}
            </button>
          )}
        </div>
      )}
      {/* ===== Left: products ===== */}
      <section className="flex flex-col min-h-0">
        {/* Search + AI */}
        <div className="card p-3 space-y-2">
          <div className="relative">
            <input
              ref={searchRef}
              className="input pl-10 text-base"
              placeholder='🔎 Cari nama / kategori / gejala — coba "demam", "batuk", "vitamin"…  (F2)'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">🔍</span>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
              >
                ✕
              </button>
            )}
          </div>
          {aiHint && (
            <div className="text-xs px-2 py-1.5 rounded bg-brand-50 text-brand-700 border border-brand-100">
              {aiHint}
            </div>
          )}
          {/* Categories */}
          <div className="flex gap-1.5 flex-wrap">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setActiveCategory(c)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border ${
                  activeCategory === c
                    ? "bg-brand-500 text-white border-brand-500"
                    : "bg-white text-ink-600 border-surface-200 hover:bg-surface-50"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Product grid */}
        <CatalogPagination {...productPage} />
        <div className="flex-1 overflow-y-auto mt-3 pr-1">
          {filtered.length === 0 ? (
            <div className="card p-12 text-center text-ink-400">
              <div className="text-5xl mb-3">📦</div>
              <div className="text-sm">{productsLoading ? "Memuat katalog obat…" : !training && sampleCount > 0 && tenantProducts.length === 0
                ? `Tersedia ${sampleCount} obat SAMPLE di Mode Latihan, bukan POS operasional.` : "Tidak ada produk yang cocok"}</div>
              {!training && sampleCount > 0 && <button className="btn-primary mt-3" disabled={checkoutBusy || cart.length > 0}
                onClick={() => switchMode(true)}>Tampilkan {sampleCount} obat SAMPLE untuk latihan POS</button>}
              <div className="text-xs mt-2">
                {!training && sampleCount > 0 ? "Transaksi latihan tidak mengubah stok atau omzet operasional." :
                  'Tip: ketik nama atau kategori obat untuk mencari produk.'
                }
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {productPage.items.map((p) => {
                const stock = availableQty(p.batches);
                const expCount = expiredQty(p.batches);
                const out = stock <= 0;
                const low = stock > 0 && stock < p.minStock;
                const worst = productWorstZone(p);
                const showZone = worst === "WARNING" || worst === "CRITICAL";
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    disabled={out}
                    className={`card text-left p-3 transition relative overflow-hidden group ${
                      out ? "opacity-50 cursor-not-allowed" : "hover:ring-2 hover:ring-brand-500/40 hover:-translate-y-0.5"
                    }`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${p.gradient} opacity-30 group-hover:opacity-50 transition`} />
                    {showZone && worst && (
                      <span className={`absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded font-bold ${
                        worst === "CRITICAL" ? "bg-danger-500 text-white" : "bg-orange-500 text-white"
                      }`}>
                        {worst === "CRITICAL" ? "🔴 ED dekat" : "🟠 ED <90hr"}
                      </span>
                    )}
                    <div className="relative">
                      <div className="relative">
                        <ProductThumbnail name={p.name} imageUrl={p.imageUrl} className="w-full h-28" />
                        {p.rxRequired && (
                          <span className="absolute top-1 right-1 text-[9px] bg-danger-100 text-danger-700 px-1.5 py-0.5 rounded font-bold">Rx</span>
                        )}
                      </div>
                      <div className="font-semibold text-sm leading-tight mt-2 line-clamp-2 min-h-[2.4em]">
                        {p.name}
                      </div>
                      <div className="text-[10px] text-ink-500 mt-0.5">{p.category}</div>
                      <div className="mt-2 flex items-end justify-between">
                        <div className="font-bold text-brand-700">{fmtRp(p.price)}</div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          out ? "bg-danger-100 text-danger-700"
                              : low ? "bg-warn-100 text-warn-700"
                                    : "bg-accent-100 text-accent-700"
                        }`}>
                          {out ? "Habis" : `${stock} ${p.unit}`}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ===== Right: cart ===== */}
      <aside className="card flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-surface-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">🛒 Keranjang</h2>
            <div className="text-xs text-ink-500">{itemCount} item · {cart.length} produk</div>
          </div>
          {cart.length > 0 && (
            <button onClick={() => setCart([])} className="text-xs text-danger-600 hover:underline">
              Kosongkan
            </button>
          )}
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {cart.length === 0 ? (
            <div className="text-center text-ink-400 py-12 text-sm">
              <div className="text-5xl mb-3">🛒</div>
              Klik produk untuk menambah ke keranjang
            </div>
          ) : (
            <div className="space-y-1.5">
              {cart.map((i) => (
                <div key={i.productId} className="bg-surface-50 rounded-lg p-2.5">
                  <div className="flex items-start gap-2">
                    <ProductThumbnail name={i.name} imageUrl={tenantProducts.find((product) => product.id === i.productId)?.imageUrl} className="w-14 h-14" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-tight">{i.name}</div>
                      <div className="text-[10px] text-ink-500 flex items-center gap-1">
                        {fmtRp(i.price)} / {i.unit}
                        {i.rxRequired && (
                          <span className="bg-danger-100 text-danger-700 px-1 rounded font-bold">Rx</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removeItem(i.productId)}
                      className="text-ink-300 hover:text-danger-600 text-sm"
                    >✕</button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setQty(i.productId, i.qty - 1)}
                        className="w-7 h-7 rounded bg-white border border-surface-200 hover:bg-surface-100 font-bold"
                      >−</button>
                      <input
                        type="number"
                        value={i.qty}
                        onChange={(e) => setQty(i.productId, parseInt(e.target.value) || 0)}
                        className="w-12 h-7 text-center text-sm border border-surface-200 rounded"
                      />
                      <button
                        onClick={() => setQty(i.productId, i.qty + 1)}
                        disabled={i.qty >= i.maxStock}
                        className="w-7 h-7 rounded bg-white border border-surface-200 hover:bg-surface-100 font-bold disabled:opacity-40"
                      >+</button>
                    </div>
                    <div className="font-bold text-brand-700 text-sm">
                      {fmtRp(i.price * i.qty)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer: totals + payment */}
        <div className="border-t border-surface-100 px-4 py-3 space-y-2 bg-white">
          {/* Customer info (optional) */}
          <details className="group" open={customerInfoOpen} onToggle={(event) => setCustomerInfoOpen(event.currentTarget.open)}>
            <summary className="flex items-center justify-between cursor-pointer text-xs font-medium text-ink-600 hover:text-brand-600 select-none">
              <span>
                👤 Info Pelanggan
                {customerPhone && <span className="text-accent-600"> · WA</span>}
                {customerEmail && <span className="text-brand-600"> · email</span>}
              </span>
              <span className="text-ink-400 group-open:rotate-90 transition-transform">▸</span>
            </summary>
            {customerInfoOpen && <PosCustomerPicker tenantId={tenantId} onSelect={(customer) => {
              setCustomerName(customer.name);
              setCustomerPhone(customer.phone);
            }} />}
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nama (opsional)"
                className="input h-8 text-sm"
              />
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="No HP / WA"
                className="input h-8 text-sm"
              />
              <input
                type="email"
                disabled
                value=""
                placeholder="Email sementara dinonaktifkan"
                className="input h-8 text-sm col-span-2"
              />
            </div>
            {customerPhone && (
              <div className="text-[10px] text-accent-600 mt-1">
                ✓ Nota WA → +{normalizeWaPhone(customerPhone) ?? "(invalid)"}
              </div>
            )}
          </details>

          {/* Discount */}
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2">
              <span>Diskon</span>
              <input
                type="number"
                value={discountPct}
                onChange={(e) => setDiscountPct(Math.max(0, Math.min(maxAllowedDiscountPct, parseInt(e.target.value) || 0)))}
                className="w-14 h-7 text-center border border-surface-200 rounded text-xs"
                min={0} max={maxAllowedDiscountPct}
              />
              <span className="text-ink-500">%</span>
            </label>
            <span className="text-ink-500">−{fmtRp(discount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Subtotal</span>
            <span>{fmtRp(subtotal)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold border-t border-surface-100 pt-2">
            <span>Total</span>
            <span className="text-brand-700">{fmtRp(total)}</span>
          </div>

          {/* Owner mode: HPP & Laba (toggle, tidak ditampilkan di struk) */}
          {isOwner && <div>
            <button
              type="button"
              onClick={() => setShowProfit((v) => !v)}
              className="text-[10px] text-ink-400 hover:text-brand-600 flex items-center gap-1"
              title="Mode Owner: lihat HPP & estimasi laba (tidak ditampilkan ke pelanggan)"
            >
              {showProfit ? "🔓" : "🔒"} {showProfit ? "Sembunyikan" : "Tampilkan"} HPP / Laba
            </button>
            {showProfit && total > 0 && (
              <div className="mt-1 bg-emerald-50 border border-emerald-200 rounded p-2 text-[11px] space-y-0.5">
                <div className="flex justify-between"><span className="text-ink-600">HPP (FEFO)</span><span className="font-semibold text-orange-700">{fmtRp(estCostTotal)}</span></div>
                <div className="flex justify-between"><span className="text-ink-600">Estimasi Laba</span><span className={`font-bold ${estProfit < 0 ? "text-danger-700" : "text-emerald-700"}`}>{fmtRp(estProfit)} ({estProfitPct.toFixed(1)}%)</span></div>
                {estProfit < 0 && <div className="text-[10px] text-danger-600">⚠ RUGI! Cek harga jual atau diskon.</div>}
                {estProfit >= 0 && estProfitPct < 10 && <div className="text-[10px] text-orange-600">⚠ Margin tipis (&lt;10%).</div>}
              </div>
            )}
          </div>}

          {/* Payment method */}
          <div className="grid grid-cols-4 gap-1 mt-2">
            {(["TUNAI", "DEBIT", "TRANSFER"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={`py-1.5 rounded text-xs font-medium border ${
                  paymentMethod === m
                    ? "bg-brand-500 text-white border-brand-500"
                    : "bg-white text-ink-600 border-surface-200"
                }`}
              >
                {m === "TUNAI" ? "💵" : m === "DEBIT" ? "💳" : "🏦"} {m}
              </button>
            ))}
          </div>

          {/* Cash input */}
          {paymentMethod === "TUNAI" && total > 0 && (
            <div className="space-y-1.5">
              <input
                type="number"
                value={cashReceived || ""}
                onChange={(e) => setCashReceived(parseInt(e.target.value) || 0)}
                className="input text-right text-base"
                placeholder="Uang diterima"
              />
              <div className="flex gap-1 flex-wrap">
                {cashSuggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setCashReceived(s)}
                    className="text-[11px] px-2 py-1 rounded bg-surface-100 hover:bg-surface-200"
                  >
                    {fmtRp(s)}
                  </button>
                ))}
              </div>
              {cashReceived > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Kembalian</span>
                  <span className={change >= 0 ? "text-accent-600 font-bold" : "text-danger-600 font-bold"}>
                    {fmtRp(change)}
                  </span>
                </div>
              )}
            </div>
          )}

          {hasRx && (
            <div className="text-[11px] bg-danger-50 text-danger-700 border border-danger-100 rounded px-2 py-1.5">
              ⚠️ Mengandung obat Rx — wajib verifikasi resep oleh apoteker.
            </div>
          )}

          <button
            onClick={handlePay}
            disabled={productsLoading || !queueReady || (training ? !!trainingError : ((!offlineEnabled && (!isOnline || queuedSales.length > 0)) || pendingAttention || queueBlockedByOtherCashier)) || checkoutBusy || cart.length === 0 || (paymentMethod === "TUNAI" && cashReceived < total)}
            className="btn-primary w-full text-base py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {checkoutBusy ? "Menyimpan transaksi…" : `${training ? "Simulasi bayar" : "Bayar"} · ${fmtRp(total)}`} <span className="text-[10px] opacity-70 ml-1">(F4)</span>
          </button>
        </div>
      </aside>

      {/* Receipt modal */}
      <AnimatePresence>
        {showReceipt && (
          <ReceiptModal receipt={showReceipt} onClose={() => setShowReceipt(null)} />
        )}
      </AnimatePresence>

      {/* Floating help button */}
      <button
        onClick={() => setShowHelp(true)}
        className="fixed bottom-20 md:bottom-4 right-4 z-30 w-11 h-11 rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-700 grid place-items-center text-lg"
        title="Bantuan keyboard shortcut (?)"
      >?</button>

      {/* Keyboard shortcut help overlay */}
      {showHelp && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={() => setShowHelp(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold">⌨ Shortcut Keyboard POS</h2>
              <button onClick={() => setShowHelp(false)} className="text-2xl text-ink-400 hover:text-ink-700">×</button>
            </div>
            <div className="space-y-2 text-sm">
              {[
                { key: "F1 / ?", desc: "Tampilkan bantuan ini" },
                { key: "F2", desc: "Fokus ke kotak pencarian produk" },
                { key: "F4", desc: "Bayar / proses transaksi (jika cart tidak kosong)" },
                { key: "Enter", desc: "Konfirmasi (di field tertentu)" },
                { key: "Esc", desc: "Tutup modal/struk/help" },
                { key: "↑ / ↓", desc: "Navigasi item (jika fokus pada list)" },
              ].map((s) => (
                <div key={s.key} className="flex items-center justify-between py-2 border-b border-surface-100 last:border-0">
                  <kbd className="bg-surface-100 border border-surface-200 rounded px-2 py-1 text-xs font-mono font-semibold">{s.key}</kbd>
                  <span className="text-ink-700 text-sm">{s.desc}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 text-xs text-ink-500 bg-brand-50 border border-brand-100 rounded-lg p-3">
              💡 Tip: tekan <kbd className="bg-white border border-surface-200 rounded px-1 font-mono">?</kbd> kapan saja di POS untuk membuka bantuan ini.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Receipt modal: thermal-printable + WhatsApp send =====
export function ReceiptModal({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  const [paper, setPaper] = useState<PaperWidth>(receipt.receiptSettings.paperWidth);
  const [waPhone, setWaPhone] = useState(receipt.customerPhone);
  const [actionError, setActionError] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfNotice, setPdfNotice] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  function handlePrint(pdf = false) {
    setActionError("");
    const node = printRef.current;
    if (!node) { setActionError("Pratinjau nota belum tersedia. Buka kembali nota sebelum mencetak."); return; }
    try { printReceipt(node, paper, receipt.trxId, pdf); }
    catch (error) { setActionError(error instanceof Error ? error.message : "Nota gagal dicetak."); }
  }

  async function handleSendWa() {
    setActionError("");
    setPdfNotice("");
    if (!normalizeWaPhone(waPhone)) {
      setActionError("Isi nomor WhatsApp pelanggan yang valid terlebih dahulu, misalnya 081234567890.");
      return;
    }
    let popup: Window | null = null;
    setPdfBusy(true);
    try {
      // Reserve the tab during the click, before asynchronous PDF generation.
      popup = window.open("about:blank", "_blank");
      if (!popup) throw new Error("Pop-up diblokir. Izinkan pop-up lalu coba lagi.");
      popup.opener = null;
      const bytes = await createReceiptPdf(buildWaReceipt(receipt));
      downloadReceiptPdf(bytes, receipt.trxId);
      popup.location.href = whatsappWebReceiptUrl(waPhone, "");
      setPdfNotice("PDF nota sudah dibuat dan unduhan diminta. Di WhatsApp, klik lampiran > Dokumen, pilih PDF dari folder unduhan, periksa penerima, lalu Kirim. Belum dilampirkan atau terkirim otomatis.");
    } catch (error) {
      popup?.close();
      setActionError(error instanceof Error ? error.message : "PDF atau WhatsApp Web gagal dibuka.");
    } finally { setPdfBusy(false); }
  }

  // Approximate pixel width of paper for on-screen preview (1mm ≈ 3.78px @ 96dpi)
  const previewPx = paper === "58mm" ? 220 : 300;
  const t = receipt.tenant;

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[95vh] overflow-y-auto my-auto"
        initial={{ y: 20, scale: 0.95, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 20, scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-accent-500 to-brand-600 text-white p-5 text-center">
          <div className="text-4xl mb-1">✅</div>
          <div className="text-base font-bold">{receipt.training ? "Simulasi selesai — tidak ada pembayaran" : receipt.pendingSync ? "Transaksi tersimpan di PC" : "Pembayaran Berhasil"}</div>
          <div className="text-[11px] opacity-80 font-mono">{receipt.trxId}</div>
          {receipt.pendingSync && <div className="mt-1 text-xs font-semibold">Offline — belum tersinkron ke server</div>}
        </div>

        {/* Paper size selector */}
        <div className="px-4 pt-3 flex items-center justify-between text-xs">
          <span className="text-ink-500">Ukuran kertas struk:</span>
          <div className="flex gap-1">
            {(["58mm", "80mm"] as PaperWidth[]).map((p) => (
              <button
                key={p}
                onClick={() => setPaper(p)}
                className={`px-2.5 py-1 rounded text-xs font-medium border ${
                  paper === p ? "bg-brand-500 text-white border-brand-500" : "bg-white text-ink-600 border-surface-200"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Receipt preview (thermal-style) */}
        <div className="p-4 bg-surface-50">
          <div
            className="bg-white mx-auto shadow-sm border border-surface-200"
            style={{ width: previewPx }}
          >
            <div ref={printRef} className="receipt" style={{ padding: "10px 8px", fontFamily: "ui-monospace, 'Courier New', monospace", fontSize: 11, lineHeight: 1.35, color: "#000" }}>
              {receipt.training && <div style={{ textAlign: "center", fontWeight: 700 }}>LATIHAN — BUKAN TRANSAKSI NYATA<br />TIDAK ADA PEMBAYARAN</div>}
              {receipt.receiptSettings.showLogo && t.logoUrl && <img src={t.logoUrl} alt="Logo apotek" className="mx-auto mb-1 max-h-10 max-w-24 object-contain" />}
              <div className="center bold lg" style={{ textAlign: "center", fontWeight: 700, fontSize: 13, color: t.primaryColor }}>
                {t.name}
              </div>
              {receipt.receiptSettings.header && <div className="center sm" style={{ textAlign: "center", fontSize: 10 }}>{receipt.receiptSettings.header}</div>}
              <div className="center sm" style={{ textAlign: "center", fontSize: 10 }}>{t.address}</div>
              <div className="center sm" style={{ textAlign: "center", fontSize: 10 }}>Telp: {t.phone}{t.whatsapp ? ` · WA: ${t.whatsapp}` : ""}</div>
              {t.npwp && <div className="center sm" style={{ textAlign: "center", fontSize: 10 }}>NPWP: {t.npwp}</div>}
              <div className="sep" style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
              <div style={{ fontSize: 10 }}>
                <div className="row" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>No</span><span style={{ fontWeight: 700 }}>{receipt.trxId}</span>
                </div>
                {receipt.pendingSync && (
                  <div className="center bold" style={{ textAlign: "center", fontWeight: 700, margin: "4px 0" }}>
                    OFFLINE — BELUM TERSINKRON
                  </div>
                )}
                <div className="row" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Tgl</span><span>{receipt.ts}</span>
                </div>
                <div className="row" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Kasir</span><span>{receipt.cashier}</span>
                </div>
                {receipt.customerName && (
                  <div className="row" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Pembeli</span><span>{receipt.customerName}</span>
                  </div>
                )}
              </div>
              <div className="sep" style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

              {receipt.items.map((i) => (
                <div key={i.productId} className="item" style={{ margin: "2px 0" }}>
                  <div style={{ wordBreak: "break-word" }}>{i.name}{i.rxRequired ? " [Rx]" : ""}</div>
                  <div className="row qtyline" style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                    <span>  {i.qty} x {i.price.toLocaleString("id-ID")}</span>
                    <span>{(i.qty * i.price).toLocaleString("id-ID")}</span>
                  </div>
                </div>
              ))}

              <div className="sep" style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

              <div className="row" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Subtotal</span><span>{receipt.subtotal.toLocaleString("id-ID")}</span>
              </div>
              {receipt.discount > 0 && (
                <div className="row" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Diskon ({receipt.discountPct}%)</span><span>-{receipt.discount.toLocaleString("id-ID")}</span>
                </div>
              )}
              <div className="row bold lg" style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13, marginTop: 2 }}>
                <span>TOTAL</span><span>Rp {receipt.total.toLocaleString("id-ID")}</span>
              </div>
              <div className="row" style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                <span>Bayar ({receipt.method})</span>
                <span>{(receipt.method === "TUNAI" ? receipt.cash : receipt.total).toLocaleString("id-ID")}</span>
              </div>
              {receipt.method === "TUNAI" && (
                <div className="row" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Kembali</span><span>{receipt.change.toLocaleString("id-ID")}</span>
                </div>
              )}

              <div className="sep" style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
              <div className="footer" style={{ textAlign: "center", fontSize: 10 }}>
                {receipt.receiptSettings.footer}<br />
                <span style={{ fontSize: 9, color: "#666" }}>Powered by Batam Farma</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pt-3">
          <label htmlFor="receipt-wa-phone" className="label text-xs">Nomor WhatsApp pelanggan</label>
          <input id="receipt-wa-phone" type="tel" className="input" placeholder="081234567890 / +6281234567890"
            value={waPhone} onChange={(event) => { setWaPhone(event.target.value); setActionError(""); }} />
          <p className="text-[11px] text-ink-500 mt-1">Isi nomor atau pilih pelanggan di POS. Tombol membuat unduhan PDF lalu membuka chat WhatsApp Web memakai sesi yang sudah login (scan QR jika diminta). Lampirkan PDF lewat Lampiran &gt; Dokumen, lalu tekan Kirim sendiri. Tidak mengirim teks nota atau melampirkan file otomatis.</p>
          {pdfNotice && <p role="status" className="text-xs text-accent-700 mt-2">{pdfNotice}</p>}
          {actionError && <p role="alert" className="text-xs text-danger-600 mt-2">{actionError}</p>}
        </div>
        <div className="p-4 bg-white border-t border-surface-100 grid grid-cols-2 gap-2">
          <button
            onClick={() => handlePrint()}
            className="btn-secondary text-sm"
            title="Cetak melalui dialog browser ke printer thermal"
          >
            🖨 Print {paper}
          </button>
          <button
            onClick={() => void handleSendWa()}
            disabled={pdfBusy}
            className="text-sm font-medium rounded-lg py-2 transition bg-[#25D366] hover:bg-[#1faa55] text-white"
            title="Unduh PDF dan buka chat; lampirkan file dan Kirim manual"
          >
            {pdfBusy ? "Membuat PDF..." : "PDF + Buka WhatsApp"}
          </button>
          <button onClick={() => handlePrint(true)} className="btn-secondary text-sm col-span-2">Print / Simpan PDF (A4)</button>
          <button
            disabled
            className="btn-secondary text-sm opacity-40 cursor-not-allowed"
            title="Kirim email sementara dinonaktifkan"
          >
            ✉️ Kirim Email
          </button>
          <button
            disabled
            className="btn-secondary text-sm opacity-40 cursor-not-allowed"
            title="Salin teks sementara dinonaktifkan"
          >
            📋 Salin Teks
          </button>
          <button onClick={onClose} className="btn-primary col-span-2 text-sm">
            Selesai (Esc)
          </button>
        </div>
        <p className="px-4 pb-3 text-[10px] text-ink-400 text-center">
          PDF: pilih Save as PDF / Simpan sebagai PDF pada dialog cetak. Email dan Salin Teks sementara dinonaktifkan.
        </p>
      </motion.div>
    </motion.div>
  );
}
