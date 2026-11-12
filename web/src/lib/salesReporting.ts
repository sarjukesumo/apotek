import { collection, onSnapshot, orderBy, query, where, type DocumentData, type FirestoreError } from "firebase/firestore";
import { db } from "./firebase";

export function businessDate(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function subscribeMonthlySales(
  tenantId: string,
  onSales: (sales: Array<DocumentData & { id: string }>) => void,
  onError: (error: FirestoreError) => void,
) {
  let unsubscribe: (() => void) | undefined;
  let month = "";
  const refresh = () => {
    const currentMonth = businessDate().slice(0, 7);
    if (month === currentMonth) return;
    month = currentMonth;
    unsubscribe?.();
    const next = new Date(`${month}-01T00:00:00.000Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    unsubscribe = onSnapshot(query(
      collection(db, `tenants/${tenantId}/posSales`),
      where("dateISO", ">=", month),
      where("dateISO", "<", next.toISOString().slice(0, 7)),
      orderBy("dateISO", "desc"),
    ), (snapshot) => onSales(snapshot.docs.map((sale) => ({ ...sale.data(), id: sale.id }))), onError);
  };
  refresh();
  const timer = setInterval(refresh, 60_000);
  return () => { clearInterval(timer); unsubscribe?.(); };
}
