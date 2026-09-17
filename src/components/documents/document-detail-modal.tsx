"use client";

import { useState } from "react";
import { FileText, Paperclip, BellRing, ReceiptText, CalendarClock, Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge, Button, Input } from "@/components/ui/primitives";
import { useWazy } from "@/components/providers/data-provider";
import { updateRow } from "@/lib/hooks";
import type { Document, DocumentStatus } from "@/lib/types";
import { formatBytes, formatCurrency, formatDate, titleize } from "@/lib/format";
import { customTypeName, remindersForDocument, transactionsForDocument } from "@/lib/domain";
import { cn } from "@/lib/cn";

const STATUS_OPTIONS: DocumentStatus[] = ["active", "renewed", "expired", "archived"];

export function DocumentDetailModal({ doc, onClose }: { doc: Document; onClose: () => void }) {
  const { data, refresh } = useWazy();
  const [status, setStatus] = useState<DocumentStatus>(doc.status);
  const [fee, setFee] = useState(doc.renewal_fee != null ? String(doc.renewal_fee) : "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reminders = remindersForDocument(data.reminders, doc.id);
  const linked = transactionsForDocument(data.transactions, doc.id);
  const collection = data.collections.find((c) => c.id === doc.collection_id);
  const displayType = customTypeName(doc.doc_type, data.customDocumentTypes);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const patch: Record<string, unknown> = { status };
    if (fee.trim() !== "") patch.renewal_fee = Number(fee);
    const { error } = await updateRow("documents", doc.id, patch);
    setSaving(false);
    if (error) {
      setMessage(error);
    } else {
      setMessage("Saved");
      await refresh();
    }
  };

  const statusVariant = (s: DocumentStatus) =>
    s === "active" ? "success" : s === "expired" ? "danger" : s === "renewed" ? "info" : "neutral";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-400" />
            {doc.display_name}
          </DialogTitle>
          <DialogDescription>
            {titleize(displayType)} · {collection?.name ?? "Unassigned collection"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Summary grid */}
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Detail label="Status">
              <Badge variant={statusVariant(doc.status)}>{titleize(doc.status)}</Badge>
            </Detail>
            <Detail label="Expires">
              <span className="text-zinc-200">{formatDate(doc.expires_at)}</span>
            </Detail>
            <Detail label="Reminder lead">
              <span className="text-zinc-200">{doc.reminder_days ?? 30} days</span>
            </Detail>
            <Detail label="Renewal fee">
              <span className="text-zinc-200">{doc.renewal_fee != null ? formatCurrency(doc.renewal_fee) : "—"}</span>
            </Detail>
            <Detail label="Assigned to">
              <span className="text-zinc-200">{doc.assigned_to ?? "—"}</span>
            </Detail>
            <Detail label="Updated">
              <span className="text-zinc-200">{formatDate(doc.updated_at)}</span>
            </Detail>
          </div>

          {doc.notes ? (
            <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Notes</p>
              <p className="mt-1 text-sm text-zinc-300">{doc.notes}</p>
            </div>
          ) : null}

          {/* Attached file */}
          <section>
            <SectionTitle icon={<Paperclip className="h-3.5 w-3.5" />} text="Attached file" />
            {doc.file_name ? (
              <div className="mt-2 flex items-center justify-between rounded-xl border border-zinc-800 bg-black/40 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-200">{doc.file_name}</p>
                  <p className="text-[11px] text-zinc-500">
                    {formatBytes(doc.file_size)} · {doc.file_path ?? "no path"}
                  </p>
                </div>
                <Badge variant="neutral">{formatBytes(doc.file_size)}</Badge>
              </div>
            ) : (
              <p className="mt-2 text-sm text-zinc-600">No file attached</p>
            )}
          </section>

          {/* Reminders */}
          <section>
            <SectionTitle icon={<BellRing className="h-3.5 w-3.5" />} text={`Reminders (${reminders.length})`} />
            {reminders.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600">No reminders scheduled</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {reminders.map((r) => (
                  <li key={r.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-black/40 px-3 py-2">
                    <span className="flex items-center gap-2 text-sm text-zinc-200">
                      <CalendarClock className="h-4 w-4 text-blue-400" />
                      {formatDate(r.remind_at)} · {titleize(r.channel)}
                    </span>
                    <Badge variant={r.sent_at ? "success" : "warning"}>{r.sent_at ? "Sent" : "Pending"}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Linked transactions */}
          <section>
            <SectionTitle icon={<ReceiptText className="h-3.5 w-3.5" />} text={`Linked transactions (${linked.length})`} />
            {linked.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600">No linked finance transactions</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {linked.map((t) => (
                  <li key={t.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-black/40 px-3 py-2">
                    <span className="text-sm text-zinc-200">
                      {t.title}
                      <span className="ml-2 text-[11px] text-zinc-500">{formatDate(t.occurred_at)}</span>
                    </span>
                    <span className={cn("text-sm font-semibold", t.kind === "income" ? "text-emerald-400" : "text-red-400")}>
                      {t.kind === "income" ? "+" : "−"}
                      {formatCurrency(t.amount, t.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Quick actions */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Quick actions</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-zinc-400">Status</span>
                <select
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 focus:border-blue-500/60 focus:outline-none"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as DocumentStatus)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {titleize(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-zinc-400">Renewal fee (AED)</span>
                <Input
                  className="mt-1"
                  type="number"
                  min="0"
                  step="0.01"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  placeholder="e.g. 1250.00"
                />
              </label>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Button variant="primary" onClick={save} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save changes"}
              </Button>
              {message ? <span className="text-xs text-zinc-500">{message}</span> : null}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function SectionTitle({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
      {icon}
      {text}
    </p>
  );
}
