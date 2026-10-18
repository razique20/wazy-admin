/**
 * Domain logic, types, and role-based access control (RBAC) definitions
 * for finavig Admin Management.
 */

export const ADMIN_ROLES = ["super_admin", "admin"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

export function toAdminRole(value: unknown): AdminRole | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isAdminRole(normalized) ? normalized : null;
}

export interface AdminRecord {
  id: string;
  userId: string;
  email: string;
  role: AdminRole;
  displayName: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  // Auth account join fields (when available)
  lastSignInAt?: string | null;
  emailConfirmedAt?: string | null;
  bannedUntil?: string | null;
}

export interface AdminRoleMeta {
  role: AdminRole;
  label: string;
  shortLabel: string;
  description: string;
  badgeClass: string;
  pillVariant: "warning" | "info";
  capabilities: readonly string[];
}

export const ADMIN_ROLE_META: Record<AdminRole, AdminRoleMeta> = {
  super_admin: {
    role: "super_admin",
    label: "Super Admin",
    shortLabel: "Super",
    description: "Full access to platform operations, admin management, audit logs, and destructive maintenance.",
    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    pillVariant: "warning",
    capabilities: [
      "Manage other admins (invite, assign role, revoke)",
      "Perform full data wipes and system purges",
      "Manage all users, bans, and password resets",
      "Configure subscription tiers and AI quotas",
      "Manage finance, documents, and support tickets",
    ],
  },
  admin: {
    role: "admin",
    label: "Admin",
    shortLabel: "Admin",
    description: "Standard administrative access for day-to-day platform and customer operations.",
    badgeClass: "bg-[#0078D4]/10 text-[#0078D4] dark:text-blue-400 border-[#0078D4]/30",
    pillVariant: "info",
    capabilities: [
      "Manage users (inspect, edit, ban/unban)",
      "View and respond to support tickets",
      "Monitor GCC markets and finance ledgers",
      "Manage document classifications and reminders",
      "View AI adoption and usage dashboards",
    ],
  },
};

/** Permission checks */
export function canManageAdmins(role: AdminRole | null | undefined): boolean {
  return role === "super_admin";
}

export function canWipeData(role: AdminRole | null | undefined): boolean {
  return role === "super_admin";
}

export function canManageSystem(role: AdminRole | null | undefined): boolean {
  return role === "super_admin" || role === "admin";
}

export function canManageUsers(role: AdminRole | null | undefined): boolean {
  return role === "super_admin" || role === "admin";
}

/**
 * Validates whether an admin can safely be demoted or deactivated without
 * leaving the system with 0 active Super Admins.
 */
export function canDemoteOrDeactivateAdmin(
  targetUserId: string,
  targetCurrentRole: AdminRole,
  allAdmins: readonly AdminRecord[],
): { allowed: boolean; reason?: string } {
  if (targetCurrentRole !== "super_admin") {
    return { allowed: true };
  }

  const activeSuperAdmins = allAdmins.filter(
    (a) => a.role === "super_admin" && a.isActive && a.userId !== targetUserId,
  );

  if (activeSuperAdmins.length === 0) {
    return {
      allowed: false,
      reason: "Cannot demote or deactivate the only active Super Admin. Assign another Super Admin first.",
    };
  }

  return { allowed: true };
}

/**
 * Validates whether an admin can safely be revoked (deleted) without leaving
 * the system with 0 active Super Admins.
 */
export function canRevokeAdmin(
  targetUserId: string,
  allAdmins: readonly AdminRecord[],
): { allowed: boolean; reason?: string } {
  const target = allAdmins.find((a) => a.userId === targetUserId);
  if (!target) return { allowed: true };

  return canDemoteOrDeactivateAdmin(targetUserId, target.role, allAdmins);
}

/** Admin list stats summary */
export interface AdminStats {
  total: number;
  superAdmins: number;
  admins: number;
  active: number;
  suspended: number;
}

export function computeAdminStats(admins: readonly AdminRecord[]): AdminStats {
  let superAdmins = 0;
  let regularAdmins = 0;
  let active = 0;
  let suspended = 0;

  for (const a of admins) {
    if (a.role === "super_admin") superAdmins++;
    else regularAdmins++;

    if (a.isActive) active++;
    else suspended++;
  }

  return {
    total: admins.length,
    superAdmins,
    admins: regularAdmins,
    active,
    suspended,
  };
}

/** Filters admins by search term and optional role filter */
export function filterAdmins(
  admins: readonly AdminRecord[],
  search: string,
  roleFilter: "all" | AdminRole = "all",
): AdminRecord[] {
  const q = search.trim().toLowerCase();

  return admins.filter((a) => {
    if (roleFilter !== "all" && a.role !== roleFilter) return false;
    if (!q) return true;

    return (
      a.email.toLowerCase().includes(q) ||
      (a.displayName?.toLowerCase().includes(q) ?? false) ||
      a.userId.toLowerCase().includes(q)
    );
  });
}
