"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Radar } from "lucide-react";
import { useWazy } from "@/components/providers/data-provider";
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
import { detectAnomalies } from "@/lib/anomaly";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Severity } from "@/lib/anomaly";

const SEVERITY_META: Record<Severity, { label: string; badge: "warning" | "info" | "danger"; row: string; icon: string }> = {
  minor: { label: "Minor Spike", badge: "info", row: "border-l-blue-400", icon: "text-blue-400" },
  moderate: { label: "Moderate Spike", badge: "warning", row: "border-l-amber-400", icon: "text-amber-400" },
  severe: { label: "Severe Spike", badge: "danger", row: "border-l-red-400", icon: "text-red-400" },
};

export default function AnomaliesPage() {
  const { data, loading, refresh } = useWazy();
  const [threshold, setThreshold] = useState(35);
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  const anomalies = useMemo(
    () => detectAnomalies(data.transactions, { threshold: threshold / 100 }),
    [data.transactions, threshold],
  );
  const open = anomalies.filter((a) => !resolved.has(a.id));
  const counts = {
    severe: open.filter((a) => a.severity === "severe").length,
    moderate: open.filter((a) => a.severity === "moderate").length,
    minor: open.filter((a) => a.severity === "minor").length,
  };

  const resolve = (id: string) => setResolved((s) => new Set(s).add(id));
  const resolveAll = () => setResolved(new Set(open.map((a) => a.id)));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Anomaly & Bill Spike Detection</CardTitle>
              <CardDescription>
                Flags expenses exceeding their category’s 3-month moving average by more than {threshold}%
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                Threshold
                <input
                  type="range"
                  min={10}
                  max={80}
                  step={5}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="accent-blue-500"
                />
                <span className="w-8 text-right font-semibold text-blue-400">{threshold}%</span>
              </label>
              <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                Re-scan
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <SeverityStat label="Severe" value={counts.severe} tone="text-red-400" />
            <SeverityStat label="Moderate" value={counts.moderate} tone="text-amber-400" />
            <SeverityStat label="Minor" value={counts.minor} tone="text-blue-400" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Detected Spikes ({open.length})</CardTitle>
              <CardDescription>Sorted by severity, then % above average</CardDescription>
            </div>
            {open.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={resolveAll}>
                <CheckCircle2 className="h-4 w-4" />
                Resolve all
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-zinc-500">Scanning transactions…</p>
          ) : open.length === 0 ? (
            <EmptyState
              icon={<Radar className="h-10 w-10" />}
              title="No anomalies detected"
              description="No expense categories exceeded the moving-average threshold in the scanned window."
            />
          ) : (
            open.map((a) => (
              <div
                key={a.id}
                className={cn(
                  "flex flex-wrap items-start justify-between gap-3 rounded-xl border border-zinc-800 border-l-4 bg-black/40 p-4",
                  SEVERITY_META[a.severity].row,
                )}
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-100">
                    <AlertTriangle className={cn("h-4 w-4", SEVERITY_META[a.severity].icon)} />
                    {a.title}
                    <Badge variant={SEVERITY_META[a.severity].badge}>{SEVERITY_META[a.severity].label}</Badge>
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">{a.message}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-zinc-100">{formatCurrency(a.amount)}</p>
                    <p className="text-[11px] text-zinc-500">avg {formatCurrency(a.movingAverage)}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => resolve(a.id)}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Resolve
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SeverityStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-black/40 p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold", tone)}>{value}</p>
    </div>
  );
}
