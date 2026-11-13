export function customerReceiptContact(data: Record<string, unknown>) {
  return {
    name: typeof data.name === "string" ? data.name : "",
    phone: typeof data.whatsapp === "string" && data.whatsapp.trim()
      ? data.whatsapp.trim() : typeof data.phone === "string" ? data.phone.trim() : "",
  };
}

export function normalizeWaPhone(raw: string): string | null {
  const cleaned = raw.trim();
  if (!/^\+?[\d\s().-]+$/.test(cleaned)) return null;
  const digits = cleaned.replace(/\D/g, "");
  if (!/[1-9]/.test(digits)) return null;
  const phone = digits.startsWith("0") ? `62${digits.slice(1)}`
    : digits.startsWith("8") ? `62${digits}` : digits;
  return /^[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

export function whatsappWebReceiptUrl(rawPhone: string, text: string) {
  const phone = rawPhone.trim() ? normalizeWaPhone(rawPhone) : null;
  if (rawPhone.trim() && !phone) throw new Error("Nomor WhatsApp tidak valid. Perbaiki nomor atau kosongkan untuk memilih penerima di WhatsApp.");
  const url = new URL("https://web.whatsapp.com/send");
  if (phone) url.searchParams.set("phone", phone);
  if (text) url.searchParams.set("text", text);
  return url.href;
}

export function openWhatsappReceipt(rawPhone: string, text: string) {
  const url = whatsappWebReceiptUrl(rawPhone, text);
  const popup = window.open("about:blank", "_blank");
  if (!popup) throw new Error("Pop-up diblokir. Izinkan pop-up untuk membuka WhatsApp Web.");
  popup.opener = null;
  popup.location.href = url;
  return popup;
}

export function printReceipt(node: HTMLElement, paper: "58mm" | "80mm", transactionId: string, pdf = false) {
  const popup = window.open("", "_blank", "width=800,height=850");
  if (!popup) throw new Error("Pop-up diblokir. Izinkan pop-up untuk mencetak atau menyimpan PDF.");
  popup.opener = null;
  const document = popup.document;
  document.title = `${pdf ? "Nota-PDF" : "Struk"}-${transactionId}`;
  const style = document.createElement("style");
  style.textContent = `
    @page { size: ${pdf ? "A4 portrait" : "auto"}; margin: ${pdf ? "12mm" : "0"}; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; color: #000; background: #fff; font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.35; }
    .receipt { width: ${pdf ? 72 : paper === "58mm" ? 48 : 72}mm; margin: 0 auto; padding: 3mm 2mm; overflow-wrap: anywhere; }
    .receipt, .receipt * { color: #000 !important; }
    .receipt img { display: block; max-width: 24mm; max-height: 10mm; object-fit: contain; margin: 0 auto 1mm; }
    .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 4px; }
    .row > :first-child { flex-shrink: 0; }
    .row > :last-child { min-width: 0; overflow-wrap: anywhere; text-align: right; }
    .item { break-inside: avoid; }
    .noprint { margin: 12px auto; max-width: 440px; padding: 12px; font: 14px sans-serif; text-align: center; }
    @media print { .noprint { display: none !important; } }
  `;
  document.head.appendChild(style);
  const instructions = document.createElement("div");
  instructions.className = "noprint";
  instructions.textContent = pdf
    ? 'Pilih tujuan "Save as PDF / Simpan sebagai PDF" pada dialog cetak, kertas A4, lalu Simpan. File tidak tersimpan otomatis.'
    : `Pilih printer di dialog cetak, kertas ${paper}, skala 100%, dan margin tidak ada. Pastikan ukuran kertas juga diatur pada driver printer.`;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = pdf ? "Print / Simpan PDF" : "Cetak ulang";
  button.addEventListener("click", () => { popup.focus(); popup.print(); });
  instructions.appendChild(document.createElement("br"));
  instructions.appendChild(button);
  const copy = document.importNode(node, true);
  // The receipt DOM contains escaped React text; do not rebuild it as HTML strings.
  copy.removeAttribute("style");
  document.body.replaceChildren(instructions, copy);
  const images = Array.from(copy.querySelectorAll("img"));
  let printed = false;
  const launch = () => {
    if (printed || popup.closed) return;
    printed = true;
    popup.focus();
    popup.print();
  };
  if (images.every((image) => image.complete)) launch();
  else {
    images.forEach((image) => {
      const ready = () => { if (images.every((entry) => entry.complete)) launch(); };
      image.addEventListener("load", ready, { once: true });
      image.addEventListener("error", ready, { once: true });
    });
    popup.setTimeout(launch, 3000);
  }
}
