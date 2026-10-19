"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  Ban,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eraser,
  FileText,
  FolderKanban,
  KeyRound,
  Loader2,
  PiggyBank,
  ShieldAlert,
  Trash2,
  TrendingDown,
  TrendingUp,
  Undo2,
  Wallet,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge, Button, EmptyState, Input } from "@/components/ui/primitives";
import { useWazy } from "@/components/providers/data-provider";
import { useDisplayCurrency } from "@/components/providers/currency-provider";
import type { UserSummary, AccountStatus } from "@/lib/users";
import { collectionCurrencyResolver } from "@/lib/gcc";
import { convertCurrency } from "@/lib/currency";
import { formatCurrency, formatDate, titleize, toNumber } from "@/lib/format";
import { customTypeName } from "@/lib/domain";
import type { DocumentStatus } from "@/lib/types";
import { cn } from "@/lib/cn";
import { authenticatedFetch } from "@/lib/auth-client";

interface DetailAuthUser {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  emailConfirmedAt?: string | null;
  bannedUntil?: string | null;
}

/** Text the admin must type verbatim (case-insensitive) to arm the delete buttons. */
const CONFIRM_TOKEN = "DELETE";

const STATUS_VARIANT: Record<DocumentStatus, "success" | "danger" | "info" | "neutral"> = {
  active: "success",
  expired: "danger",
  renewed: "info",
  archived: "neutral",
};

/** Badge copy and dot indicators for account status */
const ACCOUNT_STATUS_META: Record<
  AccountStatus,
  { label: string; variant: "success" | "danger" | "warning" | "neutral"; dotColor: string }
> = {
  active: { label: "Active", variant: "success", dotColor: "bg-emerald-500" },
  banned: { label: "Banned", variant: "danger", dotColor: "bg-red-500" },
  unconfirmed: { label: "Unconfirmed", variant: "warning", dotColor: "bg-amber-500" },
  orphaned: { label: "Deleted Auth", variant: "neutral", dotColor: "bg-zinc-400" },
  unknown: { label: "Unknown", variant: "neutral", dotColor: "bg-zinc-400" },
};

export function UserDetailModal({
  user,
  onClose,
  authUser,
  onUserChanged,
}: {
  user: UserSummary;
  onClose: () => void;
  authUser?: DetailAuthUser | null;
  onUserChanged?: () => void;
}) {
  const { data } = useWazy();
  const { currency: displayCurrency } = useDisplayCurrency();
  const currencyForCollection = useMemo(
    () => collectionCurrencyResolver(data.collections),
    [data.collections],
  );

  const [tab, setTab] = useState("collections");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    "ban" | "unban" | "delete" | "purge_data" | "reset_password" | null
  >(null);
  const [confirmText, setConfirmText] = useState("");
  const [copiedId, setCopiedId] = useState(false);

  const copyOwnerId = () => {
    navigator.clipboard.writeText(user.ownerId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  /** Opens a confirmation and always starts with an empty typed token. */
  const askConfirm = (action: typeof confirmAction) => {
    setConfirmText("");
    setConfirmAction(action);
  };

  const isBanned = Boolean(
    authUser?.bannedUntil && new Date(authUser.bannedUntil).getTime() > Date.now(),
  );

  /** Everything this user owns, counted from the live data bundle. */
  const purgeInventory = useMemo(() => {
    return {
      budgets: data.budgets.filter((b) => b.owner_id === user.ownerId).length,
      recurring: data.recurring.filter((r) => r.owner_id === user.ownerId).length,
      customTypes: data.customDocumentTypes.filter((t) => t.owner_id === user.ownerId).length,
      quota: data.aiQuotaUsage.filter((q) => q.user_id === user.ownerId).length,
      files: data.documents.filter((d) => d.owner_id === user.ownerId && d.file_path).length,
      transactions: data.transactions.filter((t) => t.owner_id === user.ownerId).length,
    };
  }, [data, user.ownerId]);

  const runUserAction = async (action: "ban" | "unban" | "delete" | "purge_data" | "reset_password") => {
    setConfirmAction(null);
    setConfirmText("");
    setActionBusy(action);
    setActionError(null);
    try {
      const res = await authenticatedFetch("/api/admin-users/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.ownerId, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setActionError(json.error ?? `Action failed (${res.status})`);
        return;
      }
      if (action === "delete" || action === "purge_data") {
        onClose();
        onUserChanged?.();
        return;
      }
      onUserChanged?.();
    } finally {
      setActionBusy(null);
    }
  };

  const collections = useMemo(
    () => data.collections.filter((c) => c.owner_id === user.ownerId),
    [data.collections, user.ownerId],
  );
  const documents = useMemo(
    () => data.documents.filter((d) => d.owner_id === user.ownerId),
    [data.documents, user.ownerId],
  );
  const transactions = useMemo(
    () =>
      data.transactions
        .filter((t) => t.owner_id === user.ownerId)
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
    [data.transactions, user.ownerId],
  );
  const envelopes = useMemo(
    () => data.envelopes.filter((e) => e.owner_id === user.ownerId),
    [data.envelopes, user.ownerId],
  );

  const statusVariant = (s: DocumentStatus) => STATUS_VARIANT[s] ?? "neutral";

  // Clean split-currency parser for KPI cards
  const netCurrencies = useMemo(() => {
    return Object.entries(user.netTotalByCurrency).filter(([, amt]) => amt !== 0);
  }, [user.netTotalByCurrency]);

  const savedCurrencies = useMemo(() => {
    return Object.entries(user.savedTotalByCurrency).filter(([, amt]) => amt !== 0);
  }, [user.savedTotalByCurrency]);

  const statusMeta = ACCOUNT_STATUS_META[user.accountStatus] ?? ACCOUNT_STATUS_META.unknown;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl sm:max-w-3xl">
        {/* Header & User Profile Overview */}
        <DialogHeader className="space-y-3 pb-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0078D4]/20 via-[#0078D4]/10 to-transparent text-[#0078D4] dark:text-blue-400 font-bold text-base border border-[#0078D4]/25 shadow-xs">
                {initials(user.email)}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
                    {user.email ?? shortId(user.ownerId)}
                  </DialogTitle>
                  <Badge variant={statusMeta.variant} className="inline-flex items-center gap-1.5 shrink-0 px-2 py-0.5">
                    <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dotColor)} />
                    {statusMeta.label}
                  </Badge>
                  {isBanned ? (
                    <Badge variant="danger" className="shrink-0 text-[10px]">
                      Banned
                    </Badge>
                  ) : null}
                </div>
                {/* Secondary metadata pills */}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <button
                    type="button"
                    onClick={copyOwnerId}
                    title="Copy full User UUID"
                    className="group inline-flex items-center gap-1 font-mono text-[11px] text-zinc-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                  >
                    <span>ID: {shortId(user.ownerId)}</span>
                    {copiedId ? (
                      <Check className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <Copy className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                    )}
                  </button>

                  <span className="text-zinc-300 dark:text-zinc-700">·</span>

                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3 text-zinc-400" />
                    Active {formatDate(user.lastActivity)}
                  </span>

                  {authUser?.createdAt ? (
                    <>
                      <span className="text-zinc-300 dark:text-zinc-700">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-zinc-400" />
                        Joined {formatDate(authUser.createdAt)}
                      </span>
                    </>
                  ) : null}

                  {authUser ? (
                    <>
                      <span className="text-zinc-300 dark:text-zinc-700">·</span>
                      {authUser.emailConfirmedAt ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                          <CheckCircle2 className="h-3 w-3" />
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium text-[11px]">
                          <AlertCircle className="h-3 w-3" />
                          Unverified
                        </span>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          <DialogDescription className="sr-only">
            Administrative account management and overview for {user.email ?? user.ownerId}
          </DialogDescription>
        </DialogHeader>

        {/* Orphaned Account Notice */}
        {user.orphaned ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                Orphaned Account Data
              </p>
              <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                Data rows exist in the database, but no corresponding <code className="font-mono">auth.users</code> login was found. You can clean up leftover rows so this ghost entry disappears.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button variant="danger" size="sm" onClick={() => askConfirm("purge_data")} disabled={actionBusy !== null}>
                  {actionBusy === "purge_data" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Eraser className="h-3.5 w-3.5 mr-1.5" />}
                  Delete leftover data
                </Button>
                {authUser ? null : (
                  <Button variant="secondary" size="sm" onClick={() => askConfirm("delete")} disabled={actionBusy !== null}>
                    {actionBusy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
                    Try full delete again
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* Account Quick Actions Toolbar */}
        {authUser ? (
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-zinc-200/90 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/40 p-2.5 px-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                Quick Actions
              </span>
              {isBanned ? (
                <span className="text-[11px] font-medium text-red-600 dark:text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                  Suspended until {formatDate(authUser.bannedUntil)}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => askConfirm("reset_password")}
                disabled={actionBusy !== null}
                className="h-8 text-xs font-medium"
              >
                {actionBusy === "reset_password" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <KeyRound className="h-3.5 w-3.5 mr-1.5 text-zinc-500" />
                )}
                Reset Password
              </Button>

              {isBanned ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => askConfirm("unban")}
                  disabled={actionBusy !== null}
                  className="h-8 text-xs font-medium"
                >
                  {actionBusy === "unban" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Undo2 className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Lift Suspension
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => askConfirm("ban")}
                  disabled={actionBusy !== null}
                  className="h-8 text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10"
                >
                  {actionBusy === "ban" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Ban className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Ban User
                </Button>
              )}

              <Button
                variant="danger"
                size="sm"
                onClick={() => askConfirm("delete")}
                disabled={actionBusy !== null}
                className="h-8 text-xs font-medium"
              >
                {actionBusy === "delete" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Delete User
              </Button>
            </div>
          </div>
        ) : null}

        {actionError ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{actionError}</span>
          </div>
        ) : null}

        {/* Delete / Purge Confirmation Card */}
        {confirmAction === "delete" || confirmAction === "purge_data" ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-red-700 dark:text-red-400">
                  {confirmAction === "delete"
                    ? `Permanently delete ${authUser?.email ?? shortId(user.ownerId)}?`
                    : `Delete leftover data for ${shortId(user.ownerId)}?`}
                </h4>
                <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                  This action is irreversible and will delete all application records associated with this account.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-red-500/20 bg-white/60 dark:bg-black/30 p-3 text-xs">
              <span className="font-semibold text-slate-900 dark:text-zinc-200 block mb-1">
                Affected resources:
              </span>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-zinc-600 dark:text-zinc-300">
                <li>• {user.collectionsCount} collections</li>
                <li>• {user.documentsCount} documents ({purgeInventory.files} files)</li>
                <li>• {purgeInventory.transactions} transactions</li>
                <li>• {purgeInventory.budgets} category budgets</li>
                <li>• {user.envelopesCount} savings envelopes</li>
                <li>• {purgeInventory.quota} AI quota records</li>
              </ul>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-800 dark:text-zinc-300">
                Type <span className="font-mono text-red-600 dark:text-red-400">{CONFIRM_TOKEN}</span> to confirm:
              </label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  className="h-9 text-sm"
                  placeholder={`Type ${CONFIRM_TOKEN} here`}
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  disabled={actionBusy !== null}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmAction(null)}
                  disabled={actionBusy !== null}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => void runUserAction(confirmAction)}
                  disabled={actionBusy !== null || confirmText.trim().toUpperCase() !== CONFIRM_TOKEN}
                  className="shrink-0"
                >
                  {actionBusy === confirmAction ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Confirm Delete
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Standard Action Confirmation (Ban, Unban, Reset Password) */}
        {confirmAction && confirmAction !== "delete" && confirmAction !== "purge_data" ? (
          <div className="rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4 flex items-center justify-between gap-4">
            <p className="text-xs font-medium text-slate-800 dark:text-zinc-200">
              {confirmAction === "ban"
                ? "Suspend this account? The user will be immediately blocked from signing in."
                : confirmAction === "unban"
                  ? "Lift the suspension? The user will regain normal access to the platform."
                  : "Send an official Supabase password reset link to this user's email address?"}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setConfirmAction(null)} disabled={actionBusy !== null}>
                Cancel
              </Button>
              <Button
                variant={confirmAction === "unban" ? "primary" : confirmAction === "ban" ? "danger" : "primary"}
                size="sm"
                onClick={() => void runUserAction(confirmAction)}
                disabled={actionBusy !== null}
              >
                {actionBusy === confirmAction ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Confirm
              </Button>
            </div>
          </div>
        ) : null}

        {/* Primary KPIs Cards Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Collections KPI */}
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 p-3.5 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Collections</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0078D4]/10 text-[#0078D4] dark:text-blue-400">
                <FolderKanban className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {user.collectionsCount}
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500">Vaults & folders</p>
          </div>

          {/* Documents KPI */}
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 p-3.5 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Documents</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <FileText className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {user.documentsCount}
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500">Tracked files</p>
          </div>

          {/* Net (All Time) KPI */}
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 p-3.5 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Net All-Time</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Wallet className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2">
              {netCurrencies.length === 0 ? (
                <span className="text-xl font-bold text-slate-900 dark:text-white">
                  {formatCurrency(0, displayCurrency)}
                </span>
              ) : netCurrencies.length === 1 ? (
                <span
                  className={cn(
                    "text-xl font-bold tracking-tight",
                    netCurrencies[0][1] >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400",
                  )}
                >
                  {formatCurrency(netCurrencies[0][1], netCurrencies[0][0])}
                </span>
              ) : (
                <div className="flex flex-col gap-1">
                  {netCurrencies.map(([curr, amt]) => (
                    <span
                      key={curr}
                      className={cn(
                        "text-xs font-bold leading-tight",
                        amt >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400",
                      )}
                    >
                      {formatCurrency(amt, curr)}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500">Income vs expenses</p>
          </div>

          {/* Saved Total KPI */}
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 p-3.5 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Total Saved</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <PiggyBank className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2">
              {savedCurrencies.length === 0 ? (
                <span className="text-xl font-bold text-[#0078D4] dark:text-blue-400">
                  {formatCurrency(0, displayCurrency)}
                </span>
              ) : savedCurrencies.length === 1 ? (
                <span className="text-xl font-bold tracking-tight text-[#0078D4] dark:text-blue-400">
                  {formatCurrency(savedCurrencies[0][1], savedCurrencies[0][0])}
                </span>
              ) : (
                <div className="flex flex-col gap-1">
                  {savedCurrencies.map(([curr, amt]) => (
                    <span key={curr} className="text-xs font-bold text-[#0078D4] dark:text-blue-400 leading-tight">
                      {formatCurrency(amt, curr)}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500">{user.envelopesCount} envelopes</p>
          </div>
        </div>

        {/* Detailed Data Tabs */}
        <div className="mt-1">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full justify-start border-b border-zinc-200 dark:border-zinc-800 rounded-none bg-transparent p-0 h-10 gap-2">
              <TabsTrigger
                value="collections"
                className="relative h-9 rounded-none border-b-2 border-transparent px-3 text-xs font-semibold data-[state=active]:border-[#0078D4] data-[state=active]:bg-transparent data-[state=active]:text-[#0078D4] dark:data-[state=active]:text-blue-400"
              >
                Collections
                <span className="ml-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
                  {collections.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="documents"
                className="relative h-9 rounded-none border-b-2 border-transparent px-3 text-xs font-semibold data-[state=active]:border-[#0078D4] data-[state=active]:bg-transparent data-[state=active]:text-[#0078D4] dark:data-[state=active]:text-blue-400"
              >
                Documents
                <span className="ml-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
                  {documents.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="finance"
                className="relative h-9 rounded-none border-b-2 border-transparent px-3 text-xs font-semibold data-[state=active]:border-[#0078D4] data-[state=active]:bg-transparent data-[state=active]:text-[#0078D4] dark:data-[state=active]:text-blue-400"
              >
                Finance Transactions
                <span className="ml-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
                  {transactions.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="envelopes"
                className="relative h-9 rounded-none border-b-2 border-transparent px-3 text-xs font-semibold data-[state=active]:border-[#0078D4] data-[state=active]:bg-transparent data-[state=active]:text-[#0078D4] dark:data-[state=active]:text-blue-400"
              >
                Savings Envelopes
                <span className="ml-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
                  {envelopes.length}
                </span>
              </TabsTrigger>
            </TabsList>

            {/* Collections Tab Content */}
            <TabsContent value="collections" className="pt-3">
              {collections.length === 0 ? (
                <EmptyState
                  icon={<FolderKanban className="h-8 w-8" />}
                  title="No collections found"
                  description="This user has not created any document collections or vaults yet."
                />
              ) : (
                <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {collections.map((c) => {
                    const docs = documents.filter((d) => d.collection_id === c.id);
                    return (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200/90 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 p-3 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-2xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0078D4]/10 text-[#0078D4] dark:text-blue-400">
                            <FolderKanban className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
                              {c.name}
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              Created {formatDate(c.created_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={c.is_personal ? "info" : "default"}>
                            {c.is_personal ? "Personal" : "Company"}
                          </Badge>
                          <Badge variant="neutral">
                            {docs.length} doc{docs.length === 1 ? "" : "s"}
                          </Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </TabsContent>

            {/* Documents Tab Content */}
            <TabsContent value="documents" className="pt-3">
              {documents.length === 0 ? (
                <EmptyState
                  icon={<FileText className="h-8 w-8" />}
                  title="No documents uploaded"
                  description="This user has not stored any documents or expiration reminders."
                />
              ) : (
                <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {documents.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200/90 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 p-3 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-2xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
                            {d.display_name}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            {titleize(customTypeName(d.doc_type, data.customDocumentTypes))} · Expires {formatDate(d.expires_at)}
                          </p>
                        </div>
                      </div>
                      <Badge variant={statusVariant(d.status)} className="shrink-0">
                        {titleize(d.status)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            {/* Finance Tab Content */}
            <TabsContent value="finance" className="pt-3">
              {transactions.length === 0 ? (
                <EmptyState
                  icon={<Wallet className="h-8 w-8" />}
                  title="No finance transactions"
                  description="No income or expense records found for this user."
                />
              ) : (
                <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {transactions.slice(0, 50).map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200/90 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 p-3 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-2xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                            t.kind === "income"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-red-500/10 text-red-600 dark:text-red-400",
                          )}
                        >
                          {t.kind === "income" ? (
                            <TrendingUp className="h-4 w-4" />
                          ) : (
                            <TrendingDown className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
                            {t.title}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            {formatDate(t.occurred_at)} · {titleize(t.category)}
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "text-sm font-bold shrink-0",
                          t.kind === "income"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400",
                        )}
                      >
                        {t.kind === "income" ? "+" : "−"}
                        {formatCurrency(t.amount, t.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            {/* Envelopes Tab Content */}
            <TabsContent value="envelopes" className="pt-3">
              {envelopes.length === 0 ? (
                <EmptyState
                  icon={<PiggyBank className="h-8 w-8" />}
                  title="No savings envelopes"
                  description="User has not set up any savings targets or budget envelopes."
                />
              ) : (
                <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {envelopes.map((e) => {
                    const pct =
                      Number(e.target_amount) > 0
                        ? Math.min(Number(e.saved_amount) / Number(e.target_amount), 1)
                        : 0;
                    return (
                      <li
                        key={e.id}
                        className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 p-3.5 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-2xs"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                              <PiggyBank className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
                                {e.name}
                              </p>
                              <p className="text-[11px] text-zinc-500">
                                {formatCurrency(
                                  convertCurrency(
                                    toNumber(e.saved_amount),
                                    currencyForCollection(e.collection_id),
                                    displayCurrency,
                                  ),
                                  displayCurrency,
                                )}{" "}
                                of{" "}
                                {formatCurrency(
                                  convertCurrency(
                                    toNumber(e.target_amount),
                                    currencyForCollection(e.collection_id),
                                    displayCurrency,
                                  ),
                                  displayCurrency,
                                )}
                              </p>
                            </div>
                          </div>
                          <Badge variant="info" className="shrink-0">
                            {Math.round(pct * 100)}%
                          </Badge>
                        </div>

                        {/* Progress Bar */}
                        <div className="mt-2.5 h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#0078D4] dark:bg-blue-500 transition-all duration-300"
                            style={{ width: `${Math.round(pct * 100)}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function initials(email: string | null): string {
  if (!email) return "U";
  const parts = email.split(/[@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "U") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

export type { DetailAuthUser as UserDetailAuthUser };
