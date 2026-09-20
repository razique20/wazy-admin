"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardPaste,
  Crown,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TIER_DURATIONS,
  TIER_DURATION_LABELS,
  TIER_INFO,
  TIER_LABELS,
  TIER_RANK,
  TIER_VALUES,
  expiryForDuration,
  isExpired,
  parseUpgradeRequest,
  shortUserId,
  toTier,
} from "@/lib/tiers";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { TierDuration, UserTier } from "@/lib/types";

interface AuthUser {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
}

const PAGE_SIZE = 10;

const TIER_BADGE_VARIANT: Record<UserTier, "default" | "success" | "warning" | "info" | "neutral"> = {
  free: "neutral",
  plus: "info",
  business: "success",
};

export default function SubscriptionsPage() {
  const [authUsers, setAuthUsers] = useState<AuthUser[]>([]);
  const [tiers, setTiers] = useState<Record<string, UserTier>>({});
  const [expiries, setExpiries] = useState<Record<string, string>>({});
  const [source, setSource] = useState<string>("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [paste, setPaste] = useState("");
  const [page, setPage] = useState(0);

  // Per-row editing state
  const [draftTiers, setDraftTiers] = useState<Record<string, UserTier | "">>({});
  const [draftDurations, setDraftDurations] = useState<Record<string, TierDuration>>({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    userId: string;
    email: string | null;
    tier: UserTier;
    duration: TierDuration;
  } | null>(null);

  // Toast state
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const showToast = useCallback((kind: "success" | "error", text: string) => {
    setToast({ kind, text });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, tiersRes] = await Promise.all([fetch("/api/admin-users"), fetch("/api/user-tiers")]);
      const usersJson = await usersRes.json().catch(() => ({}));
      const tiersJson = await tiersRes.json().catch(() => ({}));
      const rawTiers: Record<string, string> = tiersJson.tiers ?? {};
      const resolved: Record<string, UserTier> = {};
      for (const [userId, raw] of Object.entries(rawTiers)) {
        const tier = toTier(raw);
        if (tier) resolved[userId] = tier;
      }
      setAuthUsers(usersJson.users ?? []);
      setTiers(resolved);
      setExpiries(tiersJson.expiries ?? {});
      setSource(tiersJson.source ?? "unknown");
      setNotice(tiersJson.message ?? usersJson.message ?? null);
    } catch {
      setNotice("Failed to load subscription data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = authUsers.filter((u) => (q ? `${u.email ?? ""} ${u.id}`.toLowerCase().includes(q) : true));
    return filtered
      .map((u) => ({ ...u, tier: tiers[u.id] ?? ("free" as UserTier) }))
      .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier] || (a.email ?? "zzz").localeCompare(b.email ?? "zzz"));
  }, [authUsers, tiers, query]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = useMemo(() => rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE), [rows, safePage]);
  useEffect(() => {
    setPage(0);
  }, [query]);

  const tierCounts = useMemo(() => {
    const counts: Record<UserTier, number> = { free: 0, plus: 0, business: 0 };
    for (const r of rows) counts[r.tier] += 1;
    return counts;
  }, [rows]);

  /** Quick action: parse the pasted upgrade email / subject line and jump to the user. */
  const applyPaste = () => {
    const parsed = parseUpgradeRequest(paste);
    if (!parsed) {
      showToast("error", "Could not find a user ID in that text.");
      return;
    }
    setQuery(parsed.userId);
    setDraftTiers((d) => ({ ...d, [parsed.userId]: parsed.tier ?? "plus" }));
    setPaste("");
    showToast("success", parsed.tier ? `User ${shortUserId(parsed.userId)} — ${TIER_LABELS[parsed.tier]} preselected.` : `User ${shortUserId(parsed.userId)} found — requested tier not recognized, Plus preselected.`);
  };

  const openConfirm = (userId: string, email: string | null) => {
    const tier = draftTiers[userId];
    if (!tier) return;
    setConfirmTarget({ userId, email, tier, duration: draftDurations[userId] ?? "none" });
  };

  const saveTier = async () => {
    if (!confirmTarget) return;
    const { userId, email, tier, duration } = confirmTarget;
    setConfirmTarget(null);
    setSavingId(userId);
    try {
      const res = await fetch("/api/user-tiers/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, tier, duration, note: draftNotes[userId] ?? "" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        showToast("error", json.error ?? `Failed to set tier (${res.status}).`);
        return;
      }
      setTiers((t) => ({ ...t, [userId]: tier }));
      setExpiries((e) => {
        const next = { ...e };
        if (json.expiresAt) next[userId] = json.expiresAt;
        else delete next[userId];
        return next;
      });
      setDraftTiers((d) => {
        const next = { ...d };
        delete next[userId];
        return next;
      });
      setDraftDurations((d) => {
        const next = { ...d };
        delete next[userId];
        return next;
      });
      setDraftNotes((n) => {
        const next = { ...n };
        delete next[userId];
        return next;
      });
      const until = json.expiresAt ? ` until ${formatDate(json.expiresAt)}` : "";
      showToast("success", `${email ?? shortUserId(userId)} is now ${TIER_LABELS[tier]}${until}${json.auditWritten ? "" : " (audit row skipped — user_tier_audit table missing)"}.`);
    } finally {
      setSavingId(null);
    }
  };

  const configured = source === "service_role";

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Paying users" value={String(tierCounts.plus + tierCounts.business)} tone="text-white" />
        <Stat label="Plus" value={String(tierCounts.plus)} tone="text-blue-400" />
        <Stat label="Business" value={String(tierCounts.business)} tone="text-emerald-400" />
        <Stat label="Free" value={String(tierCounts.free)} tone="text-zinc-400" />
      </div>

      {notice && !configured ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-4">
            <p className="text-xs text-amber-300">{notice}</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Quick action: paste from upgrade email */}
      <Card>
        <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-medium text-zinc-100">
              <ClipboardPaste className="h-4 w-4 text-zinc-500" />
              Paste user ID from upgrade email
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Accepts a raw user ID or the whole subject line “Wazy upgrade request — plus — user &lt;ID&gt;”.
            </p>
          </div>
          <Input
            className="w-full sm:w-96"
            placeholder="Wazy upgrade request — plus — user 3f2a…"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyPaste();
            }}
          />
          <Button variant="primary" size="md" onClick={applyPaste} disabled={!paste.trim()}>
            Find user
          </Button>
        </CardContent>
      </Card>

      {/* Users list */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Subscription Tiers</CardTitle>
              <CardDescription>
                Every auth user LEFT JOINed with user_tiers · a missing row means Free · the app re-reads the tier
                when the Profile tab reopens
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <Input
                  className="pl-9"
                  placeholder="Search email or user id…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : paged.length === 0 ? (
            <EmptyState
              icon={<Crown className="h-10 w-10" />}
              title="No users found"
              description={
                query
                  ? "Try a different search term."
                  : "No registered users yet — tiers are granted from auth.users."
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Current tier</TableHead>
                    <TableHead>New tier</TableHead>
                    <TableHead>Note (optional)</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((u) => {
                    const draft = draftTiers[u.id] ?? "";
                    const draftDuration = draftDurations[u.id] ?? "none";
                    const dirty = draft !== "" && draft !== u.tier;
                    const liveExpiry =
                      expiries[u.id] && !isExpired(expiries[u.id]) ? expiries[u.id] : null;
                    const previewExpiry =
                      draft && dirty && draftDuration !== "none" ? expiryForDuration(draftDuration) : null;
                    return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-semibold text-zinc-200">
                              {initials(u.email)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-zinc-100">{u.email ?? "Unknown user"}</p>
                              <p className="truncate font-mono text-[11px] text-zinc-500">{u.id}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <TierBadge tier={u.tier} />
                          {liveExpiry ? (
                            <p className="mt-1 text-[11px] text-zinc-500">until {formatDate(liveExpiry)}</p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={draft || undefined}
                            onValueChange={(v) => setDraftTiers((d) => ({ ...d, [u.id]: v as UserTier }))}
                          >
                            <SelectTrigger className="h-8 w-36">
                              <SelectValue placeholder="Select tier…" />
                            </SelectTrigger>
                            <SelectContent>
                              {TIER_VALUES.map((t) => (
                                <SelectItem key={t} value={t}>
                                  {TIER_LABELS[t]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={dirty ? draftDuration : undefined}
                            onValueChange={(v) => setDraftDurations((d) => ({ ...d, [u.id]: v as TierDuration }))}
                          >
                            <SelectTrigger className="mt-1 h-8 w-36" disabled={!dirty}>
                              <SelectValue placeholder="Duration…" />
                            </SelectTrigger>
                            <SelectContent>
                              {TIER_DURATIONS.map((d) => (
                                <SelectItem key={d} value={d}>
                                  {TIER_DURATION_LABELS[d]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {previewExpiry ? (
                            <p className="mt-1 text-[11px] text-zinc-500">ends {formatDate(previewExpiry)}</p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 w-56"
                            placeholder="Why is this changing?"
                            value={draftNotes[u.id] ?? ""}
                            onChange={(e) => setDraftNotes((n) => ({ ...n, [u.id]: e.target.value }))}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={!dirty || savingId === u.id || !configured}
                            onClick={() => openConfirm(u.id, u.email)}
                          >
                            {savingId === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Save
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                <span>
                  {rows.length === 0 ? 0 : safePage * PAGE_SIZE + 1}–{Math.min(rows.length, (safePage + 1) * PAGE_SIZE)} of{" "}
                  {rows.length}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                    Previous
                  </Button>
                  <span>
                    Page {safePage + 1} / {pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setPage(safePage + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Confirmation dialog */}
      <Dialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmTarget
                ? `${confirmTarget.tier === "free" ? "Set" : "Grant"} ${TIER_LABELS[confirmTarget.tier]} to user ${shortUserId(confirmTarget.userId)}?`
                : ""}
            </DialogTitle>
            <DialogDescription>
              {confirmTarget
                ? `${confirmTarget.email ?? "This user"} will move from ${TIER_LABELS[tiers[confirmTarget.userId] ?? "free"]} to ${TIER_LABELS[confirmTarget.tier]}${confirmTarget.duration === "none" ? " with no end date" : ` for ${TIER_DURATION_LABELS[confirmTarget.duration].toLowerCase()}`}. Entitlements apply in the app the next time the Profile tab opens.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {confirmTarget ? (
            <>
              {confirmTarget.duration !== "none" ? (
                <p className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                  <CalendarClock className="h-4 w-4 shrink-0" />
                  Plan ends on {formatDate(expiryForDuration(confirmTarget.duration) ?? "")} — the user falls
                  back to Free automatically after that.
                </p>
              ) : null}
              <ul className="space-y-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-400">
                {TIER_INFO[confirmTarget.tier].unlocks.map((unlock) => (
                  <li key={unlock} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-500" />
                    {unlock}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void saveTier()}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toast */}
      {toast ? (
        <div className="fixed bottom-4 left-4 right-4 z-50 lg:left-auto lg:right-6 lg:w-96">
          <div
            className={cn(
              "flex items-start gap-3 rounded-xl border p-4 shadow-2xl shadow-black/60",
              toast.kind === "success" ? "border-emerald-500/40 bg-zinc-950" : "border-red-500/40 bg-zinc-950",
            )}
          >
            {toast.kind === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            )}
            <p className="text-xs text-zinc-200">{toast.text}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TierBadge({ tier }: { tier: UserTier }) {
  return (
    <span
      title={TIER_INFO[tier].summary}
      className="inline-flex"
    >
      <Badge variant={TIER_BADGE_VARIANT[tier]}>{TIER_LABELS[tier]}</Badge>
    </span>
  );
}

function Stat({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold", tone)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function initials(email: string | null): string {
  if (!email) return "U";
  const parts = email.split(/[@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "U") + (parts[1]?.[0] ?? "")).toUpperCase();
}
