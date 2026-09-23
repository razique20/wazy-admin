import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase";
import { isPlatform } from "@/lib/app-version";

export const dynamic = "force-dynamic";

interface UpsertRequest {
  platform?: unknown;
  minRequiredVersion?: unknown;
  latestVersion?: unknown;
  isForceUpdate?: unknown;
  downloadUrl?: unknown;
  releaseNotes?: unknown;
}

interface UpsertResponse {
  ok: boolean;
  id?: string;
  error?: string;
}

const VERSION_RE = /^\d{1,3}(\.\d{1,3}){0,3}$/;

function cleanVersion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v !== "" && VERSION_RE.test(v) ? v : null;
}

/**
 * POST /api/app-versions
 * Upserts the version config row for a platform (one row per platform,
 * unique constraint on `platform`). Writes happen server-side with the
 * service role key; the Flutter app only ever reads this table.
 */
export async function POST(request: Request) {
  if (!hasServiceRoleKey()) {
    return NextResponse.json<UpsertResponse>(
      {
        ok: false,
        error:
          "SUPABASE_SERVICE_ROLE_KEY is not configured — version publishing is disabled. Add it to .env.local and restart.",
      },
      { status: 503 },
    );
  }

  let body: UpsertRequest;
  try {
    body = (await request.json()) as UpsertRequest;
  } catch {
    return NextResponse.json<UpsertResponse>({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isPlatform(body.platform)) {
    return NextResponse.json<UpsertResponse>(
      { ok: false, error: "platform must be one of: all, ios, android, web" },
      { status: 400 },
    );
  }
  const latestVersion = cleanVersion(body.latestVersion);
  if (!latestVersion) {
    return NextResponse.json<UpsertResponse>(
      { ok: false, error: "latestVersion is required and must look like 1.2.0" },
      { status: 400 },
    );
  }
  const minRequiredVersion = cleanVersion(body.minRequiredVersion);
  const isForceUpdate = body.isForceUpdate === true;
  if (isForceUpdate && !minRequiredVersion) {
    return NextResponse.json<UpsertResponse>(
      { ok: false, error: "minRequiredVersion is required when is_force_update is true" },
      { status: 400 },
    );
  }
  const downloadUrl =
    typeof body.downloadUrl === "string" && body.downloadUrl.trim() !== ""
      ? body.downloadUrl.trim().slice(0, 1000)
      : null;
  const releaseNotes =
    typeof body.releaseNotes === "string" && body.releaseNotes.trim() !== ""
      ? body.releaseNotes.trim().slice(0, 2000)
      : null;

  const admin = createServiceRoleClient();

  try {
    const { data, error } = await admin
      .from("app_versions")
      .upsert(
        {
          platform: body.platform,
          min_required_version: minRequiredVersion,
          latest_version: latestVersion,
          is_force_update: isForceUpdate,
          download_url: downloadUrl,
          release_notes: releaseNotes,
        },
        { onConflict: "platform" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json<UpsertResponse>({ ok: true, id: data?.id ?? undefined });
  } catch (err) {
    return NextResponse.json<UpsertResponse>(
      { ok: false, error: err instanceof Error ? err.message : "Failed to save version config" },
      { status: 500 },
    );
  }
}

