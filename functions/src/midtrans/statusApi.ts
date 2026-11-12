// Midtrans Core API: GET transaction status (source-of-truth).
import fetch from "node-fetch";
import { getSecret, loadSystemConfig } from "../config";

export interface CoreStatus {
  transaction_status: string;
  fraud_status?: string;
  status_code: string;
  gross_amount: string;
  order_id: string;
  transaction_id: string;
}

export async function getCoreStatus(orderId: string): Promise<CoreStatus> {
  const cfg = await loadSystemConfig();
  const base = cfg.midtrans.isProduction
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";
  const serverKey = await getSecret(cfg.midtrans.serverKeyRef);
  const auth = "Basic " + Buffer.from(serverKey + ":").toString("base64");
  const res = await fetch(`${base}/v2/${encodeURIComponent(orderId)}/status`, {
    headers: { "Authorization": auth, "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`Midtrans status ${res.status}`);
  return (await res.json()) as CoreStatus;
}

export type MappedStatus = "SUCCESS" | "PENDING" | "FAILED" | "REFUNDED";

export function mapStatus(s: { transaction_status: string; fraud_status?: string }): MappedStatus {
  const t = s.transaction_status;
  const f = s.fraud_status;
  if (t === "settlement") return "SUCCESS";
  if (t === "capture" && f === "accept") return "SUCCESS";
  if (t === "pending") return "PENDING";
  if (["deny", "cancel", "expire", "failure"].includes(t)) return "FAILED";
  if (["refund", "partial_refund", "chargeback", "partial_chargeback"].includes(t)) return "REFUNDED";
  return "PENDING";
}
