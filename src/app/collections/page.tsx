"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, FileText, Search } from "lucide-react";
import { useWazy } from "@/components/providers/data-provider";
import { DocumentDetailModal } from "@/components/documents/document-detail-modal";
import {
  Badge,
  Button,
  Card,
  CardContent,
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
} from "@/components/ui";
import type { Document, DocumentStatus } from "@/lib/types";
import { customTypeName } from "@/lib/domain";
import { formatCurrency, formatDate, titleize } from "@/lib/format";
import { cn } from "@/lib/cn";

type SortField = "display_name" | "expires_at" | "renewal_fee" | "created_at";

interface Filters {
  query: string;
  collection: string;
  status: string;
  docType: string;
  from: string;
  to: string;
}

const INITIAL_FILTERS: Filters = { query: "", collection: "all", status: "all", docType: "all", from: "", to: "" };

export default function CollectionsPage() {
  const { data, loading, error } = useWazy();
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [sort, setSort] = useState<{ field: SortField; dir: "asc" | "desc" }>({
    field: "expires_at",
    dir: "asc",
  });
  const [selected, setSelected] = useState<Document | null>(null);

  const docTypes = useMemo(() => [...new Set(data.documents.map((d) => d.doc_type))].sort(), [data.documents]);

  const rows = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    const filtered = data.documents.filter((d) => {
      if (q && !`${d.display_name} ${d.doc_type} ${d.assigned_to ?? ""} ${d.notes ?? ""}`.toLowerCase().includes(q)) return false;
      if (filters.collection !== "all" && d.collection_id !== filters.collection) return false;
      if (filters.status !== "all" && d.status !== filters.status) return false;
      if (filters.docType !== "all" && d.doc_type !== filters.docType) return false;
      if (filters.from && d.expires_at && d.expires_at < filters.from) return false;
      if (filters.to && d.expires_at && d.expires_at > filters.to) return false;
      return true;
    });

    const dir = sort.dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      switch (sort.field) {
        case "display_name":
          return a.display_name.localeCompare(b.display_name) * dir;
        case "renewal_fee":
          return ((a.renewal_fee ?? 0) - (b.renewal_fee ?? 0)) * dir;
        case "created_at":
          return a.created_at.localeCompare(b.created_at) * dir;
        default:
          return (a.expires_at ?? "9999").localeCompare(b.expires_at ?? "9999") * dir;
      }
    });
  }, [data.documents, filters, sort]);

  const toggleSort = (field: SortField) =>
    setSort((s) => ({ field, dir: s.field === field && s.dir === "asc" ? "desc" : "asc" }));

  const statusVariant = (s: DocumentStatus) =>
    s === "active" ? "success" : s === "expired" ? "danger" : s === "renewed" ? "info" : "neutral";

  const daysUntil = (d: string | null) => {
    if (!d) return null;
    const ms = new Date(d).getTime() - new Date().setHours(0, 0, 0, 0);
    return Math.round(ms / 86_400_000);
  };

  if (error) {
    return (
      <Card className="border-red-500/30">
        <CardContent className="pt-5">
          <p className="text-sm font-medium text-red-400">Failed to load documents</p>
          <p className="mt-1 text-xs text-zinc-400">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="relative xl:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <Input
              className="pl-9"
              placeholder="Search documents…"
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            />
          </div>
          <Select value={filters.collection} onValueChange={(v) => setFilters((f) => ({ ...f, collection: v }))}>
            <SelectTrigger>
              <SelectValue placeholder="Collection" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All collections</SelectItem>
              {data.collections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(["active", "renewed", "expired", "archived"] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {titleize(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.docType} onValueChange={(v) => setFilters((f) => ({ ...f, docType: v }))}>
            <SelectTrigger>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {docTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {titleize(customTypeName(t, data.customDocumentTypes))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
              title="Expiry from"
            />
            <Input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
              title="Expiry to"
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-5">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-10 w-10" />}
              title="No documents match your filters"
              description="Try clearing the search box or widening the expiry range."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortHeader label="Document" field="display_name" sort={sort} onToggle={toggleSort} />
                  </TableHead>
                  <TableHead>Collection</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>
                    <SortHeader label="Expires" field="expires_at" sort={sort} onToggle={toggleSort} />
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <SortHeader label="Fee" field="renewal_fee" sort={sort} onToggle={toggleSort} />
                  </TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((doc) => {
                  const days = daysUntil(doc.expires_at);
                  const collection = data.collections.find((c) => c.id === doc.collection_id);
                  return (
                    <TableRow key={doc.id} className="cursor-pointer" onClick={() => setSelected(doc)}>
                      <TableCell>
                        <p className="font-medium text-zinc-100">{doc.display_name}</p>
                        {doc.assigned_to ? <p className="text-[11px] text-zinc-500">{doc.assigned_to}</p> : null}
                      </TableCell>
                      <TableCell>
                        {collection ? (
                          <span className="flex items-center gap-1.5">
                            <span className={cnDot(collection.is_personal)} />
                            {collection.name}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </TableCell>
                      <TableCell>{titleize(customTypeName(doc.doc_type, data.customDocumentTypes))}</TableCell>
                      <TableCell>
                        <span className="text-zinc-200">{formatDate(doc.expires_at)}</span>
                        {days !== null ? (
                          <span className="block text-[11px] text-zinc-500">
                            {days < 0 ? `${Math.abs(days)}d overdue` : `in ${days}d`}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(doc.status)}>{titleize(doc.status)}</Badge>
                      </TableCell>
                      <TableCell>{doc.renewal_fee != null ? formatCurrency(doc.renewal_fee) : "—"}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(doc);
                          }}
                        >
                          View
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

      {selected ? <DocumentDetailModal doc={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function SortHeader({
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
      <ArrowUpDown className={active ? "h-3 w-3 text-zinc-200" : "h-3 w-3 opacity-40"} />
    </button>
  );
}

function cnDot(isPersonal: boolean): string {
  return isPersonal
    ? "inline-block h-2 w-2 rounded-full bg-blue-400"
    : "inline-block h-2 w-2 rounded-full bg-zinc-400";
}
