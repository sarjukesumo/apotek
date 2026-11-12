const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_PRODUCT_IMAGE_INPUT = 5 * 1024 * 1024;
export const MAX_PRODUCT_IMAGE_URL = 24 * 1024;

export function validateProductImage(file: Pick<File, "type" | "size">) {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("Pilih foto JPG, PNG, atau WebP.");
  if (file.size === 0 || file.size > MAX_PRODUCT_IMAGE_INPUT) throw new Error("Ukuran foto harus antara 1 byte dan 5 MB.");
}

export async function prepareProductImage(file: File): Promise<string> {
  validateProductImage(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try { await image.decode(); } catch { throw new Error("Foto tidak dapat dibaca. Pilih file JPG, PNG, atau WebP yang valid."); }
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("Dimensi foto tidak valid.");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Browser tidak mendukung pemrosesan foto. Gunakan Chrome atau Edge terbaru.");
    for (const maxSide of [256, 192, 128]) {
      const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL("image/jpeg", 0.75);
      if (result.startsWith("data:image/jpeg;base64,") && result.length <= MAX_PRODUCT_IMAGE_URL) return result;
    }
    throw new Error("Foto masih terlalu besar setelah diperkecil. Pilih foto produk yang lebih sederhana.");
  } finally { URL.revokeObjectURL(url); }
}
