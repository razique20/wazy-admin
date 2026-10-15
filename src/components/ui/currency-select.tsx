"use client";

import { Coins, Layers } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDisplayCurrency } from "@/components/providers/currency-provider";
import { CURRENCIES, GCC_CURRENCY_CODES, GccCurrencyCode, NATIVE_CURRENCY } from "@/lib/currency";
import { cn } from "@/lib/cn";

export function CurrencySelect({ className, showIcon = true }: { className?: string; showIcon?: boolean }) {
  const { currency, setCurrency } = useDisplayCurrency();

  // `currency` is a string that can be "native" or a GCC code. Narrow it to a
  // real GCC code before indexing CURRENCIES.
  const displayCode = getDisplayCurrencyCode(currency);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {showIcon ? <Coins className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden /> : null}
      <Select value={currency} onValueChange={setCurrency}>
        <SelectTrigger className="h-9 w-[190px]" aria-label="Display currency">
          <SelectValue placeholder="Currency" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NATIVE_CURRENCY}>
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" aria-hidden />
              Default — as recorded
            </span>
          </SelectItem>
          {GCC_CURRENCY_CODES.map((code) => (
            <SelectItem key={code} value={code}>
              {code} · {CURRENCIES[code].name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {displayCode ? (
        <span className="hidden text-[11px] text-zinc-600 lg:block">
          converted to {CURRENCIES[displayCode].name}
        </span>
      ) : null}
    </div>
  );
}

/** Returns the admin's display currency as a `GccCurrencyCode`, or null when it
 * is the "as recorded" (native) default or not a known GCC code. */
export function getDisplayCurrencyCode(currency: string): GccCurrencyCode | null {
  if (!currency) return null;
  const code = currency.trim().toUpperCase();
  if (code === NATIVE_CURRENCY) return null;
  if (Object.prototype.hasOwnProperty.call(CURRENCIES, code)) return code as GccCurrencyCode;
  return null;
}
