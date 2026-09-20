"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Wallet,
  AlertTriangle,
  CreditCard,
  Settings2,
  Menu,
  X,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/primitives";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/users", label: "Users", icon: Users },
  { href: "/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/collections", label: "Collections & Documents", icon: FolderKanban },
  { href: "/finance", label: "Finance Ledger", icon: Wallet },
  { href: "/anomalies", label: "Anomaly Detection", icon: AlertTriangle },
  { href: "/system", label: "System & Data", icon: Settings2 },
] as const;

interface AppShellProps {
  children: React.ReactNode;
  loading?: boolean;
  onRefresh?: () => void;
  lastUpdated?: Date | null;
}

export function AppShell({ children, loading, onRefresh, lastUpdated }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const nav = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
              active
                ? "bg-zinc-900 text-white"
                : "text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-100",
            )}
          >
            <Icon className={cn("h-4 w-4 shrink-0", active ? "text-white" : "text-zinc-500")} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-black">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-950/40 lg:flex">
        <Brand />
        {nav}
        <SidebarFooter loading={loading} onRefresh={onRefresh} lastUpdated={lastUpdated} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-zinc-800 bg-zinc-950">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
            <SidebarFooter loading={loading} onRefresh={onRefresh} lastUpdated={lastUpdated} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-black/80 px-4 backdrop-blur lg:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900 hover:text-white lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-sm font-semibold text-zinc-100 lg:hidden">
                {NAV_ITEMS.find((i) => i.href === pathname)?.label ?? "Wazy Admin"}
              </h1>
              <p className="hidden text-xs text-zinc-500 lg:block">Wazy Admin · Document & Financial Intelligence</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated ? (
              <span className="hidden text-xs text-zinc-600 md:block">
                Synced {lastUpdated.toLocaleTimeString("en-GB")}
              </span>
            ) : null}
            <Button variant="secondary" size="sm" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="mx-auto w-full max-w-7xl animate-fade-up">{children}</div>
        </main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex h-14 items-center gap-2.5 border-b border-zinc-800/80 px-5">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white">
        <span className="text-sm font-bold text-black">W</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <p className="text-sm font-semibold tracking-tight text-white">Wazy</p>
        <p className="text-[11px] text-zinc-500">Admin</p>
      </div>
    </div>
  );
}

function SidebarFooter({
  loading,
  onRefresh,
  lastUpdated,
}: {
  loading?: boolean;
  onRefresh?: () => void;
  lastUpdated?: Date | null;
}) {
  return (
    <div className="border-t border-zinc-800/80 p-3">
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <p className="text-xs font-medium text-zinc-300">Supabase connected</p>
        </div>
        {lastUpdated ? (
          <p className="mt-1 text-[10px] text-zinc-600">Last sync {lastUpdated.toLocaleTimeString("en-GB")}</p>
        ) : null}
        <Button variant="outline" size="sm" className="mt-3 w-full" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Sync now
        </Button>
      </div>
    </div>
  );
}
