import { describe, expect, it } from "vitest";
import { batchZone, daysToExpiry } from "../src/lib/fefo";

describe("FEFO expiry dates use the Jakarta business day", () => {
  it("keeps a batch available through the expiry date and expires it at Jakarta midnight", () => {
    const expiry = "2026-10-27";
    expect(batchZone(expiry, new Date("2026-10-27T16:59:59.999Z"))).not.toBe("EXPIRED");
    expect(batchZone(expiry, new Date("2026-10-27T17:00:00.000Z"))).toBe("EXPIRED");
    expect(daysToExpiry(expiry, new Date("2026-10-27T17:00:00.000Z"))).toBe(-1);
  });
});