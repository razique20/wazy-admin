import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        404 - Page Not Found
      </h2>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        The requested resource could not be found.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-9 items-center justify-center rounded-lg bg-[#0078D4] px-4 text-xs font-medium text-white shadow hover:bg-[#106EBE] transition-colors"
      >
        Return to Dashboard
      </Link>
    </div>
  );
}
