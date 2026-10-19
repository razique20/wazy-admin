import { describe, expect, it } from "vitest";
import {
  ADMIN_ROLES,
  ADMIN_ROLE_META,
  isAdminRole,
  toAdminRole,
  canManageAdmins,
  canWipeData,
  canDemoteOrDeactivateAdmin,
  canRevokeAdmin,
  computeAdminStats,
  filterAdmins,
  type AdminRecord,
} from "@/lib/admins";

const MOCK_ADMINS: AdminRecord[] = [
  {
    id: "admin-1",
    userId: "u1-uuid-1111",
    email: "super@finavig.com",
    role: "super_admin",
    displayName: "Founder Super",
    isActive: true,
    createdBy: "system",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "admin-2",
    userId: "u2-uuid-2222",
    email: "ops@finavig.com",
    role: "admin",
    displayName: "Ops Specialist",
    isActive: true,
    createdBy: "super@finavig.com",
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
  },
  {
    id: "admin-3",
    userId: "u3-uuid-3333",
    email: "inactive@finavig.com",
    role: "admin",
    displayName: "Past Staff",
    isActive: false,
    createdBy: "super@finavig.com",
    createdAt: "2026-02-15T00:00:00Z",
    updatedAt: "2026-03-01T00:00:00Z",
  },
];

describe("Admin Roles Validation & Meta", () => {
  it("recognizes exact valid roles", () => {
    expect(ADMIN_ROLES).toEqual(["super_admin", "admin"]);
    expect(isAdminRole("super_admin")).toBe(true);
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("moderator")).toBe(false);
    expect(isAdminRole("")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });

  it("normalizes and parses roles cleanly", () => {
    expect(toAdminRole(" SUPER_ADMIN ")).toBe("super_admin");
    expect(toAdminRole("admin")).toBe("admin");
    expect(toAdminRole("guest")).toBeNull();
  });

  it("has complete role metadata for super_admin and admin", () => {
    expect(ADMIN_ROLE_META.super_admin.label).toBe("Super Admin");
    expect(ADMIN_ROLE_META.admin.label).toBe("Admin");
    expect(ADMIN_ROLE_META.super_admin.capabilities.length).toBeGreaterThan(0);
    expect(ADMIN_ROLE_META.admin.capabilities.length).toBeGreaterThan(0);
  });
});

describe("Permissions Matrix", () => {
  it("only allows super_admin to manage admins and wipe data", () => {
    expect(canManageAdmins("super_admin")).toBe(true);
    expect(canManageAdmins("admin")).toBe(false);
    expect(canManageAdmins(null)).toBe(false);

    expect(canWipeData("super_admin")).toBe(true);
    expect(canWipeData("admin")).toBe(false);
  });
});

describe("Safeguards against removing the last Super Admin", () => {
  it("prevents demoting or deactivating the sole active Super Admin", () => {
    const check = canDemoteOrDeactivateAdmin("u1-uuid-1111", "super_admin", MOCK_ADMINS);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("Cannot demote or deactivate the only active Super Admin");
  });

  it("prevents revoking the sole active Super Admin", () => {
    const check = canRevokeAdmin("u1-uuid-1111", MOCK_ADMINS);
    expect(check.allowed).toBe(false);
  });

  it("permits demoting or revoking when another active Super Admin exists", () => {
    const twoSuperAdmins: AdminRecord[] = [
      ...MOCK_ADMINS,
      {
        id: "admin-4",
        userId: "u4-uuid-4444",
        email: "super2@finavig.com",
        role: "super_admin",
        displayName: "Second Super",
        isActive: true,
        createdBy: "system",
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
      },
    ];

    const check = canDemoteOrDeactivateAdmin("u1-uuid-1111", "super_admin", twoSuperAdmins);
    expect(check.allowed).toBe(true);

    const revokeCheck = canRevokeAdmin("u1-uuid-1111", twoSuperAdmins);
    expect(revokeCheck.allowed).toBe(true);
  });

  it("allows demoting or revoking regular admins freely", () => {
    const demoteRegular = canDemoteOrDeactivateAdmin("u2-uuid-2222", "admin", MOCK_ADMINS);
    expect(demoteRegular.allowed).toBe(true);

    const revokeRegular = canRevokeAdmin("u2-uuid-2222", MOCK_ADMINS);
    expect(revokeRegular.allowed).toBe(true);
  });
});

describe("computeAdminStats", () => {
  it("computes accurate counts", () => {
    const stats = computeAdminStats(MOCK_ADMINS);
    expect(stats.total).toBe(3);
    expect(stats.superAdmins).toBe(1);
    expect(stats.admins).toBe(2);
    expect(stats.active).toBe(2);
    expect(stats.suspended).toBe(1);
  });
});

describe("filterAdmins", () => {
  it("filters by query across email, display name, and user ID", () => {
    expect(filterAdmins(MOCK_ADMINS, "super").length).toBe(1);
    expect(filterAdmins(MOCK_ADMINS, "Specialist").length).toBe(1);
    expect(filterAdmins(MOCK_ADMINS, "uuid-2222").length).toBe(1);
    expect(filterAdmins(MOCK_ADMINS, "nonexistent").length).toBe(0);
  });

  it("filters by role", () => {
    expect(filterAdmins(MOCK_ADMINS, "", "super_admin").length).toBe(1);
    expect(filterAdmins(MOCK_ADMINS, "", "admin").length).toBe(2);
    expect(filterAdmins(MOCK_ADMINS, "", "all").length).toBe(3);
  });
});

describe("verifyAdminRequest Authorization Enforcement", () => {
  it("rejects request when Authorization header is missing", async () => {
    const { verifyAdminRequest } = await import("@/lib/server-auth");
    const req = new Request("http://localhost:3000/api/admin-roles");
    const result = await verifyAdminRequest(req);
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(401);
    }
  });

  it("rejects request when Authorization header is not Bearer", async () => {
    const { verifyAdminRequest } = await import("@/lib/server-auth");
    const req = new Request("http://localhost:3000/api/admin-roles", {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    const result = await verifyAdminRequest(req);
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(401);
    }
  });
});
