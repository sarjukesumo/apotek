import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { authedFetch } from "../../lib/auth";
import { motion, AnimatePresence } from "framer-motion";

export function Verify() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    let stopped = false;

    (async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const back = devices.find((d) => /back|rear|environment/i.test(d.label)) || devices[0];
        await reader.decodeFromVideoDevice(back?.deviceId, videoRef.current!, async (res) => {
          if (stopped || !res || busy) return;
          setBusy(true);
          try {
            const r = await authedFetch("/api/qr/verify", {
              method: "POST",
              body: JSON.stringify({ signedToken: res.getText() }),
            });
            const data = await r.json();
            if (!r.ok || !data.valid) { setError(data.error || "Tidak valid"); setResult(null); }
            else { setResult(data); setError(null); }
          } catch (verificationError) {
            setError(verificationError instanceof Error ? verificationError.message : "Verifikasi tidak tersedia.");
            setResult(null);
          } finally { setTimeout(() => setBusy(false), 1500); }
        });
      } catch (e: any) {
        setError("Tidak dapat akses kamera: " + e.message);
      }
    })();

    return () => { stopped = true; (reader as any).reset?.(); };
  }, []);

  async function complete(orderId: string) {
    try {
      const r = await authedFetch("/api/orders/complete", { method: "POST", body: JSON.stringify({ orderId }) });
      if (r.ok) { alert("Pesanan diselesaikan"); setResult(null); }
      else alert(await r.text());
    } catch (completeError) {
      alert(completeError instanceof Error ? completeError.message : "Fitur pickup tidak tersedia.");
    }
  }

  return (
    <div className="relative -mx-4 md:mx-0 md:max-w-md md:mx-auto h-[calc(100vh-180px)] md:h-[600px] rounded-2xl overflow-hidden bg-black">
      <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-64 h-64 border-4 border-brand-500/80 rounded-2xl"></div>
      </div>
      <AnimatePresence>
        {error && (
          <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute bottom-4 inset-x-4 bg-danger-500 text-white p-4 rounded-xl">{error}</motion.div>
        )}
        {result && (
          <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute bottom-4 inset-x-4 bg-white p-4 rounded-2xl shadow-card">
            <div className="font-bold">#{result.orderSummary.orderNo}</div>
            <div className="text-sm text-ink-500">{result.orderSummary.customer} · {result.orderSummary.status}</div>
            <div className="font-semibold mt-1">Rp {result.orderSummary.total?.toLocaleString("id-ID")}</div>
            {result.canComplete && (
              <button className="btn-primary w-full mt-3" onClick={() => complete(result.orderSummary.orderId)}>
                Konfirmasi Pickup
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
