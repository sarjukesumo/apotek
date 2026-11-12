export interface ImageCandidate {
  url: string;
  thumb: string;
  source: "openverse";
  title?: string;
  license: string;
  creator?: string;
  sourceUrl: string;
  licenseUrl: string;
}

function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch { return; }
}

export async function findProductImages(name: string): Promise<ImageCandidate[]> {
  const search = name.replace(/^\[SAMPLE\]\s*/i, "").trim();
  if (!search) throw new Error("Isi nama produk untuk mencari foto.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    // Restrict to public-domain candidates; other licenses can require attribution
    // that is not supported on the compact POS cards.
    const url = "https://api.openverse.org/v1/images/?" + new URLSearchParams({
      q: search, page_size: "8", license: "cc0,pdm", mature: "false",
    });
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Layanan pencarian foto tidak tersedia (HTTP ${response.status}). Gunakan upload dari PC atau coba lagi.`);
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("results" in body) || !Array.isArray(body.results)) {
      throw new Error("Format hasil pencarian foto tidak valid.");
    }
    const seen = new Set<string>();
    const candidates: ImageCandidate[] = [];
    for (const result of body.results as unknown[]) {
      if (!result || typeof result !== "object") continue;
      const row = result as Record<string, unknown>;
      const image = httpsUrl(row.url);
      const thumb = httpsUrl(row.thumbnail);
      const sourceUrl = httpsUrl(row.foreign_landing_url);
      const licenseUrl = httpsUrl(row.license_url);
      if (!image || !thumb || !sourceUrl || !licenseUrl || !["cc0", "pdm"].includes(String(row.license)) || seen.has(image)) continue;
      seen.add(image);
      candidates.push({
        url: image, thumb, source: "openverse", sourceUrl, licenseUrl, license: String(row.license).toUpperCase(),
        title: typeof row.title === "string" ? row.title : undefined,
        creator: typeof row.creator === "string" ? row.creator : undefined,
      });
    }
    return candidates;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Pencarian foto melewati 12 detik. Periksa internet atau gunakan upload dari PC.");
    throw error;
  } finally { clearTimeout(timeout); }
}
