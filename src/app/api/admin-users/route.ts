import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase";
import { directDbConfigured, withDirectDb } from "@/lib/db-read";

export const dynamic = "force-dynamic";

export interface AuthUser {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  bannedUntil: string | null;
}

interface UsersPayload {
  users: AuthUser[];
  source: "service_role" | "direct_pg" | "unconfigured" | "error";
  message?: string;
}

/**
 * GET /api/admin-users
 * Lists auth.users via the service role key (server-side only, bypasses RLS).
 * Preferred path: direct Postgres read (SUPABASE_DB_URL or SUPABASE_DB_PASSWORD),
 * which bypasses the GoTrue HTTP edge — during a Supabase incident that edge
 * served stale user lists to specific regions while the primary was correct.
 * Falls back to the GoTrue admin API, and degrades gracefully to an empty
 * list when neither is configured.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

async function listUsersDirectPg(): Promise<AuthUser[]> {
  return withDirectDb(async (client) => {
    const { rows } = await client.query<{
      id: string;
      email: string | null;
      created_at: string | null;
      last_sign_in_at: string | null;
      email_confirmed_at: string | null;
      banned_until: string | null;
    }>(
      `select id::text, email, created_at::text, last_sign_in_at::text,
              email_confirmed_at::text, banned_until::text
       from auth.users order by created_at asc limit 1000`,
    );
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      createdAt: r.created_at,
      lastSignInAt: r.last_sign_in_at,
      emailConfirmedAt: r.email_confirmed_at,
      bannedUntil: r.banned_until,
    }));
  });
}

export async function GET() {
  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      {
        users: [],
        source: "unconfigured" as const,
        message:
          "SUPABASE_SERVICE_ROLE_KEY is not set — add it to .env.local to list registered users from auth.users.",
      },
      { headers: NO_STORE },
    );
  }

  try {
    if (directDbConfigured()) {
      try {
        const users = await listUsersDirectPg();
        return NextResponse.json<UsersPayload>({ users, source: "direct_pg" }, { headers: NO_STORE });
      } catch (err) {
        console.warn("[admin-users] direct PG read failed, falling back to GoTrue API:", err instanceof Error ? err.message : err);
      }
    }

    const admin = createServiceRoleClient();
    const users: AuthUser[] = [];
    // Paginate through auth users (50 per page by default).
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 50 });
      if (error) throw new Error(error.message);
      for (const u of data.users) {
        users.push({
          id: u.id,
          email: u.email ?? null,
          createdAt: u.created_at ?? null,
          lastSignInAt: u.last_sign_in_at ?? null,
          emailConfirmedAt: u.email_confirmed_at ?? null,
          bannedUntil: u.banned_until ?? null,
        });
      }
      if (data.users.length < 50) break;
    }

    return NextResponse.json({ users, source: "service_role" as const }, { headers: NO_STORE });
  } catch (err) {
    return NextResponse.json(
      {
        users: [],
        source: "error" as const,
        message: err instanceof Error ? err.message : "Failed to list users",
      },
      { status: 500, headers: NO_STORE },
    );
  }
}
