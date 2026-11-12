import { afterEach, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createReceiptPdf } from "../src/lib/receiptPdf";

afterEach(() => vi.unstubAllGlobals());

it("creates a valid multipage PDF without losing Unicode status, long lines, or final totals", async () => {
  const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  const fillText = vi.fn();
  const context = { measureText: (text: string) => ({ width: text.length * 15 }), fillRect: vi.fn(), fillText };
  vi.stubGlobal("document", {
    createElement: () => ({ getContext: () => context, toDataURL: () => image, width: 0, height: 0 }),
  });
  const text = "LATIHAN — BUKAN TRANSAKSI NYATA\nOFFLINE — BELUM TERSINKRON\nD’Farma\n"
    + ("Nama obat panjang ".repeat(20) + "\n").repeat(25) + "TOTAL Rp 123.456\nKembali Rp 3.000";
  const bytes = await createReceiptPdf(text);
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(1);
  expect(fillText).toHaveBeenCalledWith("D’Farma", expect.any(Number), expect.any(Number));
  expect(fillText).toHaveBeenCalledWith("TOTAL Rp 123.456", expect.any(Number), expect.any(Number));
  expect(fillText).toHaveBeenCalledWith("OFFLINE — BELUM TERSINKRON", expect.any(Number), expect.any(Number));
  expect(fillText).toHaveBeenCalledWith("LATIHAN — BUKAN TRANSAKSI NYATA", expect.any(Number), expect.any(Number));
});

it("reports unsupported PDF rendering instead of downloading an empty document", async () => {
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
  await expect(createReceiptPdf("QA")).rejects.toThrow("Browser tidak mendukung");
});
