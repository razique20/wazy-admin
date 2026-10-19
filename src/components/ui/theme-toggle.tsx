"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/cn";

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export function ThemeToggle({ className, showLabel = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        type="button"
        disabled
        aria-label="Theme toggle"
        className={cn(
          "inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs text-zinc-400 opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500",
          className,
        )}
      >
        <span className="h-4 w-4" />
        {showLabel ? <span className="text-xs">Theme</span> : null}
      </button>
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode (Azure)" : "Switch to dark mode"}
      className={cn(
        "group relative inline-flex h-8 items-center justify-center gap-2 rounded-lg border px-2.5 text-xs font-medium transition-all duration-300 ease-in-out select-none active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0078D4]/60",
        // Light mode styling (Azure style: crisp white with slate border and subtle hover)
        "border-zinc-300 bg-white text-zinc-700 shadow-sm hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-900",
        // Dark mode styling
        "dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:shadow-none dark:hover:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white",
        className,
      )}
    >
      <div className="relative flex h-4 w-4 items-center justify-center overflow-hidden">
        {/* Sun Icon (visible in dark mode) */}
        <Sun
          className={cn(
            "h-4 w-4 text-amber-400 transition-all duration-300 ease-in-out absolute",
            isDark
              ? "rotate-0 scale-100 opacity-100"
              : "rotate-90 scale-0 opacity-0 pointer-events-none",
          )}
        />
        {/* Moon Icon (visible in light mode) */}
        <Moon
          className={cn(
            "h-4 w-4 text-[#0078D4] transition-all duration-300 ease-in-out absolute",
            isDark
              ? "-rotate-90 scale-0 opacity-0 pointer-events-none"
              : "rotate-0 scale-100 opacity-100",
          )}
        />
      </div>
      {showLabel ? (
        <span className="truncate transition-colors duration-300">{isDark ? "Light mode" : "Dark mode"}</span>
      ) : (
        <span className="hidden text-xs sm:inline-block transition-colors duration-300">
          {isDark ? "Light" : "Dark"}
        </span>
      )}
    </button>
  );
}
