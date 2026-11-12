import { afterEach, expect, it, vi } from "vitest";
import { MAX_PRODUCT_IMAGE_URL, prepareProductImage, validateProductImage } from "../src/lib/productImage";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("rejects non-photo formats, empty files and oversized originals", () => {
  for (const type of ["image/svg+xml", "text/html", "application/pdf", ""]) {
    expect(() => validateProductImage({ type, size: 100 })).toThrow("JPG");
  }
  for (const size of [0, 5 * 1024 * 1024 + 1]) {
    expect(() => validateProductImage({ type: "image/png", size })).toThrow("5 MB");
  }
});

it("resizes a valid photo, bounds the saved data and revokes temporary object URLs", async () => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:photo");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const drawImage = vi.fn();
  const canvas = { width: 0, height: 0, getContext: () => ({ fillRect: vi.fn(), drawImage }), toDataURL: () => "data:image/jpeg;base64,YQ==" };
  vi.stubGlobal("document", { createElement: () => canvas });
  vi.stubGlobal("Image", class { naturalWidth = 1000; naturalHeight = 500; decode = async () => {}; });
  const data = await prepareProductImage(new File(["photo"], "photo.png", { type: "image/png" }));
  expect(data.length).toBeLessThanOrEqual(MAX_PRODUCT_IMAGE_URL);
  expect(canvas.width).toBe(256);
  expect(canvas.height).toBe(128);
  expect(drawImage).toHaveBeenCalledOnce();
  expect(revoke).toHaveBeenCalledWith("blob:photo");
});

it("reports corrupt photos without retaining temporary data", async () => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:invalid");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.stubGlobal("Image", class { decode = async () => { throw new Error("invalid"); }; });
  await expect(prepareProductImage(new File(["bad"], "bad.jpg", { type: "image/jpeg" }))).rejects.toThrow("tidak dapat dibaca");
  expect(revoke).toHaveBeenCalledWith("blob:invalid");
});
