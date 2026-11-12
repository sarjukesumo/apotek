import { FormEvent, useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { useAuth } from "../../lib/auth";
import { db } from "../../lib/firebase";

type ContactKind = "suppliers" | "customers";
type Contact = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  active: boolean;
  code?: string;
  picName?: string;
  whatsapp?: string;
  returnable?: boolean;
  returnMinDaysBeforeED?: number;
  returnNotes?: string;
};

export function BusinessContacts({ kind }: { kind: ContactKind }) {
  const tenantId = useAuth((state) => state.claims?.tenantId || "");
  const role = useAuth((state) => state.claims?.role);
  const canManage = role === "OWNER" || role === "STAFF";
  const suppliers = kind === "suppliers";
  const collectionPath = `tenants/${tenantId}/${kind}`;
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [picName, setPicName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [returnable, setReturnable] = useState(false);
  const [returnDays, setReturnDays] = useState(90);
  const [returnNotes, setReturnNotes] = useState("");

  async function load() {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, collectionPath));
      setContacts(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as Contact))
        .sort((a, b) => a.name.localeCompare(b.name, "id")));
      setError(null);
    } catch {
      setError(`Data ${suppliers ? "pemasok" : "pelanggan"} gagal dimuat dari Firebase.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [tenantId, kind]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return contacts.filter((contact) => !needle ||
      contact.name.toLowerCase().includes(needle) ||
      (contact.picName || "").toLowerCase().includes(needle) ||
      contact.phone.includes(needle) ||
      (contact.email || "").toLowerCase().includes(needle));
  }, [contacts, search]);

  function resetForm() {
    setEditing(null);
    setName("");
    setCode("");
    setPicName("");
    setPhone("");
    setWhatsapp("");
    setEmail("");
    setAddress("");
    setReturnable(false);
    setReturnDays(90);
    setReturnNotes("");
    setShowForm(false);
  }

  function editContact(contact: Contact) {
    setEditing(contact);
    setName(contact.name);
    setCode(contact.code || "");
    setPicName(contact.picName || "");
    setPhone(contact.phone);
    setWhatsapp(contact.whatsapp || "");
    setEmail(contact.email || "");
    setAddress(contact.address || "");
    setReturnable(contact.returnable === true);
    setReturnDays(contact.returnMinDaysBeforeED || 90);
    setReturnNotes(contact.returnNotes || "");
    setShowForm(true);
    setError(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    const data = {
      name: name.trim(),
      ...(suppliers ? { code: code.trim().toUpperCase() } : {}),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      active: editing?.active ?? true,
      ...(suppliers ? {
        picName: picName.trim(),
        whatsapp: whatsapp.trim(),
        returnable,
        returnMinDaysBeforeED: returnDays,
        returnNotes: returnNotes.trim(),
      } : {}),
      updatedAt: serverTimestamp(),
    };
    try {
      if (editing) await updateDoc(doc(db, collectionPath, editing.id), data);
      else await addDoc(collection(db, collectionPath), { ...data, createdAt: serverTimestamp() });
      setNotice(`${suppliers ? "Pemasok" : "Pelanggan"} berhasil disimpan.`);
      resetForm();
      await load();
    } catch {
      setError("Gagal menyimpan data. Pastikan kamu login sebagai Owner atau Staf apotek ini.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(contact: Contact) {
    if (!canManage) return;
    setSaving(true);
    setError(null);
    try {
      await updateDoc(doc(db, collectionPath, contact.id), { active: !contact.active, updatedAt: serverTimestamp() });
      setNotice(`${contact.name} ${contact.active ? "dinonaktifkan" : "diaktifkan"}. Riwayat tidak dihapus.`);
      await load();
    } catch {
      setError("Status data gagal diubah.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{suppliers ? "Pemasok" : "Pelanggan"}</h1>
          <p className="text-sm text-ink-500 mt-1">Data {suppliers ? "pemasok dan kebijakan retur" : "kontak pelanggan"} disimpan untuk apotek ini di Firebase.</p>
        </div>
        {canManage && <button className="btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>+ Tambah {suppliers ? "pemasok" : "pelanggan"}</button>}
      </header>

      {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
      {notice && <p role="status" className="text-sm text-accent-700">{notice}</p>}

      {showForm && (
        <form onSubmit={save} className="card p-4 grid md:grid-cols-2 gap-3">
          <h2 className="md:col-span-2 font-semibold">{editing ? "Edit data" : `Tambah ${suppliers ? "pemasok" : "pelanggan"}`}</h2>
          <Field label={suppliers ? "Nama pemasok" : "Nama pelanggan"}><input className="input w-full" required value={name} onChange={(event) => setName(event.target.value)} /></Field>
          {suppliers && <Field label="Kode pemasok"><input className="input w-full font-mono" required value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="SUP-001" /></Field>}
          {suppliers && <Field label="Nama PIC"><input className="input w-full" value={picName} onChange={(event) => setPicName(event.target.value)} /></Field>}
          <Field label={suppliers ? "Telepon" : "Telepon / WhatsApp"}><input className="input w-full" type="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>
          {suppliers && <Field label="WhatsApp"><input className="input w-full" type="tel" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} /></Field>}
          <Field label="Email (opsional)"><input className="input w-full" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
          <Field label="Alamat (opsional)"><input className="input w-full" value={address} onChange={(event) => setAddress(event.target.value)} /></Field>
          {suppliers && <>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={returnable} onChange={(event) => setReturnable(event.target.checked)} /> Pemasok menerima retur</label>
            {returnable && <Field label="Batas minimal hari sebelum ED"><input className="input w-full" type="number" min="0" value={returnDays} onChange={(event) => setReturnDays(Math.max(0, Number(event.target.value) || 0))} /></Field>}
            {returnable && <Field label="Catatan kebijakan retur"><input className="input w-full" value={returnNotes} onChange={(event) => setReturnNotes(event.target.value)} /></Field>}
          </>}
          <div className="md:col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={resetForm}>Batal</button>
            <button className="btn-primary" disabled={saving}>{saving ? "Menyimpan…" : "Simpan"}</button>
          </div>
        </form>
      )}

      <section className="card overflow-hidden">
        <div className="p-3 border-b border-surface-100"><input className="input max-w-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Cari ${suppliers ? "pemasok" : "pelanggan"}`} /></div>
        {loading ? <p className="p-5 text-sm text-ink-500">Memuat data Firebase…</p> : filtered.length === 0 ? (
          <p className="p-8 text-sm text-center text-ink-500">Belum ada data {suppliers ? "pemasok" : "pelanggan"} yang cocok.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface-50 text-left text-xs uppercase text-ink-500"><tr>{suppliers && <th className="px-4 py-3">Kode</th>}<th className="px-4 py-3">Nama</th>{suppliers && <th className="px-4 py-3">PIC</th>}<th className="px-4 py-3">Telepon</th><th className="px-4 py-3">Email</th>{suppliers && <th className="px-4 py-3">Retur</th>}<th className="px-4 py-3">Status</th>{canManage && <th className="px-4 py-3 text-right">Aksi</th>}</tr></thead>
            <tbody>{filtered.map((contact) => <tr key={contact.id} className="border-t border-surface-100">
              {suppliers && <td className="px-4 py-3 font-mono text-xs">{contact.code || "—"}</td>}
              <td className="px-4 py-3"><div className="font-medium">{contact.name}</div><div className="text-xs text-ink-500">{contact.address || "—"}</div></td>
              {suppliers && <td className="px-4 py-3">{contact.picName || "—"}</td>}
              <td className="px-4 py-3">{contact.phone}</td>
              <td className="px-4 py-3">{contact.email || "—"}</td>
              {suppliers && <td className="px-4 py-3">{contact.returnable ? `Bisa · min ${contact.returnMinDaysBeforeED || 0} hari` : "Tidak"}</td>}
              <td className="px-4 py-3"><span className={contact.active ? "text-accent-700" : "text-ink-400"}>{contact.active ? "Aktif" : "Nonaktif"}</span></td>
              {canManage && <td className="px-4 py-3 text-right whitespace-nowrap"><button className="text-brand-600 hover:underline mr-3" onClick={() => editContact(contact)}>Edit</button><button className={contact.active ? "text-danger-600 hover:underline" : "text-accent-700 hover:underline"} disabled={saving} onClick={() => void toggleActive(contact)}>{contact.active ? "Nonaktifkan" : "Aktifkan"}</button></td>}
            </tr>)}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium">{label}<span className="block mt-1">{children}</span></label>;
}