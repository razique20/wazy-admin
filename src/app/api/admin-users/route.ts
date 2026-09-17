import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface AuthUser {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
}

/**
 * GET /api/admin-users
 * Lists auth.users via the service role key (server-side only, bypasses RLS).
 * If SUPABASE_SERVICE_ROLE_KEY is not configured, degrades gracefully to an
 * empty user list — the Users page then shows owners derived from data tables.
 */
export async function GET() {
  if (!hasServiceRoleKey()) {
    return NextResponse.json({
      users: [],
      source: "unconfigured" as const,
      message:
        "SUPABASE_SERVICE_ROLE_KEY is not set — add it to .env.local to list registered users from auth.users.",
    });
  }

  try {
    const admin = createServiceRoleClient();
    const users: AuthUser[] = [];
    // Paginate through auth users (50 per page by default).
    for (let page = 1; page <= 10; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 50 });
      if (error) throw new Error(error.message);
      for (const u of data.users) {
        users.push({
          id: u.id,
          email: u.email ?? null,
          createdAt: u.created_at ?? null,
          lastSignInAt: u.last_sign_in_at ?? null,
        });
      }
      if (data.users.length < 50) break;
    }

    return NextResponse.json({ users, source: "service_role" as const });
  } catch (err) {
    return NextResponse.json(
      {
        users: [],
        source: "error" as const,
        message: err instanceof Error ? err.message : "Failed to list users",
      },
      { status: 500 },
    );
  }
}
