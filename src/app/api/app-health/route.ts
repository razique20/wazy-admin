import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/app-health
 * P1.3: Returns app error reports alongside app_usage_stats so the App Health
 * page and the Error Reports tab can both be served from one endpoint.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY for reading auth.users and app_usage_stats.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const includeErrorReports = url.searchParams.get("includeErrorReports") !== "false";

  try {
    const serviceRoleClient = createServiceRoleClient();
    if (!hasServiceRoleKey()) {
      return Response.json({ error: "Service role key not configured" }, { status: 500 });
    }

    let errorReportsData = null;
    if (includeErrorReports) {
      const errorReportsResult = await serviceRoleClient
        .from("error_reports")
        .select("*")
        .order("created_at", { ascending: false });

      if (errorReportsResult.error) {
        console.error("Error fetching error reports:", errorReportsResult.error);
      } else {
        errorReportsData = errorReportsResult.data || [];
      }
    }

    // Fetch auth users count using GoTrue Admin API
    // Note: .from("auth", "users") doesn't work with Supabase JS client for auth schema
    const admin = serviceRoleClient.auth.admin;
    const listUsersResult = await admin.listUsers({ page: 1, perPage: 1 });
    // Response: { data: { users, total, nextPage, lastPage, ... }, error }
    const totalRegisteredUsers = listUsersResult.data?.total ?? 0;

    // Fetch usage stats
    const usageStatsResult = await serviceRoleClient
      .from("app_usage_stats")
      .select("*");

    if (usageStatsResult.error) {
      console.error("Error fetching usage stats:", usageStatsResult.error);
      return Response.json({ error: "Failed to fetch usage stats" }, { status: 500 });
    }

    const usageStats = usageStatsResult.data || [];
    const usersWithUsageHistory = usageStats.length;

    // Calculate active users based on last_app_open timestamps
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let dau = 0;
    let wau = 0;
    let mau = 0;

    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    for (const stat of usageStats) {
      const lastOpen = stat.last_app_open ? new Date(stat.last_app_open) : null;
      if (!lastOpen) continue;

      if (lastOpen >= oneDayAgo) dau++;
      if (lastOpen >= sevenDaysAgo) wau++;
      if (lastOpen >= thirtyDaysAgo) mau++;
    }

    // Platform distribution
    const platformCounts: Record<string, number> = {};
    for (const stat of usageStats) {
      if (stat.platform) {
        platformCounts[stat.platform] = (platformCounts[stat.platform] || 0) + 1;
      }
    }

    const platformDistribution = Object.entries(platformCounts).map(([platform, users]) => ({
      platform,
      users,
      percentage: usersWithUsageHistory > 0 ? (users / usersWithUsageHistory) * 100 : 0,
    }));

    // Version adoption
    const versionCounts: Record<string, number> = {};
    for (const stat of usageStats) {
      if (stat.app_version) {
        versionCounts[stat.app_version] = (versionCounts[stat.app_version] || 0) + 1;
      }
    }

    const totalVersionUsers = Object.values(versionCounts).reduce((sum, count) => sum + count, 0);
    const versionAdoption = Object.entries(versionCounts)
      .sort((a, b) => b[1] - a[1]) // Sort by users descending
      .map(([version, users]) => ({
        version,
        platform: "all", // We don't track version per platform currently
        users,
        percentage: totalVersionUsers > 0 ? (users / totalVersionUsers) * 100 : 0,
      }));

    return Response.json({
      totalRegisteredUsers,
      usersWithUsageHistory,
      activeUsers: { dau, wau, mau },
      platformDistribution,
      versionAdoption,
      errorReports: errorReportsData || [],
      usageStats: usageStats,
    });
  } catch (error) {
    console.error("Unexpected error in app-health route:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}



