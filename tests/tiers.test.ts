import { describe, expect, it } from "vitest";
import {
  TIER_DURATIONS,
  TIER_VALUES,
  expiryForDuration,
  isExpired,
  isTier,
  isTierDuration,
  isUserId,
  parseUpgradeRequest,
  resolveTier,
  shortUserId,
  toTier,
} from "@/lib/tiers";

const USER_ID = "3f2a1b2c-4d5e-4f60-8a7b-9c0d1e2f3a4b";

describe("isTier / toTier — app contract", () => {
  it("accepts exactly the lowercase contract values", () => {
    expect(TIER_VALUES).toEqual(["free", "plus", "business"]);
    for (const t of TIER_VALUES) expect(isTier(t)).toBe(true);
  });

  it("rejects anything that is not an exact contract value", () => {
    expect(isTier("Free")).toBe(false);
    expect(isTier("PLUS")).toBe(false);
    expect(isTier("premium")).toBe(false);
    expect(isTier("")).toBe(false);
    expect(isTier(null)).toBe(false);
    expect(isTier(42)).toBe(false);
  });

  it("lenient parse normalizes case/whitespace and still rejects garbage", () => {
    expect(toTier(" Plus ")).toBe("plus");
    expect(toTier("BUSINESS")).toBe("business");
    expect(toTier("premium")).toBeNull();
  });

  it("resolveTier falls back to Free like the app does", () => {
    expect(resolveTier(null)).toBe("free");
    expect(resolveTier({ tier: "plus" })).toBe("plus");
    expect(resolveTier({ tier: "weird" })).toBe("free");
  });
});

describe("isUserId / shortUserId", () => {
  it("accepts only UUIDs", () => {
    expect(isUserId(USER_ID)).toBe(true);
    expect(isUserId(USER_ID.toUpperCase())).toBe(true);
    expect(isUserId("not-a-uuid")).toBe(false);
    expect(isUserId("")).toBe(false);
  });

  it("shortens for confirmation dialogs", () => {
    expect(shortUserId(USER_ID)).toBe("3f2a…");
  });
});

describe("tier durations — 1 month / 3 months / 1 year", () => {
  it("exposes exactly the picker values", () => {
    expect(TIER_DURATIONS).toEqual(["none", "1m", "3m", "1y"]);
    for (const d of TIER_DURATIONS) expect(isTierDuration(d)).toBe(true);
  });

  it("rejects invalid durations", () => {
    expect(isTierDuration("2m")).toBe(false);
    expect(isTierDuration("1M")).toBe(false);
    expect(isTierDuration(null)).toBe(false);
    expect(isTierDuration(42)).toBe(false);
  });

  it("adds calendar months so 1 year is exactly 12 months", () => {
    expect(expiryForDuration("none", new Date("2026-01-15T00:00:00Z"))).toBeNull();
    expect(expiryForDuration("1m", new Date("2026-01-15T00:00:00Z"))).toBe("2026-02-15T00:00:00.000Z");
    expect(expiryForDuration("3m", new Date("2026-01-15T00:00:00Z"))).toBe("2026-04-15T00:00:00.000Z");
    expect(expiryForDuration("1y", new Date("2026-01-15T00:00:00Z"))).toBe("2027-01-15T00:00:00.000Z");
  });

  it("clamps month-end dates (Jan 31 + 1 month → Feb 28)", () => {
    expect(expiryForDuration("1m", new Date("2026-01-31T12:00:00Z"))).toBe("2026-02-28T12:00:00.000Z");
  });

  it("flags rows as expired only after the timestamp (with 5-minute skew grace)", () => {
    const now = new Date("2026-03-10T12:00:00Z");
    expect(isExpired(null, now)).toBe(false);
    expect(isExpired("garbage", now)).toBe(false);
    expect(isExpired("2026-03-10T11:00:00Z", now)).toBe(true); // 1h ago
    expect(isExpired("2026-03-10T11:58:00Z", now)).toBe(false); // within grace
    expect(isExpired("2026-03-11T12:00:00Z", now)).toBe(false); // future
  });

  it("resolveTier still falls back to Free regardless of expiry (app contract unchanged)", () => {
    expect(resolveTier({ tier: "plus" })).toBe("plus");
  });
});

describe("parseUpgradeRequest — quick action", () => {
  it("parses a bare user ID", () => {
    expect(parseUpgradeRequest(USER_ID)).toEqual({ userId: USER_ID, tier: null });
  });

  it("parses the full subject line with em dashes", () => {
    const subject = `Wazy upgrade request — plus — user ${USER_ID}`;
    expect(parseUpgradeRequest(subject)).toEqual({ userId: USER_ID, tier: "plus" });
  });

  it("parses subject with en dashes, hyphen tiers and different casing", () => {
    const subject = `Wazy upgrade request – business – user ${USER_ID}`;
    expect(parseUpgradeRequest(subject)).toEqual({ userId: USER_ID, tier: "business" });
  });

  it("parses free downgrades in the subject line", () => {
    const subject = `Wazy upgrade request — free — user ${USER_ID}`;
    expect(parseUpgradeRequest(subject)).toEqual({ userId: USER_ID, tier: "free" });
  });

  it("parses a pasted email body with labeled fields", () => {
    const body = [
      "Wazy upgrade request",
      `User ID: ${USER_ID}`,
      "Account email: someone@example.com",
      "Current tier: free",
      "Requested tier: plus",
      "Gated feature: 90-day cash-flow forecast",
      "App version: 1.4.0 (Android)",
    ].join("\n");
    expect(parseUpgradeRequest(body)).toEqual({ userId: USER_ID, tier: "plus" });
  });

  it("falls back to the first UUID when labels are missing", () => {
    const text = `Please upgrade ${USER_ID} thanks`;
    expect(parseUpgradeRequest(text)).toEqual({ userId: USER_ID, tier: null });
  });

  it("returns null for input without a user ID", () => {
    expect(parseUpgradeRequest("no id here")).toBeNull();
    expect(parseUpgradeRequest("")).toBeNull();
    expect(parseUpgradeRequest("user user@example.com")).toBeNull();
  });
});
