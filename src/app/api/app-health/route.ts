import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase";


export const dynamic = "force-dynamic";

interface AppHealthMetrics {
  period: string;
  totalRegisteredUsers: number;
  activeUsers: {
    dau: number;        // Daily active (last 24h)
    wau: number;        // Weekly active (last 7 days)
    mau: number;        // Monthly active (last 30 days)
  };
  versionAdoption: {
    version: string;
    platform: string;
    users: number;
    percentage: number;
  }[];
  platformDistribution: {
    platform: string;
    users: number;
    percentage: number;
  }[];
  forceUpdateStatus: {
    isForceUpdateEnabled: boolean;
    minRequiredVersion: string | null;
    usersBelowMinVersion: number;
  } | null;
}

/**
 * GET /api/app-health?period=30d
 * Returns app health metrics:
 * - DAU/WAU/MAU active users
 * - Version adoption breakdown
 * - Platform distribution (iOS/Android/Web)
 * - Force update compliance status
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY for reading auth.users and app_usage_stats.
 */
export async function GET(request: Request) {
  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      {
        ok: false,
        error: "SUPABASE_SERVICE_ROLE_KEY is not configured - app health metrics unavailable.",
      },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const daysParam = searchParams.get("period");
  const days = daysParam ? parseInt(daysParam, 10) : 30;

  try {
    const admin = createServiceRoleClient();

    // 1. Fetch all auth users
    const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });

    if (usersError) {
      console.warn(`[app-health] Failed to fetch users: ${usersError.message}`);
      return NextResponse.json(
        { ok: false, error: `Failed to fetch user list: ${usersError.message}` },
        { status: 500 }
      );
    }

    // Paginate through all users
    const allUsers = [...(usersData?.users ?? [])];
    let currentPage = 1;
    while (usersData?.users?.length === 50 && currentPage < 20) {
      currentPage++;
      const nextPage = await admin.auth.admin.listUsers({ page: currentPage, perPage: 50 });
      if (nextPage.data?.users) {
        allUsers.push(...nextPage.data.users);
      }
      if (nextPage.data?.users?.length < 50) break;
    }

    const now = new Date();
    const cutoffDate = new Date(now.getTime() - days * 86_400_000);

    // 2. Fetch app usage stats
    const { data: usageDataRaw } = await admin
      .from("app_usage_stats")
      .select("user_id, platform, app_version, last_app_open, first_seen, total_sessions")
      .gte("last_app_open", cutoffDate.toISOString())
      .or("last_app_open.is.null");

    const usageData = usageDataRaw ?? [];
    const usageMap = new Map<string, (typeof usageData)[0]>();
    for (const u of usageData) {
      usageMap.set(u.user_id, u);
    }

    // 3. Compute active users
    let dau = 0, wau = 0, mau = 0;
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);

    for (const user of allUsers) {
      const usage = usageMap.get(user.id);
      const lastOpen = usage?.last_app_open ? new Date(usage.last_app_open) : null;

      if (lastOpen && lastOpen >= twentyFourHoursAgo) dau++;
      if (lastOpen && lastOpen >= sevenDaysAgo) wau++;
      if (lastOpen && lastOpen >= cutoffDate) mau++;
    }

    // 4. Version adoption
    const versionCounts = new Map<string, Map<string, number>>();
    for (const usage of usageData) {
      const version = usage.app_version;
      const platform = usage.platform;
      if (!versionCounts.has(version)) {
        versionCounts.set(version, new Map<string, number>());
      }
      const platformMap = versionCounts.get(version)!;
      platformMap.set(platform, (platformMap.get(platform) ?? 0) + 1);
    }

    const totalWithUsage = usageData.length;
    const versionAdoption: AppHealthMetrics["versionAdoption"] = [];

    for (const [version, platforms] of versionCounts) {
      for (const [platform, count] of platforms) {
        versionAdoption.push({
          version,
          platform,
          users: count,
          percentage: totalWithUsage > 0 ? (count / totalWithUsage) * 100 : 0,
        });
      }
    }

    versionAdoption.sort((a, b) => {
      const versionCompare = b.version.localeCompare(a.version);
      if (versionCompare !== 0) return versionCompare;
      return b.users - a.users;
    });

    // 5. Platform distribution
    const platformCounts = new Map<string, number>();
    for (const usage of usageData) {
      platformCounts.set(usage.platform, (platformCounts.get(usage.platform) ?? 0) + 1);
    }

    const totalPlatformUsers = platformCounts.values().reduce((sum, n) => sum + n, 0);
    const platformDistribution: AppHealthMetrics["platformDistribution"] = [
      { platform: "ios", users: platformCounts.get("ios") ?? 0, percentage: 0 },
      { platform: "android", users: platformCounts.get("android") ?? 0, percentage: 0 },
      { platform: "web", users: platformCounts.get("web") ?? 0, percentage: 0 },
    ].map((p) => ({
      ...p,
      percentage: totalPlatformUsers > 0 ? (p.users / totalPlatformUsers) * 100 : 0,
    }));

    // 6. Force update status
    const { data: versionData } = await admin
      .from("app_versions")
      .select("platform, min_required_version, latest_version, is_force_update")
      .eq("platform", "all")
      .maybeSingle();

    let forceUpdateStatus = null;      if (versionData?.is_force_update) {
      const minVersion = versionData.min_required_version;
      let usersBelowMin = 0;

      for (const usage of usageData) {
        if (usage.app_version) {
          const userParts = usage.app_version.split(".").map(Number);
          const minParts = minVersion?.split(".").map(Number) ?? [];
          let isBelow = false;
          for (let i = 0; i < Math.max(userParts.length, minParts.length); i++) {
            const userPart = userParts[i] ?? 0;
            const minPart = minParts[i] ?? 0;
            if (userPart < minPart) {
              isBelow = true;
              break;
            }
            if (userPart > minPart) break;
          }
          if (isBelow) usersBelowMin++;
        }
      }

      forceUpdateStatus = {
        isForceUpdateEnabled: true,
        minRequiredVersion: minVersion,
        usersBelowMinVersion: usersBelowMin,
      };
    }

    return NextResponse.json(
      {
        ok: true,
        metrics: {
          period: `${days}d`,
          totalRegisteredUsers: allUsers.length,
          activeUsers: { dau, wau, mau },
          versionAdoption,
          platformDistribution,
          forceUpdateStatus,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to compute app health metrics",
      },
      { status: 500 }
    );
  }
}
