/**
 * Prints FK delete rules (from scripts/verify-cascades.sql part 1) and
 * orphan-row counts (part 2) to verify the cascade alignment.
 *
 * Usage: npx tsx scripts/verify-cascades.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

async function main(): Promise<void> {
  const envPath = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }

  const dbUrl = process.env.SUPABASE_DB_URL;
  let connectionString: string;
  if (dbUrl) {
    connectionString = dbUrl;
  } else {
    const password = process.env.SUPABASE_DB_PASSWORD;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!password || !supabaseUrl) {
      console.error("Missing SUPABASE_DB_URL or SUPABASE_DB_PASSWORD in .env.local");
      process.exit(1);
    }
    const ref = new URL(supabaseUrl).hostname.split(".")[0];
    connectionString = `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const sql = readFileSync(resolve(process.cwd(), "scripts/verify-cascades.sql"), "utf8");
    const stripComments = (s: string) => {
      const lines = s.split("\n").filter((l) => !l.trim().startsWith("--"));
      // Drop any split-fragment before the first statement.
      const firstStmt = lines.findIndex((l) => l.trim().toLowerCase().startsWith("select"));
      return lines.slice(firstStmt >= 0 ? firstStmt : 0).join("\n").trim();
    };
    const [fkPart, orphanPart] = sql.split("-- Orphan check");

    const fk = await client.query(stripComments(fkPart));
    console.log("=== FK delete rules (auth.users references) ===");
    console.table(
      fk.rows.map((r) => ({
        table: r.table_name,
        column: r.column_name,
        constraint: r.conname,
        delete_rule: { c: "CASCADE", n: "SET NULL", a: "NO ACTION", r: "RESTRICT" }[r.delete_rule as string] ?? r.delete_rule,
      })),
    );

    const orphans = await client.query(stripComments(orphanPart));
    console.log("=== Orphan rows (owner missing from auth.users) ===");
    console.table(orphans.rows);

    const bad = orphans.rows.filter((r) => Number(r.orphans) > 0);
    console.log(bad.length === 0 ? "✅ CLEAN: every data row has a live auth.users owner." : `⚠️ ${bad.length} table(s) still have orphans.`);
    const nonCascade = fk.rows.filter((r) => r.delete_rule !== "c" && r.delete_rule !== "n");
    console.log(
      nonCascade.length === 0
        ? "✅ All per-user FKs use CASCADE (or deliberate SET NULL)."
        : `⚠️ Non-cascading FKs: ${nonCascade.map((r) => r.table_name).join(", ")}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
