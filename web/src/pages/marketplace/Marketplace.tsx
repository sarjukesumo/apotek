import { useEffect, useMemo, useState } from "react";
import { collectionGroup, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

// ---------- Types ----------
type Product = {
  id: string;
  tenantId: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  pharmacy: string;
  city: string;
  distanceKm: number;
  rating: number;
  reviews: number;
  emoji: string;
  gradient: string;
  imageUrl?: string;
  desc: string;
  unit: string;
  rxRequired: boolean;
};

const CATEGORIES = ["Semua", "Obat Bebas", "Antibiotik", "Vitamin", "Herbal", "Alat Kesehatan", "Ibu & Anak", "Diabetes", "Antiseptik", "Pernapasan", "P3K"];

// ---------- Smart AI Search ----------
// Maps user-friendly symptoms / casual phrases → keywords that exist in product name/desc/category.
type SmartIntent = {
  /** Lowercase phrases that trigger this intent */
  triggers: string[];
  /** Friendly label shown in the AI banner */
  label: string;
  /** Short advice/explanation */
  advice: string;
  /** Keywords matched against product name + desc + category (lowercase) */
  match: string[];
};

const SMART_INTENTS: SmartIntent[] = [
  {
    triggers: ["sakit kepala", "pusing", "migrain", "headache", "nyeri kepala", "kepala sakit"],
    label: "Sakit kepala / migrain",
    advice: "Pereda nyeri umum. Jika nyeri berlanjut > 3 hari, konsultasi dokter.",
    match: ["paracetamol", "ibuprofen", "aspirin", "antalgin", "panadol"],
  },
  {
    triggers: ["demam", "panas", "meriang", "fever", "suhu tinggi"],
    label: "Demam / penurun panas",
    advice: "Kompres + minum banyak air. Cek suhu berkala — jika > 39°C, segera ke dokter.",
    match: ["paracetamol", "ibuprofen", "panadol", "termometer"],
  },
  {
    triggers: ["flu", "pilek", "hidung tersumbat", "bersin", "common cold"],
    label: "Flu & pilek",
    advice: "Istirahat cukup, minum vitamin C. Antibiotik tidak diperlukan untuk flu biasa.",
    match: ["paracetamol", "vitamin c", "masker", "madu", "obat flu"],
  },
  {
    triggers: ["batuk", "tenggorokan gatal", "cough", "tenggorokan sakit", "radang tenggorokan"],
    label: "Batuk & tenggorokan",
    advice: "Hindari minuman dingin. Madu hangat membantu meredakan iritasi.",
    match: ["batuk", "obh", "madu", "vitamin c", "salbutamol"],
  },
  {
    triggers: ["asma", "sesak nafas", "sesak napas", "susah bernafas", "asthma"],
    label: "Asma / sesak napas",
    advice: "Inhaler perlu resep dokter. Jika serangan parah, segera ke IGD.",
    match: ["salbutamol", "inhaler", "pernapasan"],
  },
  {
    triggers: ["infeksi", "antibiotik", "radang", "luka bernanah"],
    label: "Antibiotik (perlu resep)",
    advice: "Antibiotik HARUS dengan resep dokter. Jangan stop tengah jalan.",
    match: ["amoxicillin", "antibiotik", "cefadroxil"],
  },
  {
    triggers: ["luka", "lecet", "perban", "jatuh", "berdarah"],
    label: "Pertolongan pertama (P3K)",
    advice: "Bersihkan luka dengan antiseptik sebelum ditutup plester.",
    match: ["plester", "hansaplast", "perban", "betadine", "p3k", "antiseptik", "hand sanitizer"],
  },
  {
    triggers: ["daya tahan", "imun", "lemas", "vitamin", "suplemen", "sehat"],
    label: "Daya tahan tubuh",
    advice: "Pola makan + tidur cukup tetap utama. Vitamin sebagai pelengkap.",
    match: ["vitamin", "multivitamin", "madu", "imboost"],
  },
  {
    triggers: ["bayi", "anak", "balita", "menyusui"],
    label: "Kebutuhan ibu & anak",
    advice: "Konsultasi dokter anak untuk dosis & pemilihan produk.",
    match: ["bayi", "anak", "susu formula", "multivitamin anak"],
  },
  {
    triggers: ["diabetes", "gula darah", "kencing manis", "insulin"],
    label: "Diabetes",
    advice: "Insulin & obat diabetes wajib resep. Cek gula darah rutin.",
    match: ["insulin", "diabetes", "metformin", "glukosa"],
  },
  {
    triggers: ["tekanan darah", "hipertensi", "darah tinggi", "tensimeter"],
    label: "Tekanan darah",
    advice: "Pantau tensi pagi & malam. Hindari makanan asin.",
    match: ["tensimeter", "amlodipine", "captopril", "hipertensi"],
  },
  {
    triggers: ["masker", "covid", "polusi", "debu"],
    label: "Proteksi pernapasan",
    advice: "Ganti masker setiap 4 jam atau saat lembab.",
    match: ["masker", "n95", "hand sanitizer"],
  },
];

function resolveSmartIntent(qRaw: string): { intent: SmartIntent; trigger: string } | null {
  const q = qRaw.trim().toLowerCase();
  if (q.length < 3) return null;
  for (const intent of SMART_INTENTS) {
    const trigger = intent.triggers.find((t) => q.includes(t));
    if (trigger) return { intent, trigger };
  }
  return null;
}

function matchesIntent(p: Product, intent: SmartIntent): boolean {
  const hay = `${p.name} ${p.desc} ${p.category}`.toLowerCase();
  return intent.match.some((kw) => hay.includes(kw));
}

const QUICK_SUGGESTIONS = ["sakit kepala", "demam", "flu", "batuk", "luka", "vitamin", "diabetes"];

const SORTS = [
  { key: "nearest", label: "📍 Terdekat" },
  { key: "cheapest", label: "💰 Termurah" },
  { key: "expensive", label: "💎 Termahal" },
  { key: "rating", label: "⭐ Rating tertinggi" },
  { key: "popular", label: "🔥 Paling laris" },
] as const;
type SortKey = typeof SORTS[number]["key"];

// ---------- Toast ----------
function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  function show(m: string) {
    setMsg(m);
    window.setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 2400);
  }
  const node = (
    <AnimatePresence>
      {msg && (
        <motion.div
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] bg-ink-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-xl max-w-sm text-center"
        >{msg}</motion.div>
      )}
    </AnimatePresence>
  );
  return { show, node };
}

// ---------- Helpers ----------
function formatRp(n: number) { return `Rp ${n.toLocaleString("id-ID")}`; }

function StarRating({ value, reviews, small }: { value: number; reviews?: number; small?: boolean }) {
  return (
    <div className={`inline-flex items-center gap-1 ${small ? "text-[10px]" : "text-xs"}`}>
      <span className="text-warn-500">★</span>
      <span className="font-semibold text-ink-900">{value.toFixed(1)}</span>
      {reviews !== undefined && <span className="text-ink-500">({reviews})</span>}
    </div>
  );
}

// ---------- Product card ----------
function ProductCard({ p, onOpen }: { p: Product; onOpen: () => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      className="card !p-3 flex flex-col group cursor-pointer"
      onClick={onOpen}
    >
      <div className={`relative aspect-square rounded-xl bg-gradient-to-br ${p.gradient} grid place-items-center text-5xl overflow-hidden`}>
        <span className="drop-shadow-sm">
          {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="max-h-24 max-w-full object-contain" /> : p.emoji}
        </span>
        {p.rxRequired && (
          <span className="absolute top-2 left-2 bg-danger-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Rx</span>
        )}
        {p.stock < 30 && p.stock > 0 && (
          <span className="absolute top-2 right-2 bg-warn-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Stok terbatas</span>
        )}
      </div>
      <div className="mt-2.5 text-[10px] text-brand-700 font-semibold uppercase tracking-wide">{p.category}</div>
      <div className="font-semibold text-sm text-ink-900 mt-0.5 line-clamp-2 min-h-[40px] leading-tight">{p.name}</div>
      <div className="text-brand-600 font-bold text-base mt-1">{formatRp(p.price)}</div>
      <div className="mt-2 pt-2 border-t border-surface-100 space-y-0.5">
        <div className="text-[11px] text-ink-700 truncate">🏥 {p.pharmacy}</div>
        <div className="flex items-center justify-between text-[10px] text-ink-500">
          <span className="truncate">📍 {p.city} · {p.distanceKm} km</span>
          <StarRating value={p.rating} small />
        </div>
      </div>
      <button type="button" disabled className="btn-secondary h-9 mt-2.5 text-xs w-full opacity-70">Pembelian online dinonaktifkan</button>
    </motion.div>
  );
}

// ---------- Product detail modal ----------
function ProductModal({ p, onClose }: { p: Product; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-ink-900/60 backdrop-blur-sm grid place-items-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} aria-label="Tutup" className="absolute top-4 right-4 w-9 h-9 rounded-full bg-surface-100 hover:bg-surface-200 grid place-items-center z-10">✕</button>
        <div className="grid md:grid-cols-2 gap-0">
          <div className={`bg-gradient-to-br ${p.gradient} grid place-items-center text-9xl p-10 md:rounded-l-3xl md:rounded-tr-none rounded-t-3xl`}>
            {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="max-h-72 max-w-full object-contain" /> : p.emoji}
          </div>
          <div className="p-6 md:p-8 flex flex-col">
            <div className="text-xs text-brand-700 font-semibold uppercase tracking-wide">{p.category}</div>
            <h3 className="text-2xl font-bold mt-1">{p.name}</h3>
            <div className="flex items-center gap-3 mt-2">
              <StarRating value={p.rating} reviews={p.reviews} />
              {p.rxRequired && <span className="bg-danger-50 text-danger-500 text-[10px] font-bold px-2 py-0.5 rounded">⚕ Resep Dokter</span>}
            </div>
            <div className="text-3xl font-bold text-brand-600 mt-4">{formatRp(p.price)}</div>
            <div className="text-xs text-ink-500">per {p.unit} · stok {p.stock}</div>
            <p className="text-sm text-ink-700 mt-4 leading-relaxed">{p.desc}</p>

            <div className="mt-4 rounded-xl bg-surface-50 p-3 border border-surface-100">
              <div className="text-xs text-ink-500">Dijual oleh</div>
              <div className="font-semibold text-ink-900">{p.pharmacy}</div>
              <div className="text-xs text-ink-500 mt-0.5">📍 {p.city} · {p.distanceKm} km dari Anda</div>
            </div>

            <div className="mt-5 rounded-lg bg-surface-50 p-3 text-sm text-ink-600">Pembelian online sedang dinonaktifkan.</div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------- Main page ----------
export function Marketplace() {
  const [realItems, setRealItems] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Semua");
  const [maxDistance, setMaxDistance] = useState(10);
  const [maxPrice, setMaxPrice] = useState(500000);
  const [rxOnly, setRxOnly] = useState<"all" | "no-rx" | "rx">("all");
  const [sort, setSort] = useState<SortKey>("nearest");
  const [openProduct, setOpenProduct] = useState<Product | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    getDocs(query(
      collectionGroup(db, "products"),
      where("marketplaceEnabled", "==", true),
      where("active", "==", true),
      limit(60)
    )).then((s) => setRealItems(s.docs.map((d) => {
      const tenantId = d.ref.parent.parent?.id ?? "unknown";
      const data = d.data() as any;
      return {
        id: d.id, tenantId,
        name: data.name, category: data.category ?? "Lainnya", price: data.price ?? 0, stock: data.stock ?? 0,
        pharmacy: data.tenantName ?? "Apotek Mitra", city: data.city ?? "Jakarta",
        distanceKm: data.distanceKm ?? 1.5, rating: data.rating ?? 4.7, reviews: data.reviews ?? 0,
        emoji: data.emoji ?? "💊", gradient: "from-brand-100 to-accent-100",
        desc: data.desc ?? "", unit: data.unit ?? "pcs", rxRequired: !!data.rxRequired,
      } as Product;
    }))).catch(() => setRealItems([]));
  }, []);

  const allItems = realItems;

  const filtered = useMemo(() => {
    let out = allItems.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        const textHit = p.name.toLowerCase().includes(q) || p.pharmacy.toLowerCase().includes(q);
        if (!textHit) return false;
      }
      if (category !== "Semua" && p.category !== category) return false;
      if (p.distanceKm > maxDistance) return false;
      if (p.price > maxPrice) return false;
      if (rxOnly === "rx" && !p.rxRequired) return false;
      if (rxOnly === "no-rx" && p.rxRequired) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      switch (sort) {
        case "nearest": return a.distanceKm - b.distanceKm;
        case "cheapest": return a.price - b.price;
        case "expensive": return b.price - a.price;
        case "rating": return b.rating - a.rating;
        case "popular": return b.reviews - a.reviews;
      }
    });
    return out;
  }, [allItems, search, category, maxDistance, maxPrice, rxOnly, sort]);

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-surface-100">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 font-bold text-brand-600 text-lg shrink-0">
            <span className="w-8 h-8 rounded-xl bg-brand-500 text-white grid place-items-center">P</span>
            <span className="hidden sm:inline">Batam Farma</span>
          </Link>
          <div className="flex-1 max-w-xl mx-auto relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500">🔍</span>
            <input
              className="input !pl-9 h-10"
              placeholder="Cari nama produk atau apotek…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Link to="/login" className="btn-secondary h-10 hidden sm:inline-flex">Masuk</Link>
        </div>
      </header>

      {/* Hero strip */}
      <div className="bg-gradient-to-br from-brand-500 to-brand-600 text-white">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-10">
          <div className="text-xs opacity-80 font-medium">🛍️ Marketplace Apotek</div>
          <h1 className="text-2xl md:text-4xl font-bold mt-1">Obat & Kebutuhan Kesehatan, dari Apotek Terdekat</h1>
          <div className="mt-3 flex flex-wrap gap-4 text-sm opacity-90">
            <span>Katalog produk dari apotek mitra</span>
            <span>Pembelian online sedang dinonaktifkan</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 grid lg:grid-cols-[260px_1fr] gap-6">
        {/* Filter sidebar */}
        <aside className={`${filtersOpen ? "fixed inset-0 z-50 bg-white p-5 overflow-y-auto" : "hidden"} lg:block lg:static lg:z-auto lg:bg-transparent lg:p-0`}>
          {filtersOpen && (
            <div className="flex justify-between items-center mb-4 lg:hidden">
              <div className="font-bold text-lg">Filter</div>
              <button onClick={() => setFiltersOpen(false)} className="w-9 h-9 rounded-full hover:bg-surface-100 grid place-items-center">✕</button>
            </div>
          )}
          <div className="card !p-5 space-y-5 lg:sticky lg:top-20">
            <div>
              <div className="font-semibold text-sm mb-2">Kategori</div>
              <div className="space-y-1">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`block w-full text-left text-sm px-2.5 py-1.5 rounded-md transition-colors ${category === c ? "bg-brand-50 text-brand-700 font-semibold" : "text-ink-700 hover:bg-surface-50"}`}
                  >{c}</button>
                ))}
              </div>
            </div>

            <div>
              <div className="font-semibold text-sm mb-2 flex justify-between">
                <span>Jarak maksimal</span><span className="text-ink-500 font-normal">{maxDistance} km</span>
              </div>
              <input type="range" min={0.5} max={10} step={0.5} value={maxDistance}
                onChange={(e) => setMaxDistance(Number(e.target.value))}
                className="w-full accent-brand-500" />
            </div>

            <div>
              <div className="font-semibold text-sm mb-2 flex justify-between">
                <span>Harga maksimal</span><span className="text-ink-500 font-normal">{formatRp(maxPrice)}</span>
              </div>
              <input type="range" min={10000} max={500000} step={5000} value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="w-full accent-brand-500" />
            </div>

            <div>
              <div className="font-semibold text-sm mb-2">Jenis obat</div>
              <div className="space-y-1.5">
                {[
                  { v: "all", l: "Semua" },
                  { v: "no-rx", l: "Tanpa resep" },
                  { v: "rx", l: "Perlu resep" },
                ].map((o) => (
                  <label key={o.v} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name="rx" checked={rxOnly === o.v} onChange={() => setRxOnly(o.v as any)} className="accent-brand-500" />
                    {o.l}
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={() => { setCategory("Semua"); setMaxDistance(10); setMaxPrice(500000); setRxOnly("all"); setSearch(""); }}
              className="btn-secondary w-full h-9 text-xs"
            >Reset Filter</button>
          </div>
        </aside>

        {/* Product list */}
        <div>
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="text-sm text-ink-500">
              Menampilkan <span className="font-semibold text-ink-900">{filtered.length}</span> produk
              {category !== "Semua" && <> · kategori <span className="font-semibold text-ink-900">{category}</span></>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setFiltersOpen(true)} className="btn-secondary h-9 text-xs lg:hidden">⚙ Filter</button>
              <select
                value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
                className="input h-9 text-sm w-auto"
              >
                {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="card text-center py-16">
              <div className="text-5xl mb-3">🔍</div>
              <div className="font-semibold">Tidak ada produk yang cocok</div>
              <div className="text-sm text-ink-500 mt-1">Coba ubah filter atau kata kunci pencarian.</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
              <AnimatePresence mode="popLayout">
                {filtered.map((p) => (
                  <ProductCard
                    key={`${p.tenantId}-${p.id}`}
                    p={p}
                    onOpen={() => setOpenProduct(p)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {openProduct && (
          <ProductModal
            p={openProduct}
            onClose={() => setOpenProduct(null)}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
