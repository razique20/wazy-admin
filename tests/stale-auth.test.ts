import { describe, expect, it } from "vitest";
import { computeUserSummaries, type DeletedUserRecord } from "@/lib/users";
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

describe("stale auth-read reconciliation (GoTrue replica lag)", () => {
  const deletes: DeletedUserRecord[] = [
    { deletedUserId: "u1", performedAt: "2026-09-10T00:00:00Z" },
  ];

  it("flags an auth row created BEFORE the recorded delete as deleted/orphaned", () => {
    const users = computeUserSummaries(
      bundle({
        collections: [
          { id: "c1", owner_id: "u1", name: "Leftover", is_personal: true, created_at: "2026-01-01" },
        ],
      }),
      // Stale read: listUsers still returns the old account row.
      [{ id: "u1", email: "x@y.com", createdAt: "2026-01-01" }],
      REF,
      true,
      deletes,
    );
    expect(users).toHaveLength(1);
    expect(users[0].orphaned).toBe(true);
    expect(users[0].accountStatus).toBe("orphaned");
  });

  it("flags any listed auth row with a delete record, even with recent createdAt (audit is source of truth)", () => {
    const users = computeUserSummaries(
      bundle(),
      [{ id: "u1", email: "x@y.com", createdAt: "2026-09-12T00:00:00Z", emailConfirmedAt: "2026-09-12T00:00:00Z" }],
      REF,
      true,
      deletes,
    );
    expect(users[0].orphaned).toBe(true);
    expect(users[0].accountStatus).toBe("orphaned");
  });

  it("keeps users without a delete record active", () => {
    const users = computeUserSummaries(
      bundle(),
      [{ id: "u1", email: "x@y.com", createdAt: null }],
      REF,
      true,
      [],
    );
    expect(users[0].accountStatus).toBe("unconfirmed");
    expect(users[0].orphaned).toBe(false);
  });

  it("ignores malformed delete records with an empty performedAt", () => {
    const users = computeUserSummaries(
      bundle(),
      [{ id: "u1", email: "x@y.com", emailConfirmedAt: "2026-01-01" }],
      REF,
      true,
      [{ deletedUserId: "u1", performedAt: "" }],
    );
    expect(users[0].accountStatus).toBe("active");
    expect(users[0].orphaned).toBe(false);
  });
});
