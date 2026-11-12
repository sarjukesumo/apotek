import { Link } from "react-router-dom";
import { useCart } from "./cart";

export function Checkout() {
  const cart = useCart();
  const subtotal = cart.subtotal();

  if (cart.items.length === 0) {
    return <div className="p-10 text-center">Keranjang kosong. <a href="/marketplace" className="text-brand-600">Belanja</a></div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold">Checkout</h1>
      <div className="card mt-4">
        <div className="text-sm text-ink-500">Apotek</div>
        <div className="font-semibold">{cart.tenantId}</div>
        <div className="divide-y divide-surface-100 mt-3">
          {cart.items.map((i) => (
            <div key={i.productId} className="flex justify-between py-2">
              <div>
                <div className="font-medium">{i.name}</div>
                <div className="text-xs text-ink-500">{i.qty} × Rp {i.price.toLocaleString("id-ID")}</div>
              </div>
              <div className="font-semibold">Rp {(i.qty * i.price).toLocaleString("id-ID")}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-4 pt-3 border-t border-surface-100">
          <span>Total</span><span className="font-bold">Rp {subtotal.toLocaleString("id-ID")}</span>
        </div>
        <div role="status" className="mt-4 rounded-md border border-warn-200 bg-warn-50 px-3 py-3 text-sm text-warn-800">
          Pembayaran online sementara dinonaktifkan. Keranjang tetap tersimpan.
        </div>
        <Link to="/marketplace" className="btn-secondary mt-3 w-full text-center">Kembali ke Marketplace</Link>
      </div>
    </div>
  );
}
