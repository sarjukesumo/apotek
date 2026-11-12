import { useState } from "react";
import { authedFetch } from "../../lib/auth";

export function AIAssistant() {
  const [q, setQ] = useState("");
  const [a, setA] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask() {
    setBusy(true); setA(null);
    try {
      const r = await authedFetch("/api/ai/ask", { method: "POST", body: JSON.stringify({ question: q }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setA(d.answer);
    } catch (e: any) { setA("Error: " + e.message); } finally { setBusy(false); }
  }

  const samples = [
    "Produk apa saja yang stoknya hampir habis?",
    "Berapa total payout 7 hari terakhir?",
    "Adakah batch yang akan kadaluarsa?",
    "Berapa pesanan hari ini?",
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold">AI Assistant</h1>
      <p className="text-ink-500 mt-1">Tanyakan apa saja tentang apotek Anda. Asisten membaca data tenant Anda.</p>

      <div className="card mt-4">
        <textarea className="input h-28" placeholder="Mis. produk apa saja yang hampir habis?"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-2 mt-3">
          {samples.map((s) => (
            <button key={s} className="badge bg-surface-100 hover:bg-surface-100/70" onClick={() => setQ(s)}>{s}</button>
          ))}
        </div>
        <button className="btn-primary w-full mt-4" disabled={!q || busy} onClick={ask}>
          {busy ? "Menganalisis…" : "Tanya"}
        </button>
      </div>

      {a && (
        <div className="card mt-4 whitespace-pre-wrap">{a}</div>
      )}
    </div>
  );
}
