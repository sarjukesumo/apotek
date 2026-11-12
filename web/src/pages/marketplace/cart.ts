// Cart store: locks to a single tenant per order.
import { create } from "zustand";

export interface CartItem { productId: string; name: string; price: number; qty: number; }

interface CartState {
  tenantId: string | null;
  items: CartItem[];
  add: (tenantId: string, item: CartItem) => void;
  remove: (productId: string) => void;
  clear: () => void;
  subtotal: () => number;
}

export const useCart = create<CartState>((set, get) => ({
  tenantId: null,
  items: [],
  add: (tenantId, item) => {
    const cur = get();
    if (cur.tenantId && cur.tenantId !== tenantId) {
      const ok = confirm("Keranjang berisi item dari apotek lain. Kosongkan dan ganti?");
      if (!ok) return;
      set({ tenantId, items: [item] });
      return;
    }
    const existing = cur.items.find((i) => i.productId === item.productId);
    set({
      tenantId,
      items: existing
        ? cur.items.map((i) => i.productId === item.productId ? { ...i, qty: i.qty + item.qty } : i)
        : [...cur.items, item],
    });
  },
  remove: (productId) => set({ items: get().items.filter((i) => i.productId !== productId) }),
  clear: () => set({ tenantId: null, items: [] }),
  subtotal: () => get().items.reduce((s, i) => s + i.price * i.qty, 0),
}));
