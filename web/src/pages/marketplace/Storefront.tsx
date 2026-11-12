import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useDemoStore, demoTotalQty } from "../../lib/demoStore";

const fmtRp = (n: number) => "Rp " + n.toLocaleString("id-ID");

export function Storefront() {
  const { tenantSlug } = useParams();
  const tenant = useDemoStore((s) => s.tenants.find((t) => t.slug === tenantSlug));
  const allProducts = useDemoStore((s) => s.products);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string>("Semua");

  const products = useMemo(() => {
    if (!tenant) return [];
    return allProducts.filter(
      (p) => p.tenantId === tenant.id && p.marketplaceEnabled && demoTotalQty(p.batches) > 0
    );
  }, [allProducts, tenant]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => set.add(p.category));
    return ["Semua", ...Array.from(set)];
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (activeCat !== "Semua" && p.category !== activeCat) return false;
      if (search.trim() && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [products, activeCat, search]);

  if (!tenant) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="card max-w-md text-center">
          <div className="text-5xl mb-3">🏥</div>
          <div className="font-bold text-lg">Apotek tidak ditemukan</div>
          <div className="text-sm text-ink-500 mt-1">
            Slug <code className="bg-surface-100 px-1.5 py-0.5 rounded text-xs">{tenantSlug}</code> tidak terdaftar.
          </div>
          <Link to="/" className="btn-primary mt-4 inline-block">← Beranda</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Hero / Header */}
      <div
        className="text-white"
        style={{ background: `linear-gradient(135deg, ${tenant.primaryColor}, ${tenant.primaryColor}dd)` }}
      >
        <div className="max-w-6xl mx-auto px-4 py-6 flex items-center gap-4 flex-wrap">
          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur grid place-items-center text-3xl shrink-0">
            {tenant.logoEmoji}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold leading-tight">{tenant.name}</h1>
            <div className="text-sm opacity-90 mt-0.5 truncate">📍 {tenant.address}</div>
            <div className="text-xs opacity-80 mt-1 flex flex-wrap gap-x-3">
              <span>📞 {tenant.phone}</span>
              <span>💬 WA {tenant.whatsapp}</span>
              <span>⭐ {tenant.rating}</span>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <a
              href={`https://wa.me/${tenant.whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl px-4 py-2.5 text-sm flex items-center gap-1.5 shadow-md transition"
            >
              💬 WA
            </a>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-6xl mx-auto px-4 mt-4 sticky top-0 z-20 bg-surface-50 py-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Cari obat / produk…"
          className="input"
        />
        <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCat(c)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition ${
                activeCat === c
                  ? "bg-brand-500 text-white border-brand-500"
                  : "bg-white text-ink-600 border-surface-200 hover:border-brand-300"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Product grid */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        {filtered.length === 0 ? (
          <div className="card text-center py-10">
            <div className="text-5xl mb-2">🔍</div>
            <div className="font-semibold">Produk tidak ditemukan</div>
            <div className="text-sm text-ink-500">Coba kategori atau kata kunci lain.</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {filtered.map((p) => {
              const stock = demoTotalQty(p.batches);
              return (
                <Link
                  key={p.id}
                  to={`/store/${tenantSlug}/p/${p.id}`}
                  className="bg-white rounded-2xl border border-surface-100 hover:border-brand-300 hover:shadow-md transition overflow-hidden flex flex-col"
                >
                  <div className={`bg-gradient-to-br ${p.gradient} aspect-square grid place-items-center p-4 relative`}>
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <div className="text-6xl">{p.emoji}</div>
                    )}
                    {p.rxRequired && (
                      <span className="absolute top-2 right-2 text-[10px] bg-danger-500 text-white px-1.5 py-0.5 rounded font-bold">
                        Rx
                      </span>
                    )}
                  </div>
                  <div className="p-3 flex-1 flex flex-col">
                    <div className="text-[10px] text-ink-500">{p.category}</div>
                    <div className="font-semibold text-sm line-clamp-2 min-h-[2.4em] mt-0.5">{p.name}</div>
                    <div className="mt-auto pt-2">
                      <div className="font-bold text-brand-600">{fmtRp(p.price)}</div>
                      <div className="text-[10px] text-ink-500">Stok: {stock} {p.unit}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 py-8 mt-8 border-t border-surface-200 text-center text-xs text-ink-500">
        <div>{tenant.name} · {tenant.address}</div>
        <div className="mt-1">SIA: {tenant.sia ?? "—"} · NPWP: {tenant.npwp ?? "—"}</div>
        <div className="mt-3">
          Powered by <Link to="/" className="text-brand-600 font-semibold">Batam Farma</Link>
        </div>
      </footer>
    </div>
  );
}
