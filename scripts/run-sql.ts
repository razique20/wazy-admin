/**
 * Runs a SQL file against the Supabase Postgres database (direct connection).
 *
 * Purpose: migrations like supabase/user_data_cascade_schema.sql need real
 * DDL, which PostgREST (the service-role key) cannot execute. This runner
 * connects with the database password instead.
 *
 * Credentials (first match wins):
 *   1. SUPABASE_DB_URL      — full Postgres URI, e.g.
 *                             postgresql://postgres:[PASSWORD]@db.<ref>.supabase.co:5432/postgres
 *   2. SUPABASE_DB_PASSWORD — the dashboard database password; the host is
 *                             derived from NEXT_PUBLIC_SUPABASE_URL.
 *
 * Both are read from .env.local (gitignored) or the process environment.
 * Get the password from: Dashboard → Project Settings → Database.
 *
 * Usage:
 *   npx tsx scripts/run-sql.ts supabase/user_data_cascade_schema.sql
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

function connectionConfig(): { connectionString: string; host: string } {
  loadEnvLocal();

  if (process.env.SUPABASE_DB_URL) {
    const url = new URL(process.env.SUPABASE_DB_URL);
    return { connectionString: process.env.SUPABASE_DB_URL, host: url.hostname };
  }

  const password = process.env.SUPABASE_DB_PASSWORD;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (password && supabaseUrl) {
    const ref = new URL(supabaseUrl).hostname.split(".")[0];
    const host = `db.${ref}.supabase.co`;
    return {
      connectionString: `postgresql://postgres:${encodeURIComponent(password)}@${host}:5432/postgres`,
      host,
    };
  }

  console.error(
    "Missing database credentials. Add ONE of these to .env.local (gitignored):\n" +
      "  SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.<ref>.supabase.co:5432/postgres\n" +
      "  SUPABASE_DB_PASSWORD=<database password from Dashboard → Settings → Database>\n" +
      "(NEXT_PUBLIC_SUPABASE_URL is already known, so the password alone suffices.)",
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npx tsx scripts/run-sql.ts <path-to.sql>");
    process.exit(1);
  }
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) {
    console.error(`SQL file not found: ${path}`);
    process.exit(1);
  }
  const sql = readFileSync(path, "utf8");

  const { connectionString, host } = connectionConfig();
  console.log(`Connecting to ${host} …`);
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  // Surface the script's `raise notice` output (cleanup/fk/report lines).
  client.on("notice", (n) => console.log(`NOTICE: ${n.message}`));

  await client.connect();
  try {
    console.log(`Running ${file} (${sql.length} chars) …`);
    const result = await client.query(sql);
    console.log(`Done. Command tag: ${result.command}, rows: ${result.rowCount ?? 0}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
