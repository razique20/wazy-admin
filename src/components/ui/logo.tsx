import React from "react";
import { cn } from "@/lib/cn";

interface FinavigLogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
}

/**
 * Finavig Microsoft-inspired corporate identity logo.
 * 4 rounded quadrants (Green, Red, Blue, Amber) with an inner navigational square cutout.
 */
export function FinavigLogo({ size = 28, className, ...props }: FinavigLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 transition-transform hover:scale-105 duration-200", className)}
      aria-label="Finavig logo"
      {...props}
    >
      {/* Top-Left: Vivid Green */}
      <path
        d="M 12 18 C 12 14 14 12 18 12 L 44 12 C 47 12 48 13 48 16 L 48 36 C 48 38 46 40 44 40 L 40 40 C 38 40 36 42 36 44 L 36 48 C 36 50 35 52 32 52 L 16 52 C 13 52 12 51 12 48 Z"
        fill="#107C41"
      />
      {/* Top-Right: Vibrant Microsoft Red */}
      <path
        d="M 56 12 C 56 13 57 12 60 12 L 82 12 C 86 12 88 14 88 18 L 88 48 C 88 51 87 52 84 52 L 68 52 C 65 52 64 50 64 48 L 64 44 C 64 42 62 40 60 40 L 56 40 C 54 40 52 38 52 36 L 52 16 C 52 13 53 12 56 12 Z"
        fill="#E81123"
      />
      {/* Bottom-Left: Microsoft Azure Blue */}
      <path
        d="M 12 52 C 12 49 13 48 16 48 L 32 48 C 35 48 36 50 36 52 L 36 56 C 36 58 38 60 40 60 L 44 60 C 46 60 48 62 48 64 L 48 84 C 48 87 47 88 44 88 L 18 88 C 14 88 12 86 12 82 Z"
        fill="#0078D4"
      />
      {/* Bottom-Right: Vibrant Golden Yellow */}
      <path
        d="M 52 64 C 52 62 54 60 56 60 L 60 60 C 62 60 64 58 64 56 L 64 52 C 64 50 65 48 68 48 L 84 48 C 87 48 88 49 88 52 L 88 82 C 88 86 86 88 82 88 L 60 88 C 57 88 56 87 56 84 L 56 68 C 56 65 55 64 52 64 Z"
        fill="#FFB900"
      />
    </svg>
  );
}

export function FinavigBrand({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white p-1 shadow-xs border border-zinc-200/90 dark:border-zinc-800 dark:bg-zinc-900 transition-colors">
        <FinavigLogo size={24} />
      </div>
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5 leading-none">
          <span className="text-sm font-bold tracking-tight text-zinc-900 dark:text-white">finavig</span>
          <span className="rounded bg-[#EFF6FC] px-1.5 py-0.5 text-[10px] font-semibold text-[#0078D4] dark:bg-zinc-800 dark:text-zinc-300">
            Admin
          </span>
        </div>
        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">Financial Navigator</span>
      </div>
    </div>
  );
}
