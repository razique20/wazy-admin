"use client";

import { useState } from "react";
import { Play, Power } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/primitives";
import { useWazy } from "@/components/providers/data-provider";
import { insertRow, updateRow } from "@/lib/hooks";
import { nextOccurrence, simulateTrigger } from "@/lib/domain";
import { formatCurrency, formatDate, titleize } from "@/lib/format";
import type { RecurringTransaction } from "@/lib/types";

export function RecurringList() {
  const { data, refresh } = useWazy();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const toggleActive = async (r: RecurringTransaction) => {
    setBusyId(r.id);
    const { error } = await updateRow("recurring_transactions", r.id, { is_active: !r.is_active });
    setBusyId(null);
    setMessage(error ? `Toggle failed: ${error}` : `“${r.title}” ${r.is_active ? "deactivated" : "activated"}.`);
    if (!error) await refresh();
  };

  const triggerNow = async (r: RecurringTransaction) => {
    setBusyId(r.id);
    setMessage(null);
    const payload = simulateTrigger(r) as Record<string, unknown>;
    // Recurring rows don't carry a document reference; keep it null.
    payload.document_id = null;
    const { error } = await insertRow("finance_transactions", payload);
    if (!error) {
      await updateRow("recurring_transactions", r.id, { last_logged_at: new Date().toISOString().slice(0, 10) });
    }
    setBusyId(null);
    setMessage(
      error
        ? `Trigger failed: ${error}`
        : `Logged “${r.title}” (${formatCurrency(r.amount, r.currency)}) into the ledger.`,
    );
    if (!error) await refresh();
  };

  if (data.recurring.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recurring Transactions</CardTitle>
          <CardDescription>Automated monthly / quarterly / yearly entries</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState title="No recurring transactions" description="Add rows to recurring_transactions to automate logging." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recurring Transactions</CardTitle>
        <CardDescription>Trigger simulation and active toggles · {message}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.recurring.map((r) => {
          const next = nextOccurrence(r);
          return (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black/40 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                  {r.title}
                  <Badge variant={r.is_active ? "success" : "neutral"}>{r.is_active ? "Active" : "Paused"}</Badge>
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {titleize(r.kind)} · {titleize(r.category)} · {titleize(r.frequency)} on day {r.day_of_month} · next{" "}
                  {next ? formatDate(next) : "—"}
                  {r.last_logged_at ? ` · last logged ${formatDate(r.last_logged_at)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={r.kind === "income" ? "text-sm font-semibold text-emerald-400" : "text-sm font-semibold text-red-400"}>
                  {r.kind === "income" ? "+" : "−"}
                  {formatCurrency(r.amount, r.currency)}
                </span>
                <Button variant="outline" size="sm" onClick={() => void triggerNow(r)} disabled={busyId === r.id}>
                  <Play className="h-3.5 w-3.5" />
                  Trigger
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void toggleActive(r)} disabled={busyId === r.id}>
                  <Power className="h-3.5 w-3.5" />
                  {r.is_active ? "Pause" : "Resume"}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
