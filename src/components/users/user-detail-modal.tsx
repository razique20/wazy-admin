"use client";

import { useMemo, useState } from "react";
import { FolderKanban, PiggyBank } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { useWazy } from "@/components/providers/data-provider";
import type { UserSummary } from "@/lib/users";
import { formatCurrency, formatDate, titleize } from "@/lib/format";
import { customTypeName } from "@/lib/domain";
import type { DocumentStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

const STATUS_VARIANT: Record<DocumentStatus, "success" | "danger" | "info" | "neutral"> = {
  active: "success",
  expired: "danger",
  renewed: "info",
  archived: "neutral",
};

export function UserDetailModal({ user, onClose }: { user: UserSummary; onClose: () => void }) {
  const { data } = useWazy();
  const [tab, setTab] = useState("collections");

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
          </DialogDescription>
        </DialogHeader>

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
