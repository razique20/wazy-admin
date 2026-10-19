"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  ShieldAlert,
  Crown,
  UserCheck,
  Plus,
  RefreshCw,
  Search,
  AlertTriangle,
  Copy,
  Check,
  Power,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Badge,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/primitives";
import { AddAdminModal } from "@/components/admins/add-admin-modal";
import { EditAdminModal } from "@/components/admins/edit-admin-modal";
import {
  ADMIN_ROLE_META,
  computeAdminStats,
  filterAdmins,
  type AdminRecord,
  type AdminRole,
} from "@/lib/admins";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useAdminAuth } from "@/components/providers/admin-auth-provider";
import { authenticatedFetch } from "@/lib/auth-client";

export default function AdminsPage() {
  const { isSuperAdmin, loading: authLoading } = useAdminAuth();
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [notMigrated, setNotMigrated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<"all" | AdminRole>("all");
  const [addModalOpen, setAddModalOpen] = useState<boolean>(false);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminRecord | null>(null);
  const [authUsers, setAuthUsers] = useState<{ id: string; email: string | null }[]>([]);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/admin-roles");
      const data = await res.json();
      if (res.ok) {
        setAdmins(data.admins ?? []);
        setNotMigrated(data.source === "not_migrated");
      }
    } catch {
      // Degrade gracefully
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAuthUsers = useCallback(async () => {
    try {
      const res = await authenticatedFetch("/api/admin-users");
      const data = await res.json();
      if (res.ok && data.users) {
        setAuthUsers(data.users);
      }
    } catch {
      // Degrade gracefully
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchAdmins();
      fetchAuthUsers();
    }
  }, [isSuperAdmin, fetchAdmins, fetchAuthUsers]);

  const stats = useMemo(() => computeAdminStats(admins), [admins]);
  const filteredAdmins = useMemo(
    () => filterAdmins(admins, search, roleFilter),
    [admins, search, roleFilter],
  );

  const copySqlMigration = () => {
    const sql = `-- Run this in Supabase Dashboard -> SQL Editor
create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade unique,
  email text not null,
  role text not null default 'admin' check (role in ('super_admin', 'admin')),
  display_name text,
  is_active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_roles enable row level security;`;
    navigator.clipboard.writeText(sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const getInitials = (email: string, name?: string | null) => {
    if (name) {
      const parts = name.trim().split(" ");
      return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
    }
    return email.slice(0, 2).toUpperCase();
  };

  if (!authLoading && !isSuperAdmin) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          Super Admin Privileges Required
        </h2>
        <p className="mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
          Access to administrator management and role assignment is restricted to Super Administrators only. Your current role does not have permission to view or manage administrators.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-9 items-center justify-center rounded-lg bg-[#0078D4] px-4 text-xs font-medium text-white shadow hover:bg-[#106EBE] transition-colors"
        >
          Return to Overview
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0078D4]/10 text-[#0078D4] dark:text-blue-400">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admins Management</h1>
            </div>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Manage platform administrators and configure two-tier role-based access control (Super Admin &amp; Admin).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={fetchAdmins} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={() => setAddModalOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Admin
            </Button>
          </div>
        </div>

        {/* Not Migrated / Setup Alert Banner */}
        {notMigrated ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                  Database Table Setup Required
                </h3>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                  The <code className="font-mono text-amber-700 dark:text-amber-300">public.admin_roles</code> table has not been created in your Supabase project yet.
                  Run the SQL migration script in your Supabase Dashboard SQL editor to enable admin management.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={copySqlMigration}>
                    {copiedSql ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-500 mr-1.5" />
                        Copied SQL!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Copy SQL Script
                      </>
                    )}
                  </Button>
                  <span className="text-xs text-zinc-500">
                    File: <code className="font-mono text-zinc-700 dark:text-zinc-300">supabase/admin_roles_schema.sql</code>
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Total Admins</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
              <p className="mt-1 text-[11px] text-zinc-500">Platform administrators</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">Super Admins</p>
                <Crown className="h-4 w-4 text-amber-500" />
              </div>
              <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.superAdmins}</p>
              <p className="mt-1 text-[11px] text-zinc-500">Full system access</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-[#0078D4] dark:text-blue-400">Admins</p>
                <UserCheck className="h-4 w-4 text-[#0078D4] dark:text-blue-400" />
              </div>
              <p className="mt-1 text-2xl font-bold text-[#0078D4] dark:text-blue-400">{stats.admins}</p>
              <p className="mt-1 text-[11px] text-zinc-500">Operational staff</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Active</p>
                <Power className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.active}</p>
              <p className="mt-1 text-[11px] text-zinc-500">{stats.suspended} suspended</p>
            </CardContent>
          </Card>
        </div>

        {/* Admins Table Card */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Administrator Directory</CardTitle>
                <CardDescription>
                  {admins.length} administrator{admins.length === 1 ? "" : "s"} configured with role-based permissions
                </CardDescription>
              </div>

              {/* Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                  <Input
                    placeholder="Search by name or email…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>

                <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-0.5 text-xs">
                  <button
                    onClick={() => setRoleFilter("all")}
                    className={cn(
                      "px-2.5 py-1 rounded-md font-medium transition-colors",
                      roleFilter === "all"
                        ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-xs"
                        : "text-zinc-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white",
                    )}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setRoleFilter("super_admin")}
                    className={cn(
                      "px-2.5 py-1 rounded-md font-medium transition-colors",
                      roleFilter === "super_admin"
                        ? "bg-white dark:bg-zinc-800 text-amber-600 dark:text-amber-400 shadow-xs"
                        : "text-zinc-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white",
                    )}
                  >
                    Super Admins
                  </button>
                  <button
                    onClick={() => setRoleFilter("admin")}
                    className={cn(
                      "px-2.5 py-1 rounded-md font-medium transition-colors",
                      roleFilter === "admin"
                        ? "bg-white dark:bg-zinc-800 text-[#0078D4] dark:text-blue-400 shadow-xs"
                        : "text-zinc-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white",
                    )}
                  >
                    Admins
                  </button>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {filteredAdmins.length === 0 ? (
              <EmptyState
                title="No administrators found"
                description={
                  admins.length === 0
                    ? notMigrated
                      ? "Run the database setup script to begin adding administrators."
                      : "Click 'Add Admin' to assign the first administrator account."
                    : "No admins match your search filter."
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Administrator</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned Date</TableHead>
                    <TableHead>Last Sign-In</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAdmins.map((admin) => (
                    <TableRow key={admin.id}>
                      {/* Name & Email */}
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                              admin.role === "super_admin"
                                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                                : "bg-[#0078D4]/20 text-[#0078D4] dark:text-blue-300",
                            )}
                          >
                            {getInitials(admin.email, admin.displayName)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900 dark:text-zinc-100">
                              {admin.displayName ?? admin.email}
                            </p>
                            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                              {admin.email} · <span className="font-mono text-[10px]">{admin.userId.slice(0, 8)}</span>
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      {/* Role Badge */}
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                            ADMIN_ROLE_META[admin.role].badgeClass,
                          )}
                        >
                          {admin.role === "super_admin" ? (
                            <Crown className="h-3 w-3 text-amber-500" />
                          ) : (
                            <ShieldCheck className="h-3 w-3 text-[#0078D4] dark:text-blue-400" />
                          )}
                          {ADMIN_ROLE_META[admin.role].label}
                        </span>
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Badge variant={admin.isActive ? "success" : "neutral"}>
                          {admin.isActive ? "Active" : "Suspended"}
                        </Badge>
                      </TableCell>

                      {/* Assigned Date */}
                      <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                        {formatDate(admin.createdAt)}
                      </TableCell>

                      {/* Last Sign-in */}
                      <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                        {admin.lastSignInAt ? formatDate(admin.lastSignInAt) : "Never"}
                      </TableCell>

                      {/* Action */}
                      <TableCell className="text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setSelectedAdmin(admin)}
                        >
                          Manage
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Roles & Capabilities Reference Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Super Admin Card */}
          <Card className="border-amber-500/20 bg-amber-500/[0.02]">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Crown className="h-4 w-4" />
                </span>
                <CardTitle className="text-amber-700 dark:text-amber-400">Super Admin Privileges</CardTitle>
              </div>
              <CardDescription>
                Designed for founders, CTOs, and platform owners.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                {ADMIN_ROLE_META.super_admin.capabilities.map((cap) => (
                  <li key={cap} className="flex items-start gap-2">
                    <span className="text-amber-500 font-bold">✓</span>
                    <span>{cap}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Regular Admin Card */}
          <Card className="border-[#0078D4]/20 bg-[#0078D4]/[0.02]">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#0078D4]/10 text-[#0078D4] dark:text-blue-400">
                  <UserCheck className="h-4 w-4" />
                </span>
                <CardTitle className="text-[#0078D4] dark:text-blue-400">Admin Privileges</CardTitle>
              </div>
              <CardDescription>
                Designed for operations, customer support leads, and day-to-day staff.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                {ADMIN_ROLE_META.admin.capabilities.map((cap) => (
                  <li key={cap} className="flex items-start gap-2">
                    <span className="text-[#0078D4] dark:text-blue-400 font-bold">✓</span>
                    <span>{cap}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Modals */}
        <AddAdminModal
          open={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          onSuccess={fetchAdmins}
          authUsers={authUsers}
        />

        <EditAdminModal
          admin={selectedAdmin}
          allAdmins={admins}
          onClose={() => setSelectedAdmin(null)}
          onSuccess={fetchAdmins}
        />
      </div>
    );
}
