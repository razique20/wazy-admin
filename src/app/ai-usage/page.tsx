"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, RefreshCw, RotateCcw } from "lucide-react";
import { useWazy } from "@/components/providers/data-provider";
import {
  AI_FEATURES,
  AI_QUOTA_LIMITS,
  aiFeatureLabel,
  computeAiFeatureTotals,
  computeAiUsage,
  quotaMonthKey,
  quotaMonthLabel,
  totalAiCalls,
} from "@/lib/ai-quota";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { UserTier } from "@/lib/types";

export default function AiUsagePage() {
  const { data, loading, error, refresh } = useWazy();
  const [month, setMonth] = useState<string>(() => quotaMonthKey());
  const [tiers, setTiers] = useState<Record<string, string>>({});
  const [tierSource, setTierSource] = useState<string>("unknown");
  const [authUsers, setAuthUsers] = useState<{ id: string; email: string | null }[]>([]);
  const [resetTarget, setResetTarget] = useState<{ userId: string; email: string | null } | null>(null);
  const [resetAllOpen, setResetAllOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const loadMeta = useCallback(async () => {
    try {
      const [usersRes, tiersRes] = await Promise.all([fetch("/api/admin-users"), fetch("/api/user-tiers")]);
      const usersJson = await usersRes.json().catch(() => ({}));
      const tiersJson = await tiersRes.json().catch(() => ({}));
      setAuthUsers(usersJson.users ?? []);
      setTiers(tiersJson.tiers ?? {});
      setTierSource(tiersJson.source ?? "unknown");
    } catch {
      setTierSource("error");
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  // Available months from the data, current month always included.
  const months = useMemo(() => {
    const set = new Set(data.aiQuotaUsage.map((r) => r.usage_month));
    set.add(quotaMonthKey());
    return [...set].sort().reverse();
  }, [data.aiQuotaUsage]);

  const usage = useMemo(() => computeAiUsage(data.aiQuotaUsage, month), [data.aiQuotaUsage, month]);
  const featureTotals = useMemo(() => computeAiFeatureTotals(data.aiQuotaUsage, month), [data.aiQuotaUsage, month]);
  const totalCalls = useMemo(() => totalAiCalls(data.aiQuotaUsage, month), [data.aiQuotaUsage, month]);

  const authUserIndex = useMemo(
    () => new Map(authUsers.map((u) => [u.id, u])),
    [authUsers],
  );

  const emailFor = useCallback(
    (userId: string) => authUserIndex.get(userId)?.email ?? null,
    [authUserIndex],
  );

  const resetUser = async () => {
    if (!resetTarget) return;
    setBusy(true);
    try {
      const res = await fetch("/api/ai-quota/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: resetTarget.userId, usageMonth: month }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setNotice({ kind: "error", text: json.error ?? `Reset failed (${res.status})` });
      } else {
        setNotice({ kind: "success", text: `Reset ${json.resetCount} quota counter(s) for this user in ${quotaMonthLabel(month)}.` });
        setResetTarget(null);
        void refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const resetAll = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/ai-quota/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allUsers: true, usageMonth: month }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setNotice({ kind: "error", text: json.error ?? `Bulk reset failed (${res.status})` });
      } else {
        setNotice({ kind: "success", text: `Reset ${json.resetCount} quota counter(s) across all users for ${quotaMonthLabel(month)}.` });
        setResetAllOpen(false);
        void refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <Card className="border-red-500/30">
        <CardContent className="pt-5">
          <p className="text-sm font-medium text-red-400">Failed to load AI usage data</p>
          <p className="mt-1 text-xs text-zinc-400">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const configured = tierSource === "service_role";

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">AI calls · {quotaMonthLabel(month)}</p>
            <p className="mt-1 text-2xl font-semibold text-white">{formatNumber(totalCalls)}</p>
          </CardContent>
        </Card>
        {AI_FEATURES.map((f) => {
          const ft = featureTotals.find((t) => t.feature === f);
          return (
            <Card key={f}>
              <CardContent className="pt-5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{aiFeatureLabel(f)}</p>
                <p className="mt-1 text-2xl font-semibold text-blue-400">{formatNumber(ft?.totalCalls ?? 0)}</p>
                <p className="mt-0.5 text-[11px] text-zinc-600">{ft?.users ?? 0} users this month</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {notice ? (
        <Card className={notice.kind === "success" ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}>
          <CardContent className="pt-4">
            <p className={cn("text-xs", notice.kind === "success" ? "text-emerald-300" : "text-red-300")}>{notice.text}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>AI Quota Usage</CardTitle>
              <CardDescription>
                Monthly call counters per user · limits are enforced in the app per tier (Free 3/2 · Plus 30/20 · Business 100/60)
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="h-8 rounded-lg border border-zinc-800 bg-zinc-950 px-2 text-xs text-zinc-200 focus:outline-none"
                aria-label="Usage month"
              >
                {months.map((m) => (
                  <option key={m} value={m}>
                    {quotaMonthLabel(m)}
                  </option>
                ))}
              </select>
              <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                Refresh
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setResetAllOpen(true)}
                disabled={!configured || data.aiQuotaUsage.length === 0}
                title={configured ? "Reset every counter for the selected month" : "Requires SUPABASE_SERVICE_ROLE_KEY"}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset all
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && data.aiQuotaUsage.length === 0 ? (
            <EmptyState icon={<Bot className="h-10 w-10" />} title="Loading usage…" />
          ) : usage.length === 0 ? (
            <EmptyState
              icon={<Bot className="h-10 w-10" />}
              title={`No AI usage in ${quotaMonthLabel(month)}`}
              description="Counters appear once users start using AI summaries or budget plans."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Summary calls</TableHead>
                  <TableHead className="text-right">Budget plan calls</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.map((u) => {
                  const tier = (tiers[u.userId] ?? "free") as UserTier;
                  const limits = AI_QUOTA_LIMITS[tier] ?? AI_QUOTA_LIMITS.free;
                  const summary = u.byFeature["groq_ai_summary"] ?? 0;
                  const budget = u.byFeature["groq_ai_budget_plan"] ?? 0;
                  const overLimit = summary > limits["groq_ai_summary"] || budget > limits["groq_ai_budget_plan"];
                  return (
                    <TableRow key={u.userId}>
                      <TableCell>
                        <p className="font-medium text-zinc-100">{emailFor(u.userId) ?? "Unknown user"}</p>
                        <p className="font-mono text-[11px] text-zinc-600">{u.userId.slice(0, 8)}…</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={tier === "business" ? "success" : tier === "plus" ? "info" : "neutral"}>
                          {tier === "business" ? "Business" : tier === "plus" ? "Plus" : "Free"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={summary > limits["groq_ai_summary"] ? "font-semibold text-amber-400" : "text-zinc-200"}>
                          {summary} / {limits["groq_ai_summary"]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={budget > limits["groq_ai_budget_plan"] ? "font-semibold text-amber-400" : "text-zinc-200"}>
                          {budget} / {limits["groq_ai_budget_plan"]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-white">{u.total}</TableCell>
                      <TableCell>
                        <span className="text-xs text-zinc-500">{formatDate(u.lastUsedAt)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        {overLimit ? <Badge variant="warning" className="mr-2">over limit</Badge> : null}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setResetTarget({ userId: u.userId, email: emailFor(u.userId) })}
                          disabled={!configured}
                          title={configured ? "Reset this user's counters for the selected month" : "Requires SUPABASE_SERVICE_ROLE_KEY"}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reset
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Confirm single-user reset */}
      <Dialog open={resetTarget !== null} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset AI quota?</DialogTitle>
            <DialogDescription>
              {resetTarget
                ? `Counters for ${resetTarget.email ?? resetTarget.userId.slice(0, 8)} in ${quotaMonthLabel(month)} go back to 0. The user can immediately use their full monthly quota again.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void resetUser()} disabled={busy}>
              Reset quota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm bulk reset */}
      <Dialog open={resetAllOpen} onOpenChange={setResetAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset quotas for ALL users?</DialogTitle>
            <DialogDescription>
              Every AI quota counter for {quotaMonthLabel(month)} goes back to 0. Use this at a month boundary if the
              app has not rolled the month over on its own.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setResetAllOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void resetAll()} disabled={busy}>
              Reset all users
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
