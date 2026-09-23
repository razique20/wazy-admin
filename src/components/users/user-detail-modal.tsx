"use client";

import { useMemo, useState } from "react";
import { Ban, Eraser, FolderKanban, KeyRound, Loader2, PiggyBank, Trash2, Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge, Button, EmptyState } from "@/components/ui/primitives";
import { useWazy } from "@/components/providers/data-provider";
import type { UserSummary } from "@/lib/users";
import { formatCurrency, formatDate, titleize } from "@/lib/format";
import { customTypeName } from "@/lib/domain";
import type { DocumentStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

interface DetailAuthUser {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  emailConfirmedAt?: string | null;
  bannedUntil?: string | null;
}

const STATUS_VARIANT: Record<DocumentStatus, "success" | "danger" | "info" | "neutral"> = {
  active: "success",
  expired: "danger",
  renewed: "info",
  archived: "neutral",
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
  const [tab, setTab] = useState("collections");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    "ban" | "unban" | "delete" | "purge_data" | "reset_password" | null
  >(null);

  const isBanned = Boolean(authUser?.bannedUntil && new Date(authUser.bannedUntil).getTime() > Date.now());

  const runUserAction = async (action: "ban" | "unban" | "delete" | "purge_data" | "reset_password") => {
    setConfirmAction(null);
    setActionBusy(action);
    setActionError(null);
    try {
      const res = await fetch("/api/admin-users/actions", {
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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-200">
              {initials(user.email)}
            </span>
            <span className="min-w-0 truncate">{user.email ?? shortId(user.ownerId)}</span>
          </DialogTitle>
          <DialogDescription>
            Owner {shortId(user.ownerId)} · last activity {formatDate(user.lastActivity)}
            {authUser?.createdAt ? ` · signed up ${formatDate(authUser.createdAt)}` : ""}
            {authUser && !authUser.emailConfirmedAt ? " · email not confirmed" : ""}
          </DialogDescription>
        </DialogHeader>

        {user.orphaned ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-xs text-amber-300">
              Orphaned user: data rows exist but no auth.users account was found (likely a previous delete that didn&apos;t
              cascade). “Delete leftover data” removes those rows so this entry disappears.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="danger" size="sm" onClick={() => setConfirmAction("purge_data")} disabled={actionBusy !== null}>
                {actionBusy === "purge_data" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eraser className="h-3.5 w-3.5" />}
                Delete leftover data
              </Button>
              {authUser ? null : (
                <Button variant="secondary" size="sm" onClick={() => setConfirmAction("delete")} disabled={actionBusy !== null}>
                  {actionBusy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Try full delete again
                </Button>
              )}
            </div>
          </div>
        ) : null}

        {authUser ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-black/40 p-3">
            <span className="mr-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Account actions</span>
            {isBanned ? (
              <Button variant="secondary" size="sm" onClick={() => setConfirmAction("unban")} disabled={actionBusy !== null}>
                {actionBusy === "unban" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                Unban
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setConfirmAction("ban")} disabled={actionBusy !== null}>
                {actionBusy === "ban" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                Ban user
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setConfirmAction("reset_password")} disabled={actionBusy !== null}>
              {actionBusy === "reset_password" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              Reset password
            </Button>
            <Button variant="danger" size="sm" onClick={() => setConfirmAction("delete")} disabled={actionBusy !== null} className="ml-auto">
              {actionBusy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete user
            </Button>
          </div>
        ) : null}
        {actionError ? <p className="text-xs text-red-400">{actionError}</p> : null}
        {authUser && authUser.bannedUntil && isBanned ? (
          <p className="text-[11px] text-amber-400">This account is banned (until {formatDate(authUser.bannedUntil)}).</p>
        ) : null}

        {/* Delete confirmation */}
        {confirmAction === "delete" ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
            <p className="text-xs text-red-300">
              Permanently delete {authUser?.email ?? user.ownerId.slice(0, 8)} and ALL their data? This cascades to
              collections, documents, transactions and tier rows, and cannot be undone.
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmAction(null)} disabled={actionBusy !== null}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={() => void runUserAction("delete")} disabled={actionBusy !== null}>
                {actionBusy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Delete permanently
              </Button>
            </div>
          </div>
        ) : null}

        {confirmAction === "purge_data" ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
            <p className="text-xs text-red-300">
              Delete all leftover data rows for {user.ownerId.slice(0, 8)}… (documents, transactions, tiers, etc.)?
              This cannot be undone.
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmAction(null)} disabled={actionBusy !== null}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={() => void runUserAction("purge_data")} disabled={actionBusy !== null}>
                {actionBusy === "purge_data" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Delete data
              </Button>
            </div>
          </div>
        ) : null}

        {confirmAction && confirmAction !== "delete" && confirmAction !== "purge_data" ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
            <p className="text-xs text-zinc-300">
              {confirmAction === "ban"
                ? "Suspend this account? The user cannot sign in until you unban them."
                : confirmAction === "unban"
                  ? "Lift the suspension and allow sign-in again?"
                  : "Send a password recovery email to this user's address?"}
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmAction(null)} disabled={actionBusy !== null}>
                Cancel
              </Button>
              <Button
                variant={confirmAction === "unban" ? "primary" : "secondary"}
                size="sm"
                onClick={() => void runUserAction(confirmAction)}
                disabled={actionBusy !== null}
              >
                Confirm
              </Button>
            </div>
          </div>
        ) : null}

        {/* Mini KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Collections" value={String(user.collectionsCount)} />
          <MiniStat label="Documents" value={String(user.documentsCount)} />
          <MiniStat
            label="Net (all time)"
            value={formatCurrency(user.netTotal)}
            tone={user.netTotal >= 0 ? "text-emerald-400" : "text-red-400"}
          />
          <MiniStat label="Saved" value={formatCurrency(user.savedTotal)} tone="text-blue-400" />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="collections">Collections ({collections.length})</TabsTrigger>
            <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
            <TabsTrigger value="finance">Finance ({transactions.length})</TabsTrigger>
            <TabsTrigger value="envelopes">Envelopes ({envelopes.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="collections">
            {collections.length === 0 ? (
              <EmptyState title="No collections" />
            ) : (
              <ul className="space-y-2">
                {collections.map((c) => {
                  const docs = documents.filter((d) => d.collection_id === c.id);
                  return (
                    <li key={c.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-black/40 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <FolderKanban className="h-4 w-4 text-blue-400" />
                        <div>
                          <p className="text-sm font-medium text-zinc-100">{c.name}</p>
                          <p className="text-[11px] text-zinc-500">created {formatDate(c.created_at)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={c.is_personal ? "info" : "default"}>{c.is_personal ? "Personal" : "Company"}</Badge>
                        <Badge variant="neutral">{docs.length} docs</Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="documents">
            {documents.length === 0 ? (
              <EmptyState title="No documents" />
            ) : (
              <ul className="space-y-2">
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black/40 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-100">{d.display_name}</p>
                      <p className="text-[11px] text-zinc-500">
                        {titleize(customTypeName(d.doc_type, data.customDocumentTypes))} · expires {formatDate(d.expires_at)}
                      </p>
                    </div>
                    <Badge variant={statusVariant(d.status)}>{titleize(d.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="finance">
            {transactions.length === 0 ? (
              <EmptyState title="No transactions" />
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {transactions.slice(0, 50).map((t) => (
                  <li key={t.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-black/40 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-zinc-100">{t.title}</p>
                      <p className="text-[11px] text-zinc-500">
                        {formatDate(t.occurred_at)} · {titleize(t.category)}
                      </p>
                    </div>
                    <span className={cn("text-sm font-semibold", t.kind === "income" ? "text-emerald-400" : "text-red-400")}>
                      {t.kind === "income" ? "+" : "−"}
                      {formatCurrency(t.amount, t.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="envelopes">
            {envelopes.length === 0 ? (
              <EmptyState title="No savings envelopes" />
            ) : (
              <ul className="space-y-2">
                {envelopes.map((e) => {
                  const pct = Number(e.target_amount) > 0 ? Math.min(Number(e.saved_amount) / Number(e.target_amount), 1) : 0;
                  return (
                    <li key={e.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-black/40 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <PiggyBank className="h-4 w-4 text-blue-400" />
                        <div>
                          <p className="text-sm font-medium text-zinc-100">{e.name}</p>
                          <p className="text-[11px] text-zinc-500">
                            {formatCurrency(e.saved_amount)} of {formatCurrency(e.target_amount)}
                          </p>
                        </div>
                      </div>
                      <Badge variant="info">{Math.round(pct * 100)}%</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function MiniStat({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={cn("mt-1 truncate text-lg font-semibold", tone)}>{value}</p>
    </div>
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
