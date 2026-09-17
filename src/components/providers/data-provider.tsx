"use client";

import { createContext, useContext } from "react";
import { AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { useWazyData, type WazyDataState } from "@/lib/hooks";

const DataContext = createContext<WazyDataState | null>(null);

export function useWazy(): WazyDataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useWazy must be used within <WazyDataProvider>");
  return ctx;
}

export function WazyDataProvider({ children }: { children: React.ReactNode }) {
  const state = useWazyData();
  const tableErrorList = Object.entries(state.tableErrors ?? {});

  return (
    <DataContext.Provider value={state}>
      {tableErrorList.length > 0 ? (
        <div className="fixed bottom-4 left-4 right-4 z-50 lg:left-72 lg:right-auto lg:w-[420px]">
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-zinc-950 p-4 shadow-2xl shadow-black/60">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="min-w-0 text-xs">
              <p className="font-semibold text-amber-300">
                {tableErrorList.length} table{tableErrorList.length > 1 ? "s" : ""} could not be read
              </p>
              <p className="mt-1 truncate text-zinc-400">
                {tableErrorList.map(([t, e]) => `${t}: ${e}`).join(" · ")}
              </p>
              <p className="mt-1 text-zinc-500">
                Add <code className="rounded bg-zinc-900 px-1 font-mono">SUPABASE_SERVICE_ROLE_KEY</code> to .env.local
                and restart so the server can bypass RLS.
              </p>
            </div>
          </div>
        </div>
      ) : null}
      <AppShell loading={state.loading} onRefresh={() => void state.refresh()} lastUpdated={state.lastUpdated}>
        {children}
      </AppShell>
    </DataContext.Provider>
  );
}
