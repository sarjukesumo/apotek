import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/auth";

const PLANS: { code: "BASIC" | "PRO" | "YEARLY"; name: string; price: number }[] = [
  { code: "BASIC", name: "Basic", price: 99000 },
  { code: "PRO", name: "Pro", price: 249000 },
  { code: "YEARLY", name: "Yearly", price: 2490000 },
];

export function Subscription() {
  const tenantId = useAuth((s) => s.claims?.tenantId);
  const [tenant, setTenant] = useState<any>(null);

  useEffect(() => {
    if (!tenantId) return;
    getDoc(doc(db, "tenants", tenantId)).then((s) => setTenant(s.data()));
  }, [tenantId]);

  return (
    <div>
      <h1 className="text-2xl font-bold">Langganan</h1>
      <div className="card mt-4">
        <div className="text-sm text-ink-500">Status saat ini</div>
        <div className="text-xl font-bold mt-1">
          {tenant?.subscription?.plan} · {tenant?.subscription?.status}
        </div>
        <div className="text-sm text-ink-500 mt-1">
          Berakhir: {tenant?.subscription?.endAt?.toDate?.()?.toLocaleDateString?.("id-ID") ?? "—"}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mt-4">
        {PLANS.map((p) => (
          <div key={p.code} className="card">
            <div className="text-lg font-bold">{p.name}</div>
            <div className="text-3xl font-bold mt-2">Rp {p.price.toLocaleString("id-ID")}</div>
            <div className="mt-4 text-sm text-ink-500">Pembayaran online sementara tidak tersedia.</div>
          </div>
        ))}
      </div>
    </div>
  );
}
