import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";

export function ProductDetail() {
  const { tenantSlug, productId } = useParams();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [product, setProduct] = useState<any>(null);

  useEffect(() => {
    if (!tenantSlug) return;
    getDoc(doc(db, "publicTenants", tenantSlug))
      .then((snapshot) => {
        const data = snapshot.data();
        setTenantId(snapshot.exists() && data?.marketplaceEnabled === true ? String(data.tenantId) : null);
      });
  }, [tenantSlug]);

  useEffect(() => {
    if (!tenantId || !productId) return;
    getDoc(doc(db, `tenants/${tenantId}/products/${productId}`))
      .then((s) => setProduct(s.exists() ? { id: s.id, ...(s.data() as any) } : null));
  }, [tenantId, productId]);

  if (!product || !tenantId) return <div className="p-10">Memuat…</div>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="card">
        <div className="text-3xl font-bold">{product.name}</div>
        <div className="text-ink-500">{product.category}</div>
        <div className="mt-3 text-2xl font-bold text-brand-600">Rp {product.price.toLocaleString("id-ID")}</div>
        <div className="text-sm text-ink-500 mt-1">Stok: {product.stock}</div>
        <button className="btn-secondary w-full mt-6" disabled>Pembelian online dinonaktifkan</button>
      </div>
    </div>
  );
}
