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

    const usageStatsResult = await serviceRoleClient
      .from("app_usage_stats")
      .select("*");

    if (usageStatsResult.error) {
      console.error("Error fetching usage stats:", usageStatsResult.error);
      return Response.json({ error: "Failed to fetch usage stats" }, { status: 500 });
    }

    return Response.json({
      errorReports: errorReportsData || [],
      usageStats: usageStatsResult.data || [],
    });
  } catch (error) {
    console.error("Unexpected error in app-health route:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}



