// Secret Manager loader + systemConfig cache.
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { db } from "./firebase";

const sm = new SecretManagerServiceClient();
const cache = new Map<string, { value: string; exp: number }>();
const CACHE_MS = 5 * 60 * 1000;

export async function getSecret(ref: string): Promise<string> {
  // Allow plain env override for emulator/dev: ENV:NAME
  if (ref.startsWith("ENV:")) {
    const v = process.env[ref.slice(4)];
    if (!v) throw new Error(`Missing env ${ref}`);
    return v;
  }
  const c = cache.get(ref);
  if (c && c.exp > Date.now()) return c.value;
  const [resp] = await sm.accessSecretVersion({ name: ref });
  const value = resp.payload?.data?.toString() ?? "";
  cache.set(ref, { value, exp: Date.now() + CACHE_MS });
  return value;
}

export interface SystemConfig {
  adminAllowlist: string[];
  midtrans: {
    isProduction: boolean;
    serverKeyRef: string;
    clientKeyRef: string;
    notificationUrl: string;
    platformFee: { type: "PERCENT" | "FIXED"; value: number };
  };
  iris: {
    isProduction: boolean;
    creatorKeyRef: string;
    approverKeyRef: string;
    autoApprove: boolean;
  };
  qr: { secretRef: string };
  telegram: {
    botTokenRef: string;
    templates: Record<string, string>;
  };
  featureFlags: Record<string, boolean>;
}

let cfgCache: { value: SystemConfig; exp: number } | null = null;

export async function loadSystemConfig(): Promise<SystemConfig> {
  if (cfgCache && cfgCache.exp > Date.now()) return cfgCache.value;
  const snap = await db.doc("systemConfig/global").get();
  if (!snap.exists) throw new Error("systemConfig/global missing");
  const value = snap.data() as SystemConfig;
  cfgCache = { value, exp: Date.now() + 60_000 };
  return value;
}

export function invalidateConfigCache() { cfgCache = null; }
