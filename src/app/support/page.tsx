"use client";

import { useMemo, useState } from "react";
import { LifeBuoy, RefreshCw, Search, Trash2 } from "lucide-react";
import { useWazy } from "@/components/providers/data-provider";
import { deleteRow, updateRow } from "@/lib/hooks";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SUPPORT_STATUSES,
  SUPPORT_TYPE_LABELS,
  computeSupportStats,
  isValidSupportStatus,
  supportStatusVariant,
  supportTypeLabel,
} from "@/lib/support";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { SupportRequest, SupportStatus } from "@/lib/types";

export default function SupportPage() {
  const { data, loading, error, refresh } = useWazy();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState<SupportRequest | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.supportRequests.filter((r) => {
      if (q && !`${r.title} ${r.description ?? ""} ${r.user_email ?? ""} ${r.user_id ?? ""}`.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (typeFilter !== "all" && r.request_type !== typeFilter) return false;
      return true;
    });
  }, [data.supportRequests, query, statusFilter, typeFilter]);

  const stats = useMemo(() => computeSupportStats(data.supportRequests), [data.supportRequests]);

  const ticketTypes = useMemo(
    () => [...new Set(data.supportRequests.map((r) => r.request_type))].sort(),
    [data.supportRequests],
  );

  if (error) {
    return (
      <Card className="border-red-500/30">
        <CardContent className="pt-5">
          <p className="text-sm font-medium text-red-400">Failed to load support requests</p>
          <p className="mt-1 text-xs text-zinc-400">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Open tickets" value={String(stats.open)} tone={stats.open > 0 ? "text-amber-400" : "text-white"} />
        <Stat label="In progress" value={String(stats.inProgress)} tone="text-blue-400" />
        <Stat label="Resolved" value={String(stats.resolved)} tone="text-emerald-400" />
        <Stat
          label="Tracking requests"
          value={String(stats.trackingRequests)}
          hint="Feature demand signal"
          tone="text-white"
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Support Requests</CardTitle>
              <CardDescription>
                Tickets from the in-app support form · status and admin notes are visible to users in “My Requests”
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-56">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <Input
                  className="pl-9"
                  placeholder="Search title, email, id…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {(ticketTypes.length > 0 ? ticketTypes : Object.keys(SUPPORT_TYPE_LABELS)).map((t) => (
                    <SelectItem key={t} value={t}>
                      {supportTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {SUPPORT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s === "open" ? "Open" : s === "in_progress" ? "In Progress" : "Resolved"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && data.supportRequests.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<LifeBuoy className="h-10 w-10" />}
              title="No support requests"
              description={query || statusFilter !== "all" || typeFilter !== "all" ? "Try clearing the filters." : "Tickets from the in-app support form will appear here."}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <p className="max-w-xs truncate font-medium text-zinc-100">{r.title}</p>
                      {r.description ? <p className="max-w-xs truncate text-[11px] text-zinc-500">{r.description}</p> : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral">{supportTypeLabel(r.request_type)}</Badge>
                    </TableCell>
                    <TableCell>
                      <p className="max-w-[180px] truncate text-zinc-200">{r.user_email ?? "Unknown"}</p>
                      {r.user_id ? <p className="truncate font-mono text-[11px] text-zinc-600">{r.user_id.slice(0, 8)}…</p> : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={supportStatusVariant(r.status)}>{statusLabel(r.status)}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(r.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setSelected(r)}>
                          Manage
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => void removeTicket(r.id)}
                          aria-label="Delete request"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selected ? (
        <ManageTicketModal
          request={selected}
          onClose={() => setSelected(null)}
          onChanged={() => void refresh()}
        />
      ) : null}
    </div>
  );

  async function removeTicket(id: string) {
    const { error: err } = await deleteRow("support_requests", id);
    if (err) window.alert(`Delete failed: ${err}`);
    else void refresh();
  }
}

function ManageTicketModal({
  request,
  onClose,
  onChanged,
}: {
  request: SupportRequest;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<SupportStatus>(
    isValidSupportStatus(request.status) ? request.status : "open",
  );
  const [notes, setNotes] = useState(request.admin_notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setErr(null);
    const { error } = await updateRow("support_requests", request.id, {
      status,
      admin_notes: notes.trim() === "" ? null : notes.trim(),
    });
    setBusy(false);
    if (error) {
      setErr(error);
      return;
    }
    onChanged();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{request.title}</DialogTitle>
          <DialogDescription>
            {supportTypeLabel(request.request_type)} · from {request.user_email ?? "unknown user"} ·{" "}
            {formatDate(request.created_at)}
          </DialogDescription>
        </DialogHeader>

        {request.description ? (
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-black/40 p-3 text-xs text-zinc-300">
            {request.description}
          </p>
        ) : null}

        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Status</p>
            <div className="flex gap-2">
              {SUPPORT_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs transition-colors",
                    status === s
                      ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
                      : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
                  )}
                >
                  {s === "open" ? "Open" : s === "in_progress" ? "In Progress" : "Resolved"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Admin notes (visible to the user)
            </p>
            <Textarea
              rows={4}
              placeholder="e.g. This has been implemented in version 1.2.0!"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {err ? <p className="text-xs text-red-400">{err}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function statusLabel(status: string): string {
  if (status === "open") return "Open";
  if (status === "in_progress") return "In Progress";
  if (status === "resolved") return "Resolved";
  return "Unknown";
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
