// AI Assistant — RAG ringan: ambil snapshot data tenant lalu kirim ke LLM.
// Provider: OpenAI-compatible (override base URL via env). Fallback heuristik
// agar fitur tidak crash jika OPENAI_API_KEY belum di-set.
import fetch from "node-fetch";
import { db } from "../firebase";

interface Input { tenantId: string; question: string; }

interface Snapshot {
  tenant: any;
  topProducts: any[];
  lowStock: any[];
  expiringSoon: any[];
  recentOrders: any[];
  payouts7d: number;
  ordersToday: number;
}

async function buildSnapshot(tenantId: string): Promise<Snapshot> {
  const [tenant, products, batches, orders, payouts] = await Promise.all([
    db.doc(`tenants/${tenantId}`).get(),
    db.collection(`tenants/${tenantId}/products`).limit(200).get(),
    db.collection(`tenants/${tenantId}/inventoryBatches`).limit(200).get(),
    db.collection(`tenants/${tenantId}/marketplaceOrders`).orderBy("createdAt", "desc").limit(20).get(),
    db.collection(`tenants/${tenantId}/payouts`).limit(50).get(),
  ]);

  const now = Date.now();
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);

  const allProducts = products.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const lowStock = allProducts
    .filter((p) => typeof p.minStock === "number" && p.stock <= p.minStock)
    .slice(0, 10);
  const topProducts = allProducts
    .sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0))
    .slice(0, 10)
    .map((p) => ({ name: p.name, stock: p.stock, price: p.price }));

  const expiringSoon = batches.docs
    .map((d) => d.data() as any)
    .filter((b) => {
      const ms = b.expiryAt?.toMillis?.() ?? new Date(b.expiryAt).getTime();
      return ms - now < 90 * 86400_000;
    })
    .slice(0, 10);

  const recentOrders = orders.docs.map((d) => {
    const o = d.data() as any;
    return { orderNo: o.orderNo, status: o.status, total: o.amounts?.total };
  });

  const ordersToday = orders.docs.filter((d) => {
    const ts = (d.data() as any).createdAt?.toMillis?.() ?? 0;
    return ts >= startToday.getTime();
  }).length;

  const payouts7d = payouts.docs.reduce((acc, d) => {
    const p = d.data() as any;
    const ts = p.updatedAt?.toMillis?.() ?? 0;
    if (p.status === "SUCCESS" && now - ts < 7 * 86400_000) acc += (p.amountToTenant || 0);
    return acc;
  }, 0);

  return {
    tenant: { name: tenant.data()?.profile?.name, plan: tenant.data()?.subscription?.plan },
    topProducts, lowStock, expiringSoon, recentOrders, payouts7d, ordersToday,
  };
}

function heuristicAnswer(s: Snapshot, q: string): string {
  const lower = q.toLowerCase();
  if (lower.includes("stok") || lower.includes("habis")) {
    return s.lowStock.length
      ? `Produk hampir habis: ${s.lowStock.map((p) => `${p.name} (${p.stock}/${p.minStock})`).join(", ")}.`
      : "Tidak ada produk yang stoknya di bawah minimum.";
  }
  if (lower.includes("kadaluarsa") || lower.includes("expir")) {
    return s.expiringSoon.length
      ? `Batch akan kadaluarsa <90 hari: ${s.expiringSoon.length} batch. Cek di menu Inventory.`
      : "Tidak ada batch yang akan kadaluarsa dalam 90 hari.";
  }
  if (lower.includes("payout") || lower.includes("pencairan")) {
    return `Payout sukses 7 hari terakhir: Rp ${s.payouts7d.toLocaleString("id-ID")}.`;
  }
  if (lower.includes("pesanan") || lower.includes("order")) {
    return `Pesanan hari ini (sample): ${s.ordersToday}. Order terbaru: ${s.recentOrders.slice(0, 5).map((o) => o.orderNo).join(", ")}.`;
  }
  return "Coba tanyakan: stok hampir habis, batch kadaluarsa, payout 7 hari, atau pesanan hari ini.";
}

export async function aiAsk(input: Input): Promise<string> {
  const snapshot = await buildSnapshot(input.tenantId);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return heuristicAnswer(snapshot, input.question);

  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const sys = "Anda adalah asisten apotek. Jawab dalam bahasa Indonesia, ringkas (max 5 kalimat), dan gunakan HANYA data konteks. Jangan mengarang.";
  const ctx = JSON.stringify(snapshot);

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, temperature: 0.2,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `Konteks tenant (JSON):\n${ctx}\n\nPertanyaan: ${input.question}` },
      ],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI error ${res.status}: ${txt}`);
  }
  const data: any = await res.json();
  return data.choices?.[0]?.message?.content ?? heuristicAnswer(snapshot, input.question);
}
