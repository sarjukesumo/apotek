// Hardware preferences — printer, scanner, cash drawer, customer display, scale, RFID.

import { useState, useEffect } from "react";
import { useAuth } from "../../lib/auth";
import { useDemoStore, type DemoHardwareSettings } from "../../lib/demoStore";

export function Hardware() {
  const tenantId = useAuth((s) => s.claims?.tenantId) ?? "";
  const settings = useDemoStore((s) => s.hardwareSettings.find((h) => h.tenantId === tenantId));
  const upsert = useDemoStore((s) => s.upsertHardwareSettings);

  const [f, setF] = useState<DemoHardwareSettings>(settings ?? {
    tenantId, printerType: "THERMAL_80",
    scannerEnabled: true, cashDrawerEnabled: true,
    customerDisplayEnabled: false, scaleEnabled: false, rfidEnabled: false,
  });

  useEffect(() => { if (settings) setF(settings); }, [settings?.tenantId]);

  const save = () => { upsert(f); alert("✅ Setting hardware tersimpan."); };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">⚙ Hardware &amp; Periferal</h1>
        <p className="text-ink-500 text-sm mt-0.5">Atur printer, scanner barcode, cash drawer, customer display, dan periferal POS lainnya.</p>
      </div>

      <div className="card space-y-4">
        <div>
          <h3 className="font-semibold mb-2">🖨 Printer Struk</h3>
          <div className="grid grid-cols-3 gap-2">
            {(["THERMAL_58", "THERMAL_80", "A4"] as const).map((p) => (
              <button key={p} onClick={() => setF({ ...f, printerType: p })} className={`border rounded-xl p-3 text-sm ${f.printerType === p ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200" : "border-surface-200"}`}>
                <div className="text-2xl mb-1">{p === "A4" ? "📄" : "🧾"}</div>
                <div className="font-semibold">{p === "THERMAL_58" ? "Thermal 58mm" : p === "THERMAL_80" ? "Thermal 80mm" : "A4 Laser/Inkjet"}</div>
                <div className="text-[10px] text-ink-500 mt-1">{p === "THERMAL_58" ? "Mini, kasir mobile" : p === "THERMAL_80" ? "Standar POS" : "Apotek besar / faktur"}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t pt-4">
          <h3 className="font-semibold mb-3">🔌 Periferal Lainnya</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <Toggle emoji="📷" name="Scanner Barcode" desc="QR/EAN13 untuk scan obat" value={f.scannerEnabled} onChange={(v) => setF({ ...f, scannerEnabled: v })} />
            <Toggle emoji="💰" name="Cash Drawer" desc="Auto-buka saat transaksi tunai" value={f.cashDrawerEnabled} onChange={(v) => setF({ ...f, cashDrawerEnabled: v })} />
            <Toggle emoji="📺" name="Customer Display" desc="Display kedua untuk pelanggan" value={f.customerDisplayEnabled} onChange={(v) => setF({ ...f, customerDisplayEnabled: v })} />
            <Toggle emoji="⚖" name="Timbangan" desc="Untuk produk per gram (puyer, herbal)" value={f.scaleEnabled} onChange={(v) => setF({ ...f, scaleEnabled: v })} />
            <Toggle emoji="📡" name="RFID Tag" desc="Tracking obat NPP/cold-chain" value={f.rfidEnabled} onChange={(v) => setF({ ...f, rfidEnabled: v })} />
          </div>
        </div>

        <div className="border-t pt-4 flex justify-end"><button onClick={save} className="btn-primary text-sm">💾 Simpan Pengaturan</button></div>
      </div>

      <div className="card bg-brand-50/50 border-brand-200">
        <h3 className="font-semibold text-brand-700 mb-2">💡 Catatan</h3>
        <ul className="text-sm text-ink-600 space-y-1 list-disc pl-5">
          <li>Pengaturan hardware diterapkan otomatis di POS.</li>
          <li>Untuk printer thermal di production, gunakan ESC/POS via WebUSB / Bridge App.</li>
          <li>RFID/timbangan butuh integrasi tambahan (luar scope demo).</li>
        </ul>
      </div>
    </div>
  );
}

function Toggle({ emoji, name, desc, value, onChange }: { emoji: string; name: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${value ? "border-emerald-300 bg-emerald-50/30" : "border-surface-200"}`}>
      <div className="text-2xl">{emoji}</div>
      <div className="flex-1">
        <div className="font-semibold text-sm">{name}</div>
        <div className="text-xs text-ink-500">{desc}</div>
      </div>
      <input type="checkbox" className="mt-1 scale-125" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
