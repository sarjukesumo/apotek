import * as crypto from "crypto";

export function sha256(input: string | Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function sha512(input: string): string {
  return crypto.createHash("sha512").update(input).digest("hex");
}

export function hmacSha256(data: string, key: string): string {
  return crypto.createHmac("sha256", key).update(data).digest("hex");
}

export function timingSafeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export function base64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

export function rand6(): string {
  return crypto.randomBytes(6).toString("base64url").replace(/[^A-Z0-9]/gi, "").slice(0, 6).toUpperCase().padEnd(6, "X");
}
