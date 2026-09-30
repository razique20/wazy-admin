"use client";

import { useEffect, useMemo, useState } from "react";
import { Eraser, Loader2, RefreshCw, Search, Users as UsersIcon } from "lucide-react";
import { useWazy } from "@/components/providers/data-provider";
import { UserDetailModal } from "@/components/users/user-detail-modal";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/primitives";
import { computeUserSummaries, type DeletedUserRecord, type AccountStatus, type UserSummary } from "@/lib/users";
import { formatCurrency, formatDate } from "@/lib/format";
import { SUPABASE_URL, supabaseProjectRef } from "@/lib/supabase";
import { cn } from "@/lib/cn";

interface AuthUser {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  emailConfirmedAt?: string | null;
  bannedUntil?: string | null;
}

/** Label + badge tone for each account status shown beside the email. */
const ACCOUNT_STATUS_META: Record<
  AccountStatus,
  { label: string; variant: "success" | "danger" | "warning" | "neutral"; title: string }
> = {
  active: { label: "active", variant: "success", title: "Auth account exists and the email is confirmed." },
  banned: { label: "banned", variant: "danger", title: "Auth account is suspended — sign-in blocked until the ban lifts." },
  unconfirmed: {
    label: "unconfirmed",
    variant: "warning",
    title: "Auth account exists but the email is not confirmed yet.",
  },
  orphaned: {
    label: "deleted",
    variant: "neutral",
    title:
      "Auth account no longer exists (deleted) but data rows remain — leftover data, not a cache. Use “Purge data” on this row to remove it.",
  },
  unknown: {
    label: "status?",
    variant: "neutral",
    title:
      "auth.users could not be read on this deployment (SUPABASE_SERVICE_ROLE_KEY missing or the API errored), so the account state cannot be verified.",
  },
};

type SortField = "email" | "documentsCount" | "netTotal" | "lastActivity" | "expensesThisMonth";

export default function UsersPage() {
  const { data, loading, error, refresh } = useWazy();
  const [authUsers, setAuthUsers] = useState<AuthUser[]>([]);
  const [authSource, setAuthSource] = useState<string>("loading");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ field: SortField; dir: "asc" | "desc" }>({
    field: "lastActivity",
    dir: "desc",
  });
  const [selected, setSelected] = useState<UserSummary | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  /** ownerId currently armed for inline purge (two-step: arm → confirm). */
  const [purgeArmId, setPurgeArmId] = useState<string | null>(null);
  const [purgeBusyId, setPurgeBusyId] = useState<string | null>(null);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  /** user.delete audit entries — used to expose stale auth reads (replica lag). */
  const [deletedUsers, setDeletedUsers] = useState<DeletedUserRecord[]>([]);

  const loadAuthUsers = async () => {
    try {
      const res = await fetch("/api/admin-users", { cache: "no-store" });
      const json = await res.json();
      setAuthUsers(json.users ?? []);
      setAuthSource(json.source ?? "unknown");
      setAuthMessage(json.message ?? null);
    } catch {
      setAuthSource("error");
    }
    // Reconcile against the audit log: GoTrue listUsers can serve a stale row
    // for a user that was just deleted (replica lag) — flag those as deleted.
    try {
      const res = await fetch("/api/admin-audit?limit=200", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      const rows = (json.rows ?? []) as {
        action: string;
        performed_at: string;
        details: Record<string, unknown>;
      }[];
      setDeletedUsers(
        rows
          .filter((r) => r.action === "user.delete" && typeof r.details?.deletedUserId === "string")
          .map((r) => ({
            deletedUserId: r.details.deletedUserId as string,
            performedAt: String(r.performed_at ?? ""),
          })),
      );
    } catch {
      /* audit log unavailable — stale-read detection just stays off */
    }
  };

  useEffect(() => {
    void loadAuthUsers();
  }, []);

  const users = useMemo(
    () => computeUserSummaries(data, authUsers, new Date(), authSource === "service_role", deletedUsers),
    [data, authUsers, authSource, deletedUsers],
  );
  const orphanedCount = useMemo(() => users.filter((u) => u.orphaned).length, [users]);
  // Stale auth reads (replica lag / incidents) can list deleted users —
  // the headline stat must reflect LIVE accounts only.
  const liveCount = useMemo(() => users.filter((u) => !u.orphaned).length, [users]);
  const authUnavailable = authSource !== "service_role";

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = users.filter((u) =>
      q ? `${u.email ?? ""} ${u.ownerId}`.toLowerCase().includes(q) : true,
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      switch (sort.field) {
        case "email":
          return (a.email ?? "zzz").localeCompare(b.email ?? "zzz") * dir;
        case "documentsCount":
          return (a.documentsCount - b.documentsCount) * dir;
        case "netTotal":
          return (a.netTotal - b.netTotal) * dir;
        case "expensesThisMonth":
          return (a.expensesThisMonth - b.expensesThisMonth) * dir;
        default:
          return (a.lastActivity ?? "").localeCompare(b.lastActivity ?? "") * dir;
      }
    });
  }, [users, query, sort]);

  const totals = useMemo(
    () => ({
      users: liveCount,
      documents: users.reduce((s, u) => s + u.documentsCount, 0),
      net: users.reduce((s, u) => s + u.netTotal, 0),
      urgent: users.reduce((s, u) => s + u.urgentExpiries + u.expiredDocuments, 0),
    }),
    [users, liveCount],
  );

  const toggleSort = (field: SortField) =>
    setSort((s) => ({ field, dir: s.field === field && s.dir === "asc" ? "desc" : "asc" }));

  /** One-click purge: first click arms the row, second click (within the armed state) fires it. */
  const runInlinePurge = async (u: UserSummary) => {
    if (purgeArmId !== u.ownerId) {
      setPurgeArmId(u.ownerId);
      setPurgeError(null);
      return;
    }
    setPurgeArmId(null);
    setPurgeBusyId(u.ownerId);
    setPurgeError(null);
    try {
      const res = await fetch("/api/admin-users/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.ownerId, action: "purge_data" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setPurgeError(json.error ?? `Purge failed (${res.status})`);
        return;
      }
      setActionNotice(
        `Purged leftover data for ${u.email ?? u.ownerId.slice(0, 8)} — the list refreshes automatically.`,
      );
      await Promise.all([refresh(), loadAuthUsers()]);
    } finally {
      setPurgeBusyId(null);
    }
  };

  if (error) {
    return (
      <Card className="border-red-500/30">
        <CardContent className="pt-5">
          <p className="text-sm font-medium text-red-400">Failed to load users</p>
          <p className="mt-1 text-xs text-zinc-400">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Registered users" value={String(totals.users)} hint={authSource === "service_role" ? "from auth.users" : "from data owners"} />
        <Stat label="Documents held" value={String(totals.documents)} tone="text-white" />
        <Stat label="Net cash flow (all users)" value={formatCurrency(totals.net)} tone={totals.net >= 0 ? "text-emerald-400" : "text-red-400"} />
        <Stat label="Urgent / expired docs" value={String(totals.urgent)} tone={totals.urgent > 0 ? "text-amber-400" : "text-white"} />
      </div>

      {actionNotice ? (
        <p className="text-xs text-emerald-400">{actionNotice}</p>
      ) : null}

      {purgeError ? <p className="text-xs text-red-400">{purgeError}</p> : null}

      {orphanedCount > 0 ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-4">
            <p className="text-xs text-amber-300">
              {orphanedCount} deleted user{orphanedCount > 1 ? "s" : ""} still {orphanedCount > 1 ? "have" : "has"} leftover
              data (marked “deleted” below) — this is leftover data, not a cache. Click “Purge data” on the row twice to
              remove it.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {authUnavailable && authSource !== "loading" ? (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="pt-4">
            <p className="text-xs text-red-300">
              auth.users is not available on this deployment
              {authMessage ? `: ${authMessage}` : "."} Account statuses below are unverified (shown as “status?”) and
              deleted-account detection is disabled. This is the usual reason a deleted user keeps appearing in
              production but not locally: set SUPABASE_SERVICE_ROLE_KEY in the production environment and restart. Active
              Supabase project: {supabaseProjectRef(SUPABASE_URL) ?? "custom URL"}.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {authMessage && authSource === "unconfigured" ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-4">
            <p className="text-xs text-amber-300">{authMessage}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Users Directory</CardTitle>
              <CardDescription>
                Every platform user with their collections, documents and financial footprint · click a row to drill down
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <Input
                  className="pl-9"
                  placeholder="Search email or owner id…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void refresh();
                  void loadAuthUsers();
                }}
                disabled={loading}
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && users.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<UsersIcon className="h-10 w-10" />}
              title="No users found"
              description={
                query
                  ? "Try a different search term."
                  : "No owners are present in the connected Supabase project yet."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Sort label="User" field="email" sort={sort} onToggle={toggleSort} />
                  </TableHead>
                  <TableHead>Collections</TableHead>
                  <TableHead>
                    <Sort label="Documents" field="documentsCount" sort={sort} onToggle={toggleSort} />
                  </TableHead>
                  <TableHead>Expiry risk</TableHead>
                  <TableHead className="text-right">
                    <Sort label="MTD Expenses" field="expensesThisMonth" sort={sort} onToggle={toggleSort} />
                  </TableHead>
                  <TableHead className="text-right">
                    <Sort label="Net (all time)" field="netTotal" sort={sort} onToggle={toggleSort} />
                  </TableHead>
                  <TableHead>
                    <Sort label="Last activity" field="lastActivity" sort={sort} onToggle={toggleSort} />
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((u) => (
                  <TableRow key={u.ownerId} className="cursor-pointer" onClick={() => setSelected(u)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-semibold text-zinc-200">
                          {initials(u.email)}
                        </span>
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 truncate font-medium text-zinc-100">
                            <span className="truncate">{u.email ?? "Unknown user"}</span>
                            <Badge
                              variant={ACCOUNT_STATUS_META[u.accountStatus].variant}
                              title={ACCOUNT_STATUS_META[u.accountStatus].title}
                              className="shrink-0"
                            >
                              {ACCOUNT_STATUS_META[u.accountStatus].label}
                            </Badge>
                            {u.orphaned ? (
                              <Badge variant="danger" className="shrink-0" title="Data rows remain but no auth.users account exists (ghost user)">
                                orphaned
                              </Badge>
                            ) : null}
                          </p>
                          <p className="truncate font-mono text-[11px] text-zinc-500">{u.ownerId.slice(0, 8)}…</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-200">{u.collectionsCount}</span>
                        <span className="text-[11px] text-zinc-500">
                          ({u.personalCollections}P / {u.companyCollections}C)
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-zinc-200">{u.documentsCount}</span>
                      {u.urgentExpiries + u.expiredDocuments > 0 ? (
                        <Badge variant="warning" className="ml-2">
                          {u.urgentExpiries + u.expiredDocuments} at risk
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {u.expiredDocuments > 0 ? (
                        <Badge variant="danger">{u.expiredDocuments} expired</Badge>
                      ) : u.urgentExpiries > 0 ? (
                        <Badge variant="warning">{u.urgentExpiries} ≤30d</Badge>
                      ) : (
                        <span className="text-xs text-emerald-400">Healthy</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(u.expensesThisMonth)}</TableCell>
                    <TableCell className="text-right">
                      <span className={u.netTotal >= 0 ? "font-semibold text-emerald-400" : "font-semibold text-red-400"}>
                        {formatCurrency(u.netTotal)}
                      </span>
                    </TableCell>
                    <TableCell>{formatDate(u.lastActivity)}</TableCell>
                    <TableCell className="text-right">
                      {u.orphaned ? (
                        purgeBusyId === u.ownerId ? (
                          <Button variant="danger" size="sm" disabled>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Purging…
                          </Button>
                        ) : (
                          <Button
                            variant={purgeArmId === u.ownerId ? "primary" : "danger"}
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation(); // don't open the detail modal
                              void runInlinePurge(u);
                            }}
                            title={
                              purgeArmId === u.ownerId
                                ? "Click again to permanently delete all leftover rows for this user"
                                : "Delete this user's leftover data rows (two clicks: arm, then confirm)"
                            }
                          >
                            <Eraser className="h-3.5 w-3.5" />
                            {purgeArmId === u.ownerId ? "Confirm purge" : "Purge data"}
                          </Button>
                        )
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selected ? (
        <UserDetailModal
          user={selected}
          onClose={() => setSelected(null)}
          authUser={authUsers.find((u) => u.id === selected.ownerId) ?? null}
          onUserChanged={() => {
            void loadAuthUsers();
            void refresh();
            setSelected(null);
            setActionNotice(
              `Account action applied to ${selected.email ?? selected.ownerId.slice(0, 8)} — the list refreshes automatically.`,
            );
          }}
        />
      ) : null}
    </div>
  );
}

function Stat({ label, value, hint, tone = "text-white" }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold", tone)}>{value}</p>
        {hint ? <p className="mt-0.5 text-[11px] text-zinc-600">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function Sort({
  label,
  field,
  sort,
  onToggle,
}: {
  label: string;
  field: SortField;
  sort: { field: SortField; dir: "asc" | "desc" };
  onToggle: (f: SortField) => void;
}) {
  const active = sort.field === field;
  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-1 uppercase tracking-wider",
        active ? "text-zinc-200" : "hover:text-zinc-300",
      )}
      onClick={() => onToggle(field)}
    >
      {label}
      <span className={active ? "" : "opacity-40"}>⇅</span>
    </button>
  );
}

function initials(email: string | null): string {
  if (!email) return "U";
  const parts = email.split(/[@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "U") + (parts[1]?.[0] ?? "")).toUpperCase();
}
