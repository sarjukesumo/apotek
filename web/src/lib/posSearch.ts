import type { DemoProduct } from "./demoStore";

export const SYNONYMS: Record<string, string[]> = {
  "demam": ["paracetamol", "obat bebas"],
  "panas": ["paracetamol", "obat bebas"],
  "pusing": ["paracetamol", "obat bebas"],
  "sakit kepala": ["paracetamol", "obat bebas"],
  "sakit gigi": ["paracetamol", "obat bebas"],
  "flu": ["obh", "paracetamol", "vitamin c"],
  "batuk": ["obh", "salbutamol", "pernapasan"],
  "asma": ["salbutamol", "inhaler", "pernapasan"],
  "infeksi": ["amoxicillin", "antibiotik"],
  "antibiotik": ["amoxicillin", "antibiotik"],
  "imun": ["vitamin c", "vitamin", "multivitamin"],
  "daya tahan": ["vitamin c", "vitamin", "multivitamin"],
  "anak": ["multivitamin anak", "susu formula", "ibu & anak"],
  "bayi": ["susu formula", "ibu & anak"],
  "luka": ["plester", "p3k", "antiseptik"],
  "alkohol": ["hand sanitizer", "antiseptik"],
  "kuman": ["hand sanitizer", "antiseptik", "masker"],
  "covid": ["masker", "hand sanitizer", "vitamin c"],
  "diabetes": ["insulin", "diabetes"],
  "gula darah": ["insulin", "diabetes"],
  "tensi": ["tensimeter", "alat kesehatan"],
  "darah tinggi": ["tensimeter", "alat kesehatan"],
  "herbal": ["madu", "herbal"],
  "madu": ["madu", "herbal"],
  "masker": ["masker", "alat kesehatan"],
  "parasetamol": ["paracetamol"],
  "vit c": ["vitamin c"],
  "vitc": ["vitamin c"],
  "amox": ["amoxicillin"],
  "vitamin": ["vitamin"],
};

function aiScore(p: DemoProduct, q: string): number {
  if (!q) return 1;
  const ql = q.toLowerCase().trim();
  const text = `${p.name} ${p.code || ""} ${p.category} ${p.desc}`.toLowerCase();
  if (!ql) return 1;
  if (p.name.toLowerCase().startsWith(ql)) return 100;
  if (text.includes(ql)) return 60;
  const qWords = ql.split(/\s+/).filter(Boolean);
  let wordScore = 0;
  for (const w of qWords) {
    if (text.includes(w)) wordScore += 20;
    else if (w.length >= 4 && text.includes(w.slice(0, 4))) wordScore += 8;
  }
  let synScore = 0;
  for (const [key, hints] of Object.entries(SYNONYMS)) {
    if (ql.includes(key)) {
      for (const h of hints) if (text.includes(h)) synScore += 15;
    }
  }
  return wordScore + synScore;
}

export function searchPosProducts(products: DemoProduct[], search: string, category = "Semua") {
  const list = category === "Semua" ? products : products.filter((p) => p.category === category);
  const q = search.trim().toLowerCase();
  if (!q) return list;
  return list.map((p) => ({ p, score: aiScore(p, q) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.p);
}
