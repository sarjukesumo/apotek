import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { customerReceiptContact } from "../lib/receiptActions";

type PosCustomer = { id: string; name: string; phone: string };

export function PosCustomerPicker({ tenantId, onSelect }: {
  tenantId: string;
  onSelect: (customer: { name: string; phone: string }) => void;
}) {
  const [customers, setCustomers] = useState<PosCustomer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    setCustomers([]);
    setLoading(true);
    setError("");
    if (!tenantId) return;
    return onSnapshot(collection(db, "tenants", tenantId, "customers"), { includeMetadataChanges: true }, (snapshot) => {
      setCustomers(snapshot.docs.filter((entry) => entry.data().active !== false)
        .map((entry) => ({ id: entry.id, ...customerReceiptContact(entry.data()) }))
        .sort((a, b) => a.name.localeCompare(b.name, "id")));
      setFromCache(snapshot.metadata.fromCache);
      setLoading(false);
      setError("");
    }, (cause) => {
      console.error("Daftar pelanggan POS gagal dimuat", cause);
      setError("Daftar pelanggan gagal dimuat. Coba buka kembali Info Pelanggan; nama dan nomor tetap bisa diisi manual.");
      setLoading(false);
    });
  }, [tenantId]);

  const matches = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("id");
    return customers.filter((customer) => !needle || `${customer.name} ${customer.phone}`.toLocaleLowerCase("id").includes(needle));
  }, [customers, search]);

  return <div className="mt-2 space-y-1">
    <label htmlFor="pos-customer-search" className="text-xs">Pilih pelanggan terdaftar (opsional)</label>
    <input id="pos-customer-search" className="input h-8 text-sm" placeholder="Cari nama / nomor pelanggan" value={search} onChange={(event) => setSearch(event.target.value)} />
    {loading && <p className="text-xs">Memuat pelanggan...</p>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    {!loading && !error && <>
      {fromCache && <p className="text-xs text-ink-500">Data pelanggan dari cache PC; belum dikonfirmasi server.</p>}
      <select aria-label="Pilih pelanggan terdaftar" className="input h-8 text-sm" value="" onChange={(event) => {
        const customer = customers.find((entry) => entry.id === event.target.value);
        if (customer) { onSelect(customer); setSearch(""); }
      }}>
        <option value="">Pilih pelanggan / isi manual di bawah</option>
        {matches.slice(0, 20).map((customer) => <option key={customer.id} value={customer.id}>{customer.name} — {customer.phone || "Tanpa nomor WA"}</option>)}
      </select>
      {matches.length > 20 && <p className="text-xs text-ink-500">Menampilkan 20 dari {matches.length} pelanggan. Ketik nama atau nomor untuk mempersempit pilihan.</p>}
      {matches.length === 0 && <p className="text-xs text-ink-500">Tidak ada pelanggan yang cocok. Isi nama/nomor manual bila diperlukan.</p>}
    </>}
  </div>;
}
