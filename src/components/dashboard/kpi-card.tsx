import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui/primitives";

interface KpiCardProps {
  title: string;
  value: string;
  subvalue?: string;
  icon: React.ReactNode;
  accent?: "white" | "blue" | "amber" | "red" | "emerald";
  loading?: boolean;
  href?: string;
  className?: string;
}

const ACCENTS = {
  white: {
    icon: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-800",
    value: "text-slate-900 dark:text-white",
  },
  blue: {
    icon: "bg-[#EFF6FC] text-[#0078D4] border-[#C7E0F4] dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30",
    value: "text-[#0078D4] dark:text-blue-400",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30",
    value: "text-emerald-700 dark:text-emerald-400",
  },
  amber: {
    icon: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30",
    value: "text-amber-800 dark:text-amber-400",
  },
  red: {
    icon: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30",
    value: "text-red-700 dark:text-red-400",
  },
};

/**
 * Value type scales with length: multi-currency splits render as
 * `AED 53,528,671 · KWD 800 · SAR 300` (much longer than the old single-code
 * figures), so a fixed text-2xl either overflowed the card or got clipped by
 * an ellipsis. Shrinking one step keeps the whole amount on the card; pair it
 * with `break-words` so nothing is ever hidden.
 */
export function statValueSizeClass(value: string | number | null | undefined): string {
  const len = (value ?? "").toString().length;
  if (len <= 12) return "text-2xl";
  if (len <= 20) return "text-xl";
  if (len <= 32) return "text-lg";
  return "text-base";
}

export function KpiCard({ title, value, subvalue, icon, accent = "white", loading, href, className }: KpiCardProps) {
  const a = ACCENTS[accent];
  const cardContent = (
    <div
      className={cn(
        "h-full flex flex-col justify-between rounded-xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.36)] transition-all",
        href && "hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md cursor-pointer",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 dark:text-zinc-400">{title}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-28" />
          ) : (
            <p
              className={cn(
                "mt-1.5 break-words font-semibold leading-tight tracking-tight",
                statValueSizeClass(value),
                a.value,
              )}
            >
              {value}
            </p>
          )}
          {subvalue ? (
            loading ? (
              <Skeleton className="mt-2 h-3 w-20" />
            ) : (
              <p className="mt-1 break-words text-xs leading-relaxed text-slate-700 dark:text-zinc-400 font-medium">{subvalue}</p>
            )
          ) : null}
        </div>
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", a.icon)}>
          {icon}
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0078D4] rounded-xl">
        {cardContent}
      </Link>
    );
  }

  return cardContent;
}
