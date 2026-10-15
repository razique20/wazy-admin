"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DISPLAY_CURRENCY_OPTIONS, isNative, NATIVE_CURRENCY } from "@/lib/currency";

/**
 * Admin-wide display currency.
 *
 * The mobile app stores money in each collection's GCC currency (AED, SAR,
 * KWD, QAR, BHD, OMR). This context decides which currency every aggregated
 * money figure in the console is *displayed* in — values are converted with
 * the pegged rates in `@/lib/currency` before they are summed, charted or
 * formatted. Default is AED (the platform base currency); the admin can switch
 * to any other GCC currency from the header picker, and the choice persists
 * across sessions in localStorage.
 */
export interface DisplayCurrencyState {
  /** Currently selected display currency code (AED | SAR | KWD | QAR | BHD | OMR). */
  currency: string;
  setCurrency: (code: string) => void;
}

const STORAGE_KEY = "finavig-admin:display-currency";

const DisplayCurrencyContext = createContext<DisplayCurrencyState | null>(null);

/**
 * Reads the persisted choice. The default is NATIVE_CURRENCY: every figure is
 * shown in the exact currency the GCC user recorded it in inside the mobile
 * app (AED for a UAE workspace, SAR for a Saudi one, …). Anything invalid —
 * including the pre-GCC "AED" default — resolves back to that default.
 */
function readStoredCurrency(): string {
  if (typeof window === "undefined") return NATIVE_CURRENCY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return NATIVE_CURRENCY;
    const code = raw.trim().toLowerCase();
    return DISPLAY_CURRENCY_OPTIONS.includes(code) ? code : NATIVE_CURRENCY;
  } catch {
    return NATIVE_CURRENCY;
  }
}

export function DisplayCurrencyProvider({ children }: { children: React.ReactNode }) {
  // Start on the native default so the first paint matches the settled value
  // (readStoredCurrency only runs after mount to avoid a hydration mismatch).
  const [currency, setCurrencyState] = useState<string>(NATIVE_CURRENCY);

  // Read the persisted choice after mount (avoids SSR/hydration mismatch).
  useEffect(() => {
    setCurrencyState(readStoredCurrency());
  }, []);

  const setCurrency = useCallback((code: string) => {
    const next = isNative(code) ? NATIVE_CURRENCY : code.toUpperCase();
    setCurrencyState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode — selection just won't persist */
    }
  }, []);

  const value = useMemo<DisplayCurrencyState>(() => ({ currency, setCurrency }), [currency, setCurrency]);

  return <DisplayCurrencyContext.Provider value={value}>{children}</DisplayCurrencyContext.Provider>;
}

/** Returns the admin's chosen display currency (defaults to "as recorded"). */
export function useDisplayCurrency(): DisplayCurrencyState {
  const ctx = useContext(DisplayCurrencyContext);
  if (!ctx) {
    // Outside the provider (e.g. an isolated test render) — behave like the
    // console default: as recorded.
    return { currency: NATIVE_CURRENCY, setCurrency: () => undefined };
  }
  return ctx;
}
