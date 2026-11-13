import { FormEvent, useEffect, useState } from "react";
import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { useAuth } from "../../lib/auth";
import { db } from "../../lib/firebase";
import { printReceipt } from "../../lib/receiptActions";

type PrinterProfile = {
  id: string;
  name: string;
  paperWidth: "58mm" | "80mm";
  active: boolean;
  createdBy: string;
};

export function PrinterSettings() {
  const tenantId = useAuth((state) => state.claims?.tenantId || "");
  const user = useAuth((state) => state.user);
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  const [name, setName] = useState("");
  const [paperWidth, setPaperWidth] = useState<PrinterProfile["paperWidth"]>("58mm");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, `tenants/${tenantId}/devices`));
      setProfiles(snapshot.docs.map((device) => ({ id: device.id, ...device.data() } as PrinterProfile)));
      setError(null);
    } catch {
      setError("Profil printer gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [tenantId]);

  async function addPrinter(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !user) return;
    setSaving(true);
    setError(null);
    try {
      await addDoc(collection(db, `tenants/${tenantId}/devices`), {
        name: name.trim(),
        paperWidth,
        connection: "BROWSER_PRINT",
        active: true,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setName("");
      await load();
    } catch {
      setError("Printer gagal ditambahkan. Periksa akses anggota apotek.");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(profile: PrinterProfile, active: boolean) {
    setSaving(true);
    setError(null);
    try {
      await updateDoc(doc(db, `tenants/${tenantId}/devices/${profile.id}`), {
        active,
        updatedAt: serverTimestamp(),
      });
      await load();
    } catch {
      setError("Status printer gagal diperbarui.");
    } finally {
      setSaving(false);
    }
  }

  function testPrint(profile: PrinterProfile) {
    setError(null);
    const receipt = document.createElement("div");
    receipt.className = "receipt";
    for (const text of [
      "TES CETAK NOTA", `Printer: ${profile.name}`, `Kertas: ${profile.paperWidth}`,
    ]) {
      const line = document.createElement("p");
      line.textContent = text;
      receipt.appendChild(line);
    }
    for (const [label, value] of [
      ["No", "TRX-123E4567-E89B-42D3-A456-426614174001"],
      ["Total", "Rp 123.456"],
    ]) {
      const row = document.createElement("div");
      row.className = "row";
      for (const text of [label, value]) {
        const cell = document.createElement("span");
        cell.textContent = text;
        row.appendChild(cell);
      }
      receipt.appendChild(row);
    }
    const instructions = document.createElement("p");
    instructions.textContent = "Periksa ukuran, tepi, dan keterbacaan hasil cetak.";
    receipt.appendChild(instructions);
    try { printReceipt(receipt, profile.paperWidth, "TES-PRINTER"); }
    catch (printError) {
      setError(printError instanceof Error ? printError.message : "Tes cetak gagal dibuka.");
    }
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <header>
        <h1 className="text-2xl font-bold">Printer & Perangkat</h1>
        <p className="text-sm text-ink-500 mt-1">Profil printer dibagikan untuk apotek ini. Printer fisik dipilih melalui dialog cetak perangkat.</p>
        <p className="text-sm text-ink-500 mt-1">EC-POS58: hubungkan USB, pasang driver yang sesuai di PC kasir, lalu pilih kertas 58 mm di driver dan dialog cetak. Profil ini tidak memasang driver atau memilih printer otomatis.</p>
        <p className="text-sm text-ink-500 mt-1">Owner juga perlu memilih 58 mm di Profil & Nota agar ukuran awal nota POS sesuai. Tes cetak tidak memastikan printer sudah terhubung sampai hasil fisiknya diperiksa.</p>
      </header>

      {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}

      <button type="button" className="btn-secondary text-sm" onClick={() => { setName("EC-POS58 (USB)"); setPaperWidth("58mm"); }}>
        Isi profil EC-POS58 (USB, 58 mm)
      </button>
      <form onSubmit={addPrinter} className="card p-4 grid gap-3 md:grid-cols-[1fr_180px_auto] items-end">
        <label className="text-sm font-medium">Nama perangkat
          <input className="input mt-1 w-full" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Contoh: Kasir Utama" />
        </label>
        <label className="text-sm font-medium">Lebar kertas
          <select className="input mt-1 w-full" value={paperWidth} onChange={(event) => setPaperWidth(event.target.value as PrinterProfile["paperWidth"])}>
            <option value="58mm">Thermal 58 mm</option>
            <option value="80mm">Thermal 80 mm</option>
          </select>
        </label>
        <button className="btn-primary" disabled={saving}>{saving ? "Menyimpan…" : "Tambah printer"}</button>
      </form>

      <section className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-100 font-semibold">Printer apotek</div>
        {loading ? <p className="p-5 text-sm text-ink-500">Memuat profil…</p> : profiles.length === 0 ? (
          <p className="p-5 text-sm text-ink-500">Belum ada profil printer.</p>
        ) : (
          <div className="divide-y divide-surface-100">
            {profiles.map((profile) => (
              <div key={profile.id} className="p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-40">
                  <div className="font-medium">{profile.name}</div>
                  <div className="text-xs text-ink-500">Printer browser · {profile.paperWidth} · {profile.active ? "Aktif" : "Nonaktif"}</div>
                </div>
                <button className="btn-secondary text-sm" disabled={saving || !profile.active} onClick={() => testPrint(profile)}>Tes cetak</button>
                <button className={profile.active ? "text-danger-600 text-sm" : "text-accent-700 text-sm"} disabled={saving} onClick={() => void setActive(profile, !profile.active)}>
                  {profile.active ? "Nonaktifkan" : "Aktifkan"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}