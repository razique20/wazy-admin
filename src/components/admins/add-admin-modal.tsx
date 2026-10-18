"use client";

import { useState } from "react";
import { ShieldCheck, Crown, Loader2, UserCheck, AlertCircle } from "lucide-react";
import {
  Button,
  Input,
} from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ADMIN_ROLE_META, type AdminRole } from "@/lib/admins";
import { cn } from "@/lib/cn";

interface AddAdminModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  authUsers: { id: string; email: string | null }[];
}

export function AddAdminModal({ open, onClose, onSuccess, authUsers }: AddAdminModalProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [customEmail, setCustomEmail] = useState<string>("");
  const [role, setRole] = useState<AdminRole>("admin");
  const [displayName, setDisplayName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const emailToUse = selectedUserId
      ? authUsers.find((u) => u.id === selectedUserId)?.email ?? ""
      : customEmail.trim();

    if (!selectedUserId && !emailToUse) {
      setError("Please select an existing account or enter an email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId || undefined,
          email: emailToUse || undefined,
          role,
          displayName: displayName.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to assign admin role");
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0078D4]/10 text-[#0078D4] dark:text-blue-400">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span>Assign Administrator Role</span>
          </DialogTitle>
          <DialogDescription>
            Grant administrative privileges to an account. Admins sign in using their standard Supabase credentials.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* User Selection */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Target User Account
            </label>
            {authUsers.length > 0 ? (
              <select
                value={selectedUserId}
                onChange={(e) => {
                  setSelectedUserId(e.target.value);
                  if (e.target.value) setCustomEmail("");
                }}
                className="mt-1.5 h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-sm text-slate-900 dark:text-zinc-100 focus:border-[#0078D4] focus:outline-none"
              >
                <option value="">-- Choose from existing users or enter email below --</option>
                {authUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email ?? u.id.slice(0, 8)} ({u.id.slice(0, 8)})
                  </option>
                ))}
              </select>
            ) : null}

            {!selectedUserId ? (
              <div className="mt-2">
                <Input
                  placeholder="Or type user email (e.g. admin@finavig.com)"
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  type="email"
                />
              </div>
            ) : null}
          </div>

          {/* Display Name */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Admin Display Name <span className="text-zinc-400 font-normal">(optional)</span>
            </label>
            <Input
              className="mt-1.5"
              placeholder="e.g. Finance Lead, Alex Smith"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          {/* Role Choice */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Select Role & Capabilities
            </label>
            <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {/* Super Admin */}
              <button
                type="button"
                onClick={() => setRole("super_admin")}
                className={cn(
                  "relative flex flex-col items-start rounded-xl border p-3.5 text-left transition-all",
                  role === "super_admin"
                    ? "border-amber-500 bg-amber-500/10 shadow-sm dark:bg-amber-500/5 ring-1 ring-amber-500"
                    : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 hover:border-zinc-300 dark:hover:border-zinc-700",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400">
                    <Crown className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {ADMIN_ROLE_META.super_admin.label}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Full control: manage other admins, run system maintenance, and execute destructive operations.
                </p>
              </button>

              {/* Standard Admin */}
              <button
                type="button"
                onClick={() => setRole("admin")}
                className={cn(
                  "relative flex flex-col items-start rounded-xl border p-3.5 text-left transition-all",
                  role === "admin"
                    ? "border-[#0078D4] bg-[#0078D4]/10 shadow-sm dark:bg-[#0078D4]/5 ring-1 ring-[#0078D4]"
                    : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 hover:border-zinc-300 dark:hover:border-zinc-700",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#0078D4]/20 text-[#0078D4] dark:text-blue-400">
                    <UserCheck className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {ADMIN_ROLE_META.admin.label}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Operational access: manage users, finance, support tickets, documents, and AI usage.
                </p>
              </button>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Grant Admin Role
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
