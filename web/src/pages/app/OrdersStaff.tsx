import { useEffect, useState } from "react";
import { collection, doc, getDocs, query, orderBy, limit, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/auth";

export function OrdersStaff() {
  const tenantId = useAuth((s) => s.claims?.tenantId);
  const [rows, setRows] = useState<any[]>([]);

  async function load() {
    if (!tenantId) return;
    const s = await getDocs(query(
      collection(db, `tenants/${tenantId}/marketplaceOrders`),
      orderBy("createdAt", "desc"), limit(50)
    ));
    setRows(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
  }
  useEffect(() => { load(); }, [tenantId]);

  async function complete(id: string) {
    if (!tenantId) return;
    try {
      await updateDoc(doc(db, `tenants/${tenantId}/marketplaceOrders/${id}`), {
        status: "COMPLETED",
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await load();
    } catch {
      alert("Pesanan gagal diselesaikan. Periksa status pesanan dan akses akun.");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Pesanan Marketplace</h1>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-ink-500"><tr><th>OrderNo</th><th>Customer</th><th>Total</th><th>Status</th><th></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-t border-surface-100">
              <td className="py-2 font-mono text-xs">{r.orderNo}</td>
              <td>{r.customer?.name}</td>
              <td>Rp {r.amounts?.total?.toLocaleString("id-ID")}</td>
              <td><span className="badge bg-surface-100">{r.status}</span></td>
              <td>
                {["PAID","PREPARING","READY_FOR_PICKUP"].includes(r.status) && (
                  <button className="btn-secondary h-9" onClick={() => complete(r.id)}>Selesaikan</button>
                )}
              </td>
            </tr>))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
