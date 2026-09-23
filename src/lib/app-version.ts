import type { AppPlatform } from "@/lib/types";

/** Platforms an admin can publish version config for. `all` is the fallback row. */
export const APP_PLATFORMS: readonly AppPlatform[] = ["all", "ios", "android", "web"] as const;

export const APP_PLATFORM_LABELS: Record<AppPlatform, string> = {
  all: "All platforms",
  ios: "iOS",
  android: "Android",
  web: "Web",
};

/** Strict validation for the server route. */
export function isPlatform(value: unknown): value is AppPlatform {
  return typeof value === "string" && (APP_PLATFORMS as readonly string[]).includes(value);
}

const SEMVER_RE = /^\d{1,3}(\.\d{1,3}){0,3}$/;

/** Lenient version parse: accepts `1`, `1.2`, `1.2.0`. */
export function isValidVersion(value: string): boolean {
  return SEMVER_RE.test(value.trim());
}

/** Numeric compare of dotted versions; -1/0/1 as expected. Non-numeric parts compare as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const pb = b.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * True when a client on `clientVersion` must be force-updated for `platform`
 * given the config rows (platform-specific row wins over the `all` row).
 */
export function isForceUpdateRequired(
  clientVersion: string,
  configs: { platform: string; min_required_version: string | null; is_force_update: boolean }[],
  platform: string,
): boolean {
  const specific = configs.find((c) => c.platform === platform);
  const fallback = configs.find((c) => c.platform === "all");
  const config = specific ?? fallback;
  if (!config || !config.is_force_update || !config.min_required_version) return false;
  return compareVersions(clientVersion, config.min_required_version) < 0;
}
