import * as React from "react";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui/primitives";

interface KpiCardProps {
  title: string;
  value: string;
  subvalue?: string;
  icon: React.ReactNode;
  accent?: "white" | "blue" | "amber" | "red" | "emerald";
  loading?: boolean;
}

const ACCENTS = {
  white: { icon: "bg-zinc-800 text-zinc-100", value: "text-white" },
  blue: { icon: "bg-blue-500/10 text-blue-400", value: "text-blue-400" },
  emerald: { icon: "bg-emerald-500/10 text-emerald-400", value: "text-emerald-400" },
  amber: { icon: "bg-amber-500/10 text-amber-400", value: "text-amber-400" },
  red: { icon: "bg-red-500/10 text-red-400", value: "text-red-400" },
};

export function KpiCard({ title, value, subvalue, icon, accent = "white", loading }: KpiCardProps) {
  const a = ACCENTS[accent];
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.36)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{title}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-28" />
          ) : (
            <p className={cn("mt-1.5 truncate text-2xl font-semibold tracking-tight", a.value)}>{value}</p>
          )}
          {subvalue ? (
            loading ? (
              <Skeleton className="mt-2 h-3 w-20" />
            ) : (
              <p className="mt-1 truncate text-xs text-zinc-500">{subvalue}</p>
            )
          ) : null}
        </div>
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800", a.icon)}>
          {icon}
        </div>
      </div>
    </div>
  );
}
