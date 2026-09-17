"use client";

import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { useWazy } from "@/components/providers/data-provider";
import { envelopeProgress } from "@/lib/domain";
import { formatCurrency } from "@/lib/format";

export function EnvelopeCards() {
  const { data } = useWazy();

  if (data.envelopes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Savings Envelopes</CardTitle>
          <CardDescription>Progress toward financial targets</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState title="No savings envelopes yet" description="Add rows to savings_envelopes to track goals." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Savings Envelopes</CardTitle>
        <CardDescription>Progress toward financial targets</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.envelopes.map((env) => {
          const pct = envelopeProgress(env.saved_amount, env.target_amount);
          const saved = Number(env.saved_amount ?? 0);
          const target = Number(env.target_amount ?? 0);
          const monthly = Number(env.monthly_contribution ?? 0);
          const remaining = Math.max(target - saved, 0);
          const monthsLeft = monthly > 0 ? Math.ceil(remaining / monthly) : null;
          return (
            <div key={env.id} className="rounded-xl border border-zinc-800 bg-black/40 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-100">{env.name}</p>
                <Ring percentage={Math.round(pct * 100)} />
              </div>
              <p className="mt-2 text-lg font-semibold text-white">{formatCurrency(saved, "AED")}</p>
              <p className="text-[11px] text-zinc-500">
                of {formatCurrency(target)} target · {formatCurrency(monthly)}/mo
                {monthsLeft !== null ? ` · ~${monthsLeft}mo left` : ""}
              </p>
              <Progress className="mt-3" value={pct * 100} indicatorClassName="bg-blue-500" />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** Small SVG progress ring. */
function Ring({ percentage }: { percentage: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(percentage, 100));
  return (
    <div className="relative h-11 w-11">
      <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#27272a" strokeWidth="4" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke={clamped >= 100 ? "#0cce6b" : "#0070f3"}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (clamped / 100) * c}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-zinc-200">
        {Math.round(clamped)}%
      </span>
    </div>
  );
}
