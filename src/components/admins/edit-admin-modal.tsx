"use client";

import { useState } from "react";
import { Crown, UserCheck, Loader2, AlertCircle, Trash2, Power } from "lucide-react";
import {
  Button,
  Input,
  Badge,
} from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ADMIN_ROLE_META,
  canDemoteOrDeactivateAdmin,
  canRevokeAdmin,
  type AdminRecord,
  type AdminRole,
} from "@/lib/admins";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

interface EditAdminModalProps {
  admin: AdminRecord | null;
  allAdmins: readonly AdminRecord[];
  onClose: () => void;
  onSuccess: () => void;
}

export function EditAdminModal({ admin, allAdmins, onClose, onSuccess }: EditAdminModalProps) {
  if (!admin) return null;

  return (
    <EditAdminDialogContent
      key={admin.userId}
      admin={admin}
      allAdmins={allAdmins}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

function EditAdminDialogContent({
  admin,
  allAdmins,
  onClose,
  onSuccess,
}: {
  admin: AdminRecord;
  allAdmins: readonly AdminRecord[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [role, setRole] = useState<AdminRole>(admin.role);
  const [isActive, setIsActive] = useState<boolean>(admin.isActive);
  const [displayName, setDisplayName] = useState<string>(admin.displayName ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const safeguardDemote = canDemoteOrDeactivateAdmin(admin.userId, admin.role, allAdmins);
  const safeguardRevoke = canRevokeAdmin(admin.userId, allAdmins);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Safeguard check before calling API
    if (admin.role === "super_admin" && (role !== "super_admin" || !isActive)) {
      if (!safeguardDemote.allowed) {
        setError(safeguardDemote.reason ?? "Cannot modify this role");
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin-roles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: admin.userId,
          role,
          isActive,
          displayName: displayName.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update admin");
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update admin");
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!safeguardRevoke.allowed) {
      setError(safeguardRevoke.reason ?? "Cannot revoke admin");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin-roles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: admin.userId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to revoke admin");
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke admin");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={Boolean(admin)} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="truncate">Manage Admin: {admin.email}</DialogTitle>
            <Badge variant={admin.role === "super_admin" ? "warning" : "info"}>
              {ADMIN_ROLE_META[admin.role].label}
            </Badge>
          </div>
          <DialogDescription>
            Account {admin.userId.slice(0, 8)} · Added {formatDate(admin.createdAt)}
            {admin.lastSignInAt ? ` · Last login ${formatDate(admin.lastSignInAt)}` : ""}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : null}

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          {/* Display Name */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Display Name / Title
            </label>
            <Input
              className="mt-1.5"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Lead Operations"
            />
          </div>

          {/* Role */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Assigned Role
            </label>
            <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setRole("super_admin")}
                className={cn(
                  "flex flex-col items-start rounded-xl border p-3 text-left transition-all",
                  role === "super_admin"
                    ? "border-amber-500 bg-amber-500/10 shadow-sm dark:bg-amber-500/5 ring-1 ring-amber-500"
                    : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 hover:border-zinc-300 dark:hover:border-zinc-700",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/20 text-amber-600 dark:text-amber-400">
                    <Crown className="h-3 w-3" />
                  </span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">Super Admin</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">Full system & admin control</p>
              </button>

              <button
                type="button"
                onClick={() => setRole("admin")}
                disabled={admin.role === "super_admin" && !safeguardDemote.allowed}
                className={cn(
                  "flex flex-col items-start rounded-xl border p-3 text-left transition-all",
                  role === "admin"
                    ? "border-[#0078D4] bg-[#0078D4]/10 shadow-sm dark:bg-[#0078D4]/5 ring-1 ring-[#0078D4]"
                    : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 hover:border-zinc-300 dark:hover:border-zinc-700",
                  admin.role === "super_admin" && !safeguardDemote.allowed && "opacity-50 cursor-not-allowed",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-[#0078D4]/20 text-[#0078D4] dark:text-blue-400">
                    <UserCheck className="h-3 w-3" />
                  </span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">Admin</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">Standard operational access</p>
              </button>
            </div>
            {admin.role === "super_admin" && !safeguardDemote.allowed ? (
              <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                ⚠️ This is the only active Super Admin and cannot be demoted.
              </p>
            ) : null}
          </div>

          {/* Status Toggle */}
          <div className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-black/40 p-3">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Access Status</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {isActive ? "Admin account is active and can access the console." : "Admin access is suspended."}
              </p>
            </div>
            <Button
              type="button"
              variant={isActive ? "secondary" : "outline"}
              size="sm"
              disabled={admin.role === "super_admin" && !safeguardDemote.allowed && isActive}
              onClick={() => setIsActive(!isActive)}
            >
              <Power className={cn("h-3.5 w-3.5 mr-1.5", isActive ? "text-emerald-500" : "text-zinc-400")} />
              {isActive ? "Active" : "Suspended"}
            </Button>
          </div>

          {/* Danger Zone: Revoke Access */}
          <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 p-3">
            <p className="text-xs font-semibold text-red-700 dark:text-red-400">Revoke Administrator Privileges</p>
            <p className="mt-0.5 text-xs text-red-600/80 dark:text-red-300/80">
              Removes admin access immediately. The user&apos;s standard app account remains intact.
            </p>
            {!confirmRevoke ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                className="mt-2.5"
                disabled={!safeguardRevoke.allowed}
                onClick={() => setConfirmRevoke(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Revoke Admin Access
              </Button>
            ) : (
              <div className="mt-2.5 flex items-center gap-2">
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={loading}
                  onClick={handleRevoke}
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Confirm Revocation
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmRevoke(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
            {!safeguardRevoke.allowed ? (
              <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                Cannot revoke the only active Super Admin.
              </p>
            ) : null}
          </div>

          <div className="mt-6 flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
