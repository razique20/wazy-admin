import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";
import { verifyAdminRequest } from "@/lib/server-auth";
import {
  toAdminRole,
  canDemoteOrDeactivateAdmin,
  canRevokeAdmin,
  type AdminRecord,
  type AdminRole,
} from "@/lib/admins";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

interface AdminRolesApiResponse {
  configured: boolean;
  admins: AdminRecord[];
  source: "service_role" | "unconfigured" | "not_migrated" | "error";
  message?: string;
}

/**
 * GET /api/admin-roles
 * Lists all assigned administrator roles merged with their auth.users metadata.
 */
export async function GET(req: Request) {
  const auth = await verifyAdminRequest(req, "super_admin");
  if (!auth.authorized) {
    return auth.response;
  }

  if (!hasServiceRoleKey()) {
    const body: AdminRolesApiResponse = {
      configured: false,
      admins: [],
      source: "unconfigured",
      message: "SUPABASE_SERVICE_ROLE_KEY is not configured.",
    };
    return NextResponse.json(body, { headers: NO_STORE });
  }

  try {
    const adminClient = createServiceRoleClient();

    // 1. Fetch admin_roles
    const { data: roleRows, error: rolesError } = await adminClient
      .from("admin_roles")
      .select("id, user_id, email, role, display_name, is_active, created_by, created_at, updated_at")
      .order("created_at", { ascending: true });

    if (rolesError) {
      // Postgres error 42P01: undefined_table or PostgREST PGRST205: schema cache missing table
      if (
        rolesError.code === "42P01" ||
        rolesError.code === "PGRST205" ||
        rolesError.message.includes("relation \"public.admin_roles\" does not exist") ||
        rolesError.message.includes("in the schema cache")
      ) {
        return NextResponse.json(
          {
            configured: false,
            admins: [],
            source: "not_migrated",
            message: "Table 'public.admin_roles' does not exist yet. Run supabase/admin_roles_schema.sql to set it up.",
          },
          { headers: NO_STORE },
        );
      }
      throw new Error(rolesError.message);
    }

    // 2. Fetch auth.users to join lastSignInAt & account status
    const authMap = new Map<string, { lastSignInAt: string | null; emailConfirmedAt: string | null; bannedUntil: string | null }>();
    try {
      const { data: authData } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of authData?.users ?? []) {
        authMap.set(u.id, {
          lastSignInAt: u.last_sign_in_at ?? null,
          emailConfirmedAt: u.email_confirmed_at ?? null,
          bannedUntil: (u as { banned_until?: string | null }).banned_until ?? null,
        });
      }
    } catch {
      // Non-fatal: auth listing failure still allows displaying admin roles
    }

    const admins: AdminRecord[] = (roleRows ?? []).map((row) => {
      const auth = authMap.get(row.user_id);
      return {
        id: row.id,
        userId: row.user_id,
        email: row.email,
        role: row.role as AdminRole,
        displayName: row.display_name,
        isActive: row.is_active,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastSignInAt: auth?.lastSignInAt ?? null,
        emailConfirmedAt: auth?.emailConfirmedAt ?? null,
        bannedUntil: auth?.bannedUntil ?? null,
      };
    });

    return NextResponse.json(
      {
        configured: true,
        admins,
        source: "service_role",
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    return NextResponse.json(
      {
        configured: false,
        admins: [],
        source: "error",
        message: err instanceof Error ? err.message : "Failed to load admin roles",
      },
      { status: 500, headers: NO_STORE },
    );
  }
}

/**
 * POST /api/admin-roles
 * Assigns an admin role to an existing auth.user or invites an admin.
 * Body: { userId?: string, email?: string, role: "super_admin" | "admin", displayName?: string }
 */
export async function POST(req: Request) {
  const auth = await verifyAdminRequest(req, "super_admin");
  if (!auth.authorized) {
    return auth.response;
  }

  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 503 });
  }

  let body: { userId?: string; email?: string; role?: string; displayName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const role = toAdminRole(body.role);
  if (!role) {
    return NextResponse.json({ error: "Invalid role. Must be 'super_admin' or 'admin'" }, { status: 400 });
  }

  const targetEmail = body.email?.trim().toLowerCase();
  let targetUserId = body.userId?.trim();

  const adminClient = createServiceRoleClient();

  // If userId not provided, locate by email in auth.users
  if (!targetUserId && targetEmail) {
    const { data: users, error: searchError } = await adminClient.auth.admin.listUsers();
    if (searchError) {
      return NextResponse.json({ error: `Auth search failed: ${searchError.message}` }, { status: 500 });
    }
    const matched = users?.users.find((u) => u.email?.toLowerCase() === targetEmail);
    if (!matched) {
      return NextResponse.json(
        { error: `No user account found with email '${targetEmail}'. User must sign up before being granted an admin role.` },
        { status: 404 },
      );
    }
    targetUserId = matched.id;
  }

  if (!targetUserId) {
    return NextResponse.json({ error: "Either userId or email must be provided" }, { status: 400 });
  }

  // Get user's confirmed email
  let resolvedEmail = targetEmail ?? "";
  if (!resolvedEmail) {
    const { data: authUser } = await adminClient.auth.admin.getUserById(targetUserId);
    resolvedEmail = authUser?.user?.email ?? "";
  }

  if (!resolvedEmail) {
    return NextResponse.json({ error: "Cannot assign admin role to user without an email address" }, { status: 400 });
  }

  const displayName = body.displayName?.trim() || null;

  // Upsert into admin_roles
  const { data: newRow, error: upsertError } = await adminClient
    .from("admin_roles")
    .upsert(
      {
        user_id: targetUserId,
        email: resolvedEmail,
        role,
        display_name: displayName,
        is_active: true,
        created_by: "admin-console",
      },
      { onConflict: "user_id" },
    )
    .select()
    .single();

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  // Write audit log
  await writeAuditLog(adminClient, {
    action: "admin.grant",
    userId: targetUserId,
    targetTable: "admin_roles",
    targetId: newRow.id,
    details: {
      email: resolvedEmail,
      role,
      displayName,
    },
    performedBy: "admin-console",
  });

  return NextResponse.json({ success: true, admin: newRow });
}

/**
 * PATCH /api/admin-roles
 * Updates an admin's role or toggles their active status.
 * Body: { userId: string, role?: "super_admin" | "admin", isActive?: boolean, displayName?: string }
 */
export async function PATCH(req: Request) {
  const auth = await verifyAdminRequest(req, "super_admin");
  if (!auth.authorized) {
    return auth.response;
  }

  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 503 });
  }

  let body: { userId?: string; role?: string; isActive?: boolean; displayName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const adminClient = createServiceRoleClient();

  // Load all admin roles to enforce safety checks
  const { data: allAdmins, error: fetchError } = await adminClient
    .from("admin_roles")
    .select("*");

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const currentAdmin = (allAdmins ?? []).find((a) => a.user_id === userId);
  if (!currentAdmin) {
    return NextResponse.json({ error: "Admin record not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  // Check role update
  if (body.role !== undefined) {
    const newRole = toAdminRole(body.role);
    if (!newRole) {
      return NextResponse.json({ error: "Invalid role specified" }, { status: 400 });
    }

    if (currentAdmin.role === "super_admin" && newRole !== "super_admin") {
      const safeguard = canDemoteOrDeactivateAdmin(userId, "super_admin", (allAdmins ?? []).map((a) => ({
        id: a.id,
        userId: a.user_id,
        email: a.email,
        role: a.role as AdminRole,
        displayName: a.display_name,
        isActive: a.is_active,
        createdBy: a.created_by,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
      })));

      if (!safeguard.allowed) {
        return NextResponse.json({ error: safeguard.reason }, { status: 400 });
      }
    }
    updates.role = newRole;
  }

  // Check active toggle
  if (body.isActive !== undefined) {
    if (!body.isActive && currentAdmin.role === "super_admin") {
      const safeguard = canDemoteOrDeactivateAdmin(userId, "super_admin", (allAdmins ?? []).map((a) => ({
        id: a.id,
        userId: a.user_id,
        email: a.email,
        role: a.role as AdminRole,
        displayName: a.display_name,
        isActive: a.is_active,
        createdBy: a.created_by,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
      })));

      if (!safeguard.allowed) {
        return NextResponse.json({ error: safeguard.reason }, { status: 400 });
      }
    }
    updates.is_active = Boolean(body.isActive);
  }

  if (body.displayName !== undefined) {
    updates.display_name = body.displayName?.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields provided for update" }, { status: 400 });
  }

  const { data: updated, error: updateError } = await adminClient
    .from("admin_roles")
    .update(updates)
    .eq("user_id", userId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Write audit log
  await writeAuditLog(adminClient, {
    action: body.role !== undefined ? "admin.update_role" : "admin.toggle_status",
    userId,
    targetTable: "admin_roles",
    targetId: currentAdmin.id,
    details: {
      old: { role: currentAdmin.role, isActive: currentAdmin.is_active },
      new: updates,
    },
    performedBy: auth.admin.email || "super_admin",
  });

  return NextResponse.json({ success: true, admin: updated });
}

/**
 * DELETE /api/admin-roles
 * Revokes admin privileges from an account.
 * Body: { userId: string }
 */
export async function DELETE(req: Request) {
  const auth = await verifyAdminRequest(req, "super_admin");
  if (!auth.authorized) {
    return auth.response;
  }

  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 503 });
  }

  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const adminClient = createServiceRoleClient();

  // Load all admin roles to enforce safety checks
  const { data: allAdmins, error: fetchError } = await adminClient
    .from("admin_roles")
    .select("*");

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const currentAdmin = (allAdmins ?? []).find((a) => a.user_id === userId);
  if (!currentAdmin) {
    return NextResponse.json({ error: "Admin record not found" }, { status: 404 });
  }

  // Check safeguard
  const safeguard = canRevokeAdmin(userId, (allAdmins ?? []).map((a) => ({
    id: a.id,
    userId: a.user_id,
    email: a.email,
    role: a.role as AdminRole,
    displayName: a.display_name,
    isActive: a.is_active,
    createdBy: a.created_by,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  })));

  if (!safeguard.allowed) {
    return NextResponse.json({ error: safeguard.reason }, { status: 400 });
  }

  const { error: deleteError } = await adminClient
    .from("admin_roles")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Write audit log
  await writeAuditLog(adminClient, {
    action: "admin.revoke",
    userId,
    targetTable: "admin_roles",
    targetId: currentAdmin.id,
    details: {
      revokedRole: currentAdmin.role,
      revokedEmail: currentAdmin.email,
    },
    performedBy: auth.admin.email || "super_admin",
  });

  return NextResponse.json({ success: true, revokedUserId: userId });
}
