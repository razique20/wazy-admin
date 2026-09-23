"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Users as UsersIcon } from "lucide-react";
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
import { computeUserSummaries, type UserSummary } from "@/lib/users";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

interface AuthUser {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  emailConfirmedAt?: string | null;
  bannedUntil?: string | null;
}

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

  const loadAuthUsers = async () => {
    try {
      const res = await fetch("/api/admin-users");
      const json = await res.json();
      setAuthUsers(json.users ?? []);
      setAuthSource(json.source ?? "unknown");
      setAuthMessage(json.message ?? null);
    } catch {
      setAuthSource("error");
    }
  };

  useEffect(() => {
    void loadAuthUsers();
  }, []);

  const users = useMemo(() => computeUserSummaries(data, authUsers), [data, authUsers]);

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
      users: users.length,
      documents: users.reduce((s, u) => s + u.documentsCount, 0),
      net: users.reduce((s, u) => s + u.netTotal, 0),
      urgent: users.reduce((s, u) => s + u.urgentExpiries + u.expiredDocuments, 0),
    }),
    [users],
  );

  const toggleSort = (field: SortField) =>
    setSort((s) => ({ field, dir: s.field === field && s.dir === "asc" ? "desc" : "asc" }));

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
                          <p className="truncate font-medium text-zinc-100">{u.email ?? "Unknown user"}</p>
                          <p className="truncate font-mono text-[11px] text-zinc-500">{u.ownerId.slice(0, 8)}…</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-zinc-200">{u.collectionsCount}</span>
                      <span className="ml-1.5 text-[11px] text-zinc-500">
                        ({u.personalCollections}P / {u.companyCollections}C)
                      </span>
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
