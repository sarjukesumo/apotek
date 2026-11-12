import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { AppUpdateNotice } from "../src/components/AppUpdateNotice";

const state = vi.hoisted(() => ({ waiting: false, update: vi.fn() }));
vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({ needRefresh: [state.waiting, vi.fn()], updateServiceWorker: state.update }),
}));

beforeEach(() => {
  state.waiting = false;
  state.update.mockClear();
});

it("does not interrupt a transaction when no update is waiting", () => {
  expect(renderToStaticMarkup(createElement(AppUpdateNotice))).toBe("");
  expect(state.update).not.toHaveBeenCalled();
});

it("requires explicit action and warns about unsaved transactions in every tab", () => {
  state.waiting = true;
  const html = renderToStaticMarkup(createElement(AppUpdateNotice));
  expect(html).toContain("Perbarui aplikasi");
  expect(html).toContain("Selesaikan transaksi");
  expect(html).toContain("semua tab");
  expect(html).toContain("data lokal tidak dihapus");
  expect(state.update).not.toHaveBeenCalled();
});

it("revalidates route HTML while keeping hashed assets immutable", () => {
  const config = JSON.parse(readFileSync(new URL("../../firebase.json", import.meta.url), "utf8"));
  const headers = config.hosting.headers as { source: string; headers: { key: string; value: string }[] }[];
  expect(headers[0].source).toBe("**");
  expect(headers[0].headers[0].value).toContain("must-revalidate");
  expect(headers.find((entry) => entry.source.includes("woff2"))?.headers[0].value).toContain("immutable");
});
