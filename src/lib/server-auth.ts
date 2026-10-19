import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase";
import { type AdminRecord, type AdminRole } from "@/lib/admins";
import type { User } from "@supabase/supabase-js";

export type AuthVerificationResult =
  | {
      authorized: true;
      user: User;
      admin: AdminRecord;
    }
  | {
      authorized: false;
      response: NextResponse;
    };

/**
 * Server-side helper to verify that a request is authenticated by an active administrator.
 * If `requiredRole` is provided (e.g., 'super_admin'), verifies that the admin has that exact role.
 */
export async function verifyAdminRequest(
  req: Request,
  requiredRole?: AdminRole,
): Promise<AuthVerificationResult> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Unauthorized: Missing or malformed Authorization header" },
        { status: 401 },
      ),
    };
  }

  if (!hasServiceRoleKey()) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY is not configured" },
        { status: 503 },
      ),
    };
  }

  const token = authHeader.slice(7).trim();
  const adminClient = createServiceRoleClient();

  try {
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: "Unauthorized: Invalid or expired session token" },
          { status: 401 },
        ),
      };
    }

    const userId = userData.user.id;
    const { data: roleRow, error: roleError } = await adminClient
      .from("admin_roles")
      .select("id, user_id, email, role, display_name, is_active, created_by, created_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (roleError) {
      if (
        roleError.code === "42P01" ||
        roleError.code === "PGRST205" ||
        roleError.message.includes("relation \"public.admin_roles\" does not exist") ||
        roleError.message.includes("in the schema cache")
      ) {
        return {
          authorized: false,
          response: NextResponse.json(
            {
              notMigrated: true,
              error: "Table 'public.admin_roles' does not exist yet. Run supabase/admin_roles_schema.sql to set it up.",
            },
            { status: 503 },
          ),
        };
      }
      return {
        authorized: false,
        response: NextResponse.json(
          { error: `Database error checking admin role: ${roleError.message}` },
          { status: 500 },
        ),
      };
    }

    if (!roleRow || !roleRow.is_active) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: "Forbidden: Account is not an active finavig administrator" },
          { status: 403 },
        ),
      };
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
    };

    if (requiredRole && admin.role !== requiredRole) {
      return {
        authorized: false,
        response: NextResponse.json(
          {
            error: `Forbidden: This action requires '${requiredRole}' privileges. Your current role is '${admin.role}'.`,
          },
          { status: 403 },
        ),
      };
    }

    return {
      authorized: true,
      user: userData.user,
      admin,
    };
  } catch (err) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: err instanceof Error ? err.message : "Authentication verification failed" },
        { status: 500 },
      ),
    };
  }
}
