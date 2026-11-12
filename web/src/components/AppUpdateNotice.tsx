/// <reference types="vite-plugin-pwa/react" />
import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

export function AppUpdateNotice() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, registered) { setRegistration(registered); },
    onRegisterError(cause) {
      console.error("Pendaftaran pembaruan aplikasi gagal", cause);
      setError("Pemeriksaan pembaruan gagal. Periksa koneksi lalu muat ulang setelah transaksi selesai.");
    },
  });

  useEffect(() => {
    if (!registration) return;
    const check = () => {
      if (!navigator.onLine || document.visibilityState === "hidden") return;
      void registration.update().then(() => setError("")).catch((cause: unknown) => {
        console.error("Pemeriksaan pembaruan aplikasi gagal", cause);
        setError("Pemeriksaan pembaruan gagal. Periksa koneksi lalu coba lagi.");
      });
    };
    check();
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    const timer = window.setInterval(check, 5 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      window.clearInterval(timer);
    };
  }, [registration]);

  async function applyUpdate() {
    setUpdating(true);
    setError("");
    try { await updateServiceWorker(true); }
    catch (cause) {
      console.error("Pembaruan aplikasi gagal diterapkan", cause);
      setError("Pembaruan gagal diterapkan. Pastikan internet tersambung lalu coba lagi.");
    } finally { setUpdating(false); }
  }

  if (!needRefresh && !error) return null;
  return (
    <aside role="status" className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-[100] rounded-xl border border-brand-200 bg-white p-4 shadow-xl">
      {needRefresh && <>
        <p className="font-semibold">Versi aplikasi baru tersedia</p>
        <p className="mt-1 text-sm">Selesaikan transaksi dan simpan pekerjaan di semua tab aplikasi sebelum memperbarui. Halaman akan dimuat ulang; data lokal tidak dihapus.</p>
        <button type="button" className="btn-primary mt-3" disabled={updating} onClick={() => void applyUpdate()}>
          {updating ? "Memperbarui..." : "Perbarui aplikasi"}
        </button>
      </>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </aside>
  );
}
