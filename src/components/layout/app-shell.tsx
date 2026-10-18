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
  LifeBuoy,
  Bot,
  Settings2,
  Menu,
  X,
  RefreshCw,
  Globe2,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { FinavigLogo } from "@/components/ui/logo";
import { SUPABASE_URL, isUsingDefaultProjectUrl, supabaseProjectRef } from "@/lib/supabase";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/users", label: "Users", icon: Users },
  { href: "/admins", label: "Admins", icon: ShieldCheck },
  { href: "/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/support", label: "Support Requests", icon: LifeBuoy },
  { href: "/ai-dashboard", label: "AI Dashboard", icon: Bot },
  { href: "/collections", label: "Collections & Documents", icon: FolderKanban },
  { href: "/gcc", label: "GCC Overview", icon: Globe2 },
  { href: "/finance", label: "Finance Activity", icon: Wallet },
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

  const sidebarNav = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {NAV_ITEMS.map((item) => {
        const exact = pathname === item.href;
        const childActive = item.href !== "/" && pathname.startsWith(item.href) && pathname !== item.href;
        const active = exact || childActive;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
              exact && "bg-white text-[#0078D4] shadow-xs font-semibold dark:bg-zinc-900 dark:text-white dark:shadow-none",
              childActive && "bg-white/80 text-[#0078D4] font-semibold dark:bg-zinc-800/60 dark:text-zinc-300",
              !active && "text-slate-800 hover:bg-white/80 hover:text-slate-950 dark:text-zinc-400 dark:hover:bg-zinc-900/60 dark:hover:text-zinc-100",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0 transition-colors",
                exact && "text-[#0078D4] dark:text-white",
                childActive && "text-[#0078D4] dark:text-zinc-200",
                !exact && !childActive && "text-slate-600 group-hover:text-[#0078D4] dark:text-zinc-400 dark:group-hover:text-zinc-200",
              )}
            />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC] dark:bg-black transition-colors">
      {/* Desktop sidebar - Azure Ice Blue left column theme */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[#D6E0EC] dark:border-zinc-800/80 bg-[#EBF1F8] dark:bg-zinc-950/40 lg:flex transition-colors">
        <Brand />
        {sidebarNav}
        <SidebarFooter loading={loading} onRefresh={onRefresh} lastUpdated={lastUpdated} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40 dark:bg-black/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-[#D6E0EC] dark:border-zinc-800 bg-[#EBF1F8] dark:bg-zinc-950">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-zinc-600 hover:bg-white hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {sidebarNav}
            <div className="px-3 pb-2">
              <ThemeToggle showLabel className="w-full justify-start" />
            </div>
            <SidebarFooter loading={loading} onRefresh={onRefresh} lastUpdated={lastUpdated} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar - Azure Clean White Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 dark:border-zinc-800/80 bg-white/95 dark:bg-black/80 px-4 backdrop-blur lg:px-6 transition-colors">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white lg:hidden transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-sm font-semibold text-slate-900 dark:text-zinc-100 lg:hidden">
                {NAV_ITEMS.find((i) => i.href === pathname)?.label ?? "finavig Admin"}
              </h1>
              <p className="hidden text-xs text-slate-700 dark:text-zinc-400 font-medium lg:block">finavig Admin · Document & Financial Intelligence</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {lastUpdated ? (
              <span className="hidden text-xs text-slate-700 dark:text-zinc-400 font-medium md:block">
                Synced {lastUpdated.toLocaleTimeString("en-GB")}
              </span>
            ) : null}
            <ThemeToggle />
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
    <div className="flex h-14 items-center gap-2.5 border-b border-[#D6E0EC] dark:border-zinc-800/80 px-4 transition-colors">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white p-1 shadow-xs border border-zinc-200/90 dark:border-zinc-800 dark:bg-zinc-900 transition-colors">
        <FinavigLogo size={24} />
      </div>
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5 leading-none">
          <p className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">finavig</p>
          <span className="rounded bg-[#EFF6FC] px-1.5 py-0.5 text-[10px] font-semibold text-[#0078D4] dark:bg-zinc-800 dark:text-zinc-300">
            Admin
          </span>
        </div>
        <p className="truncate text-[10px] text-slate-700 dark:text-zinc-400 font-semibold leading-tight">Financial Navigator</p>
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
  const projectRef = supabaseProjectRef(SUPABASE_URL);
  return (
    <div className="border-t border-[#D6E0EC] dark:border-zinc-800/80 p-3 transition-colors">
      <div className="rounded-lg border border-[#D6E0EC] dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 shadow-sm dark:shadow-none transition-colors">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <p className="text-xs font-semibold text-slate-900 dark:text-zinc-200">Supabase connected</p>
        </div>
        <p
          className={cn(
            "mt-1 truncate font-mono text-[10px] font-medium",
            isUsingDefaultProjectUrl ? "text-amber-700 dark:text-amber-400" : "text-slate-700 dark:text-zinc-400",
          )}
          title={
            isUsingDefaultProjectUrl
              ? "NEXT_PUBLIC_SUPABASE_URL is not set in this deployment — a hardcoded fallback project is being used. Local and production may be reading DIFFERENT databases."
              : "Active Supabase project"
          }
        >
          project {projectRef ?? "custom"}
          {isUsingDefaultProjectUrl ? " (fallback!)" : ""}
        </p>
        {lastUpdated ? (
          <p className="mt-1 text-[10px] text-slate-700 dark:text-zinc-400 font-medium">Last sync {lastUpdated.toLocaleTimeString("en-GB")}</p>
        ) : null}
        {isUsingDefaultProjectUrl ? (
          <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-snug text-amber-800 dark:text-amber-300">
            Env drift: set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY in this deployment and redeploy.
          </p>
        ) : null}
        <Button variant="outline" size="sm" className="mt-3 w-full" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Sync now
        </Button>
      </div>
    </div>
  );
}
