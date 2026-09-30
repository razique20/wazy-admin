import { describe, expect, it } from "vitest";
import { computeUserSummaries } from "@/lib/users";
import type { WazyDataBundle } from "@/lib/types";

const REF = new Date("2026-09-15T12:00:00Z");

function bundle(partial: Partial<WazyDataBundle> = {}): WazyDataBundle {
  return {
    collections: [],
    documents: [],
    reminders: [],
    customDocumentTypes: [],
    transactions: [],
    budgets: [],
    envelopes: [],
    recurring: [],
    supportRequests: [],
    aiQuotaUsage: [],
    appVersions: [],
    ...partial,
  };
}

describe("authKnown source recognition (service_role and direct_pg)", () => {
  const authUsers = [{ id: "u1", email: "a@b.com", emailConfirmedAt: "2026-01-01" }];

  it("treats direct_pg as a known auth list: registered user appears active", () => {
    const users = computeUserSummaries(bundle(), authUsers, REF, true);
    expect(users[0].accountStatus).toBe("active");
    expect(users[0].orphaned).toBe(false);
  });

  it("treats an unknown source as unknown status for data-only rows", () => {
    const users = computeUserSummaries(
      bundle({
        collections: [
          { id: "c1", owner_id: "mystery", name: "A", is_personal: true, created_at: "2026-01-01" },
        ],
      }),
      [],
      REF,
      false,
    );
    expect(users[0].accountStatus).toBe("unknown");
  });

  it("with a known auth list, data-only owners are orphaned (deleted accounts)", () => {
    const users = computeUserSummaries(
      bundle({
        collections: [
          { id: "c1", owner_id: "ghost", name: "A", is_personal: true, created_at: "2026-01-01" },
        ],
      }),
      authUsers,
      REF,
      true,
    );
    expect(users.find((u) => u.ownerId === "ghost")?.orphaned).toBe(true);
  });
});
