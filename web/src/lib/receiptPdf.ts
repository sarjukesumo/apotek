import { PDFDocument } from "pdf-lib";

export async function createReceiptPdf(text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1754;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Browser tidak mendukung pembuatan PDF. Gunakan Print / Simpan PDF.");
  const margin = 80;
  const lineHeight = 32;
  const lines: string[] = [];
  context.font = "24px monospace";
  for (const raw of text.split("\n")) {
    let line = "";
    for (const character of Array.from(raw.replace(/\*/g, ""))) {
      if (line && context.measureText(line + character).width > canvas.width - margin * 2) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
    lines.push(line);
  }
  const perPage = Math.floor((canvas.height - margin * 2 - lineHeight) / lineHeight);
  for (let offset = 0; offset < lines.length; offset += perPage) {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#000";
    context.textBaseline = "top";
    lines.slice(offset, offset + perPage).forEach((line, index) => {
      context.fillText(line, margin, margin + index * lineHeight);
    });
    context.fillText(`Halaman ${Math.floor(offset / perPage) + 1}`, margin, canvas.height - margin);
    const image = await pdf.embedPng(canvas.toDataURL("image/png"));
    const page = pdf.addPage([595.28, 841.89]);
    page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  }
  return pdf.save();
}

export function downloadReceiptPdf(bytes: Uint8Array, transactionId: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `Nota-${transactionId.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
  document.body.appendChild(anchor);
  try { anchor.click(); }
  finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
