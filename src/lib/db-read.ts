import { Client } from "pg";

/**
 * Direct-Postgres read path for server routes.
 *
 * Why: during a Supabase incident the PostgREST/GoTrue HTTP edge can serve
 * stale or poisoned responses to specific regions (serverless functions in
 * Eastern US saw deleted rows and missed fresh ones while the primary
 * database was correct). A direct Postgres connection to db.<ref>.supabase.co
 * bypasses that HTTP edge entirely and always reads the primary.
 *
 * Enabled when SUPABASE_DB_URL (or SUPABASE_DB_PASSWORD +
 * NEXT_PUBLIC_SUPABASE_URL) is configured in the deployment environment.
 * Every helper degrades gracefully: without credentials the caller falls
 * back to the existing PostgREST/GoTrue path.
 */

let cachedClient: Client | null = null;

export function directDbConfigured(): boolean {
  if (process.env.SUPABASE_DB_URL) return true;
  return Boolean(process.env.SUPABASE_DB_PASSWORD && process.env.NEXT_PUBLIC_SUPABASE_URL);
}

function buildConnectionString(): string {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const password = process.env.SUPABASE_DB_PASSWORD ?? "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const ref = new URL(url).hostname.split(".")[0];
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

/**
 * Returns a lazily-created, cached direct-PG client. Reuses one warm
 * connection per serverless instance; reconnects automatically if the
 * previous one errored or ended.
 */
export async function getDirectClient(): Promise<Client> {
  if (cachedClient) {
    try {
      await cachedClient.query("select 1");
      return cachedClient;
    } catch {
      try {
        await cachedClient.end().catch(() => undefined);
      } catch {
        /* ignore */
      }
      cachedClient = null;
    }
  }
  cachedClient = new Client({
    connectionString: buildConnectionString(),
    ssl: { rejectUnauthorized: false },
  });
  await cachedClient.connect();
  return cachedClient;
}

/**
 * Runs `fn` with a direct-PG client. Throws when direct DB access is not
 * configured so callers can fall back to the API path. Never caches a
 * failure: a broken client is discarded before the next call.
 */
export async function withDirectDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  if (!directDbConfigured()) throw new Error("direct DB not configured");
  const client = await getDirectClient();
  try {
    return await fn(client);
  } catch (err) {
    // Network/socket errors poison the cached client — drop it so the next
    // call reconnects instead of retrying a dead socket forever.
    try {
      await client.end().catch(() => undefined);
    } catch {
      /* ignore */
    }
    cachedClient = null;
    throw err;
  }
}
