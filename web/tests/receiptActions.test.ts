import { afterEach, expect, it, vi } from "vitest";
import { customerReceiptContact, normalizeWaPhone, openWhatsappReceipt, printReceipt, whatsappWebReceiptUrl } from "../src/lib/receiptActions";

afterEach(() => vi.unstubAllGlobals());

it("normalizes Indonesian and international numbers without accepting invalid recipients", () => {
  for (const phone of ["0812 3456 7890", "+62 812-3456-7890", "6281234567890", "81234567890"]) {
    expect(normalizeWaPhone(phone)).toBe("6281234567890");
  }
  expect(normalizeWaPhone("+1 (202) 555-0123")).toBe("12025550123");
  for (const phone of ["", "abc", "0812abc34567890", "123", "0000000000", "1234567890123456", "+62+81234567890"]) {
    expect(normalizeWaPhone(phone)).toBeNull();
  }
});

it("opens only WhatsApp Web with exact encoded receipt text, without a gateway", () => {
  const text = "LATIHAN — BUKAN TRANSAKSI NYATA\nNota D’Farma\nRp 58.400 & kembali 41.600 #1";
  const url = new URL(whatsappWebReceiptUrl("081234567890", text));
  expect(url.origin).toBe("https://web.whatsapp.com");
  expect(url.pathname).toBe("/send");
  expect(url.searchParams.get("phone")).toBe("6281234567890");
  expect(url.searchParams.get("text")).toBe(text);
  const popup = { opener: {}, location: { href: "" } };
  const open = vi.fn().mockReturnValue(popup);
  vi.stubGlobal("window", { open });
  openWhatsappReceipt("081234567890", text);
  expect(open).toHaveBeenCalledWith("about:blank", "_blank");
  expect(popup.opener).toBeNull();
  expect(popup.location.href).toBe(url.href);
});

it("reports invalid recipients and blocked WhatsApp/PDF popups explicitly", () => {
  const open = vi.fn().mockReturnValue(null);
  vi.stubGlobal("window", { open });
  expect(() => openWhatsappReceipt("invalid", "receipt")).toThrow("tidak valid");
  expect(open).not.toHaveBeenCalled();
  expect(() => openWhatsappReceipt("081234567890", "receipt")).toThrow("Pop-up diblokir");
  expect(() => printReceipt({} as HTMLElement, "58mm", "QA", true)).toThrow("Pop-up diblokir");
});

it("opens WhatsApp Web with receipt text and no forced recipient when the number is empty", () => {
  const popup = { opener: {}, location: { href: "" } };
  vi.stubGlobal("window", { open: vi.fn().mockReturnValue(popup) });
  const text = "LATIHAN\nNota D’Farma & Rp 20.400";
  openWhatsappReceipt("  ", text);
  const url = new URL(popup.location.href);
  expect(url.origin).toBe("https://web.whatsapp.com");
  expect(url.searchParams.has("phone")).toBe(false);
  expect(url.searchParams.get("text")).toBe(text);
  expect(popup.opener).toBeNull();
});

it("prefills a registered customer's WhatsApp or legacy phone without retaining another customer's number", () => {
  expect(customerReceiptContact({ name: "Patient A", whatsapp: " 081234567890 ", phone: "082222222222" }))
    .toEqual({ name: "Patient A", phone: "081234567890" });
  expect(customerReceiptContact({ name: "Patient B", phone: " 082222222222 " }))
    .toEqual({ name: "Patient B", phone: "082222222222" });
  expect(customerReceiptContact({ name: "Patient C", whatsapp: "", phone: null }))
    .toEqual({ name: "Patient C", phone: "" });
  expect(customerReceiptContact({ name: "Patient D", whatsapp: "invalid", phone: "082222222222" }).phone).toBe("invalid");
});

it("opens the customer's chat without receipt text for the manual PDF attachment flow", () => {
  const url = new URL(whatsappWebReceiptUrl("081234567890", ""));
  expect(url.searchParams.get("phone")).toBe("6281234567890");
  expect(url.searchParams.has("text")).toBe(false);
});
