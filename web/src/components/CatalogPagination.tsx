import { useState } from "react";

export const CATALOG_PAGE_SIZE = 48;

export function useCatalogPage<T>(items: T[], filterKey: string) {
  const [selection, setSelection] = useState({ key: filterKey, page: 1 });
  const pages = Math.max(1, Math.ceil(items.length / CATALOG_PAGE_SIZE));
  const page = Math.min(selection.key === filterKey ? selection.page : 1, pages);
  return {
    items: items.slice((page - 1) * CATALOG_PAGE_SIZE, page * CATALOG_PAGE_SIZE),
    page, pages, total: items.length,
    setPage: (value: number) => setSelection({ key: filterKey, page: Math.max(1, Math.min(value, pages)) }),
  };
}

export function CatalogPagination({ page, pages, total, setPage }: {
  page: number; pages: number; total: number; setPage: (page: number) => void;
}) {
  return (
    <nav aria-label="Halaman produk" className="flex items-center justify-between gap-2 py-3 text-xs">
      <span>{total.toLocaleString("id-ID")} produk · halaman {page}/{pages}</span>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Sebelumnya</button>
        <button type="button" className="btn-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Berikutnya</button>
      </div>
    </nav>
  );
}
