import { afterEach, expect, it, vi } from "vitest";
import { findProductImages } from "../src/lib/imageSearch";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductThumbnail } from "../src/components/ProductThumbnail";

afterEach(() => { vi.unstubAllGlobals(); });

it("preserves brand/dosage in explicit searches and accepts only public-domain HTTPS candidates", async () => {
  const candidate = {
    url: "https://images.example.test/photo.jpg", thumbnail: "https://images.example.test/thumb.jpg",
    foreign_landing_url: "https://example.test/source", license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
    license: "cc0", title: "Product photo", creator: "Photographer",
  };
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    results: [candidate, candidate, { ...candidate, url: "javascript:alert(1)" }, { ...candidate, license: "by" }],
  }) });
  vi.stubGlobal("fetch", fetcher);
  const result = await findProductImages("[SAMPLE] ACARBOSE 100 MG");
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(url.searchParams.get("q")).toBe("ACARBOSE 100 MG");
  expect(url.searchParams.get("license")).toBe("cc0,pdm");
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ title: "Product photo", license: "CC0", creator: "Photographer" });
});

it("surfaces search service failures instead of reporting no matches", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
  await expect(findProductImages("medicine")).rejects.toThrow("HTTP 429");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
  await expect(findProductImages("medicine")).rejects.toThrow("network unavailable");
});

it("returns an explicit empty candidate list and rejects malformed results", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) }));
  expect(await findProductImages("medicine")).toEqual([]);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ unexpected: [] }) }));
  await expect(findProductImages("medicine")).rejects.toThrow("Format");
});

it("always renders a visible thumbnail region even when a product has no photo", () => {
  const blank = renderToStaticMarkup(createElement(ProductThumbnail, { name: "QA Medicine", className: "w-20 h-20" }));
  expect(blank).toContain("Belum ada foto");
  expect(blank).toContain("QA Medicine: belum ada foto");
  expect(blank).toContain("<svg");
  const photo = renderToStaticMarkup(createElement(ProductThumbnail, { name: "QA Medicine", imageUrl: "https://example.test/photo.jpg" }));
  expect(photo).toContain('alt="Foto QA Medicine"');
  expect(photo).toContain('loading="lazy"');
});
