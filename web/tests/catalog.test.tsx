import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CatalogPagination, useCatalogPage } from "../src/components/CatalogPagination";
import { searchPosProducts } from "../src/lib/posSearch";
import { availableQty, expiredQty, productWorstZone, valueInZones } from "../src/lib/fefo";
import type { DemoProduct } from "../src/lib/demoStore";

function Catalog({ products, search = "" }: { products: string[]; search?: string }) {
  const filtered = products.filter((name) => name.includes(search));
  const page = useCatalogPage(filtered, search);
  return createElement("section", null,
    createElement(CatalogPagination, page),
    ...page.items.map((name) => createElement("button", { key: name, "data-product": name }, name)));
}

it("renders only 48 of 3000 products while searching the entire catalog", () => {
  const products = Array.from({ length: 3000 }, (_, index) => `Medicine ${String(index).padStart(4, "0")}`);
  const started = performance.now();
  const html = renderToStaticMarkup(createElement(Catalog, { products }));
  expect((html.match(/data-product=/g) ?? []).length).toBe(48);
  expect(html).toContain("halaman 1/63");
  const search = renderToStaticMarkup(createElement(Catalog, { products, search: "2999" }));
  expect((search.match(/data-product=/g) ?? []).length).toBe(1);
  expect(search).toContain("Medicine 2999");
  expect(performance.now() - started).toBeLessThan(250);
});

it("searches all 3000 POS products and calculates inventory risk within the CPU budget", () => {
  const products: DemoProduct[] = Array.from({ length: 3000 }, (_, index) => ({
    id: `product-${index}`, tenantId: "qa", name: `Medicine ${index}`, category: "Obat Bebas",
    desc: "", price: 2000, unit: "tablet", minStock: 1, emoji: "", gradient: "",
    marketplaceEnabled: false, rxRequired: false,
    batches: [{ id: `batch-${index}`, batchNo: String(index), qty: 100, expiryISO: "2099-12-31" }],
  }));
  products[2999].name = "Paracetamol QA2999";
  const started = performance.now();
  for (const query of ["QA2999", "parasetamol", "demam", "med", "tidakadaprodukxyz"]) {
    const matches = searchPosProducts(products, query);
    if (query === "tidakadaprodukxyz") expect(matches.length).toBe(0);
    else if (query !== "med") expect(matches.some((product) => product.id === "product-2999")).toBe(true);
    else expect(matches.length).toBe(2999);
  }
  const searchMs = performance.now() - started;
  const stockStart = performance.now();
  const totals = products.map((product) => ({
    stock: availableQty(product.batches), expired: expiredQty(product.batches),
    zone: productWorstZone(product), risk: valueInZones(product, ["WARNING", "CRITICAL"]),
  }));
  expect(totals.reduce((sum, product) => sum + product.stock, 0)).toBe(300000);
  const stockMs = performance.now() - stockStart;
  expect(searchMs).toBeLessThan(250);
  expect(stockMs).toBeLessThan(500);
  console.info("QA_CATALOG", JSON.stringify({ products: 3000, fiveSearchesMs: Math.round(searchMs), stockSummaryMs: Math.round(stockMs) }));
});
