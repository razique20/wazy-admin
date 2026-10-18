import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase";
import { type AdminRecord, type AdminRole } from "@/lib/admins";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/admin-roles/me
 * Checks if the currently authenticated Supabase user is an active administrator.
 * Expects Bearer token in Authorization header.
 */
export async function GET(req: Request) {
  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { isAuthorized: false, error: "Server misconfiguration: Service key missing" },
      { status: 503, headers: NO_STORE },
    );
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { isAuthorized: false, error: "Missing or malformed Authorization header" },
      { status: 401, headers: NO_STORE },
    );
  }

  const token = authHeader.slice(7).trim();
  const adminClient = createServiceRoleClient();

  try {
    // 1. Verify the Supabase JWT
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return NextResponse.json(
        { isAuthorized: false, error: "Invalid or expired session" },
        { status: 401, headers: NO_STORE },
      );
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email ?? "";

    // 2. Query admin_roles for this user
    const { data: roleRow, error: roleError } = await adminClient
      .from("admin_roles")
      .select("id, user_id, email, role, display_name, is_active, created_by, created_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (roleError) {
      // If table doesn't exist yet, return unmigrated state
      if (
        roleError.code === "42P01" ||
        roleError.code === "PGRST205" ||
        roleError.message.includes("relation \"public.admin_roles\" does not exist") ||
        roleError.message.includes("in the schema cache")
      ) {
        return NextResponse.json(
          {
            isAuthorized: false,
            notMigrated: true,
            error: "Database table 'public.admin_roles' does not exist yet. Run supabase/admin_roles_schema.sql",
          },
          { headers: NO_STORE },
        );
      }
      throw new Error(roleError.message);
    }

    if (!roleRow) {
      return NextResponse.json(
        {
          isAuthorized: false,
          error: "Your account is not registered as an administrator on finavig.",
          user: { id: userId, email: userEmail },
        },
        { status: 403, headers: NO_STORE },
      );
    }

    if (!roleRow.is_active) {
      return NextResponse.json(
        {
          isAuthorized: false,
          error: "Your administrator access has been suspended. Please contact a Super Admin.",
          user: { id: userId, email: userEmail },
        },
        { status: 403, headers: NO_STORE },
      );
    }

    const admin: AdminRecord = {
      id: roleRow.id,
      userId: roleRow.user_id,
      email: roleRow.email,
      role: roleRow.role as AdminRole,
      displayName: roleRow.display_name,
      isActive: roleRow.is_active,
      createdBy: roleRow.created_by,
      createdAt: roleRow.created_at,
      updatedAt: roleRow.updated_at,
      lastSignInAt: userData.user.last_sign_in_at ?? null,
      emailConfirmedAt: userData.user.email_confirmed_at ?? null,
    };

    return NextResponse.json(
      {
        isAuthorized: true,
        admin,
        role: admin.role,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    return NextResponse.json(
      {
        isAuthorized: false,
        error: err instanceof Error ? err.message : "Failed to verify admin authorization",
      },
      { status: 500, headers: NO_STORE },
    );
  }
}
