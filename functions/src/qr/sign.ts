// QR signed token: base64url(payload).hmacSha256(payload, secret)
import { getSecret, loadSystemConfig } from "../config";
import { base64url, base64urlDecode, hmacSha256, timingSafeEq } from "../util/crypto";

export interface QrPayload {
  v: number;
  tenantId: string;
  orderId: string;
  amount: number;
  ts: number;
}

export async function signQR(payload: QrPayload): Promise<string> {
  const cfg = await loadSystemConfig();
  const secret = await getSecret(cfg.qr.secretRef);
  const body = base64url(JSON.stringify(payload));
  const sig = hmacSha256(body, secret);
  return `${body}.${sig}`;
}

export async function verifyQR(token: string): Promise<QrPayload> {
  const cfg = await loadSystemConfig();
  const secret = await getSecret(cfg.qr.secretRef);
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("invalid token format");
  const [body, sig] = parts;
  const exp = hmacSha256(body, secret);
  if (!timingSafeEq(exp, sig)) throw new Error("invalid signature");
  const payload = JSON.parse(base64urlDecode(body)) as QrPayload;
  if (Date.now() - payload.ts > 7 * 24 * 3600 * 1000) throw new Error("token expired");
  return payload;
}
