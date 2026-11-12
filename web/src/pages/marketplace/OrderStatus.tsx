import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";

export function OrderStatus() {
  const { orderId } = useParams();
  const [params] = useSearchParams();
  const tenantId = params.get("tenant");
  const [order, setOrder] = useState<any>(null);

  useEffect(() => {
    if (!orderId || !tenantId) return;
    return onSnapshot(doc(db, `tenants/${tenantId}/marketplaceOrders/${orderId}`), (s) => {
      setOrder(s.data());
    });
  }, [orderId, tenantId]);

  if (!order) return <div className="p-10">Memuat…</div>;

  return (
    <div className="max-w-md mx-auto p-6">
      <div className="card text-center">
        <div className="text-sm text-ink-500">Pesanan</div>
        <div className="font-bold text-lg">#{order.orderNo}</div>
        <div className="my-4">
          <span className="badge bg-brand-50 text-brand-700">{order.status}</span>
        </div>
        <div className="text-2xl font-bold">Rp {order.amounts?.total?.toLocaleString("id-ID")}</div>

        <p className="mt-5 text-sm text-ink-500">Pembayaran online dan QR pickup sedang dinonaktifkan.</p>
      </div>
    </div>
  );
}
