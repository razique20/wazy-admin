import { describe, expect, it } from "vitest";
import {
  APP_PLATFORMS,
  compareVersions,
  isForceUpdateRequired,
  isPlatform,
  isValidVersion,
} from "@/lib/app-version";

describe("isPlatform", () => {
  it("accepts exactly the platform values", () => {
    expect(APP_PLATFORMS).toEqual(["all", "ios", "android", "web"]);
    for (const p of APP_PLATFORMS) expect(isPlatform(p)).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isPlatform("windows")).toBe(false);
    expect(isPlatform("iOS")).toBe(false);
    expect(isPlatform(null)).toBe(false);
  });
});

describe("isValidVersion", () => {
  it("accepts dotted numeric versions", () => {
    expect(isValidVersion("1")).toBe(true);
    expect(isValidVersion("1.2")).toBe(true);
    expect(isValidVersion("1.2.0")).toBe(true);
    expect(isValidVersion(" 1.2.0 ")).toBe(true);
  });

  it("rejects garbage", () => {
    expect(isValidVersion("v1.2")).toBe(false);
    expect(isValidVersion("1.2.0-beta")).toBe(false);
    expect(isValidVersion("")).toBe(false);
  });
});

describe("compareVersions", () => {
  it("compares numerically, not lexically", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "10.0.0")).toBeLessThan(0);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
  });
});

describe("isForceUpdateRequired", () => {
  const configs = [
    { platform: "all", min_required_version: "1.0.5", is_force_update: true },
    { platform: "ios", min_required_version: "2.0.0", is_force_update: true },
    { platform: "android", min_required_version: null, is_force_update: false },
  ];

  it("uses the platform-specific row when present", () => {
    expect(isForceUpdateRequired("1.9.9", configs, "ios")).toBe(true);
    expect(isForceUpdateRequired("2.0.0", configs, "ios")).toBe(false);
  });

  it("falls back to the all row", () => {
    expect(isForceUpdateRequired("1.0.4", configs, "web")).toBe(true);
    expect(isForceUpdateRequired("1.0.5", configs, "web")).toBe(false);
  });

  it("never forces when the row disables it or has no minimum", () => {
    expect(isForceUpdateRequired("0.1.0", configs, "android")).toBe(false);
    expect(isForceUpdateRequired("0.1.0", [], "ios")).toBe(false);
  });
});
