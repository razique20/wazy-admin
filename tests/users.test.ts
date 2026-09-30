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

describe("computeUserSummaries", () => {
  it("registers auth users even without any data", () => {
    const users = computeUserSummaries(bundle(), [{ id: "u1", email: "a@b.com" }], REF);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ ownerId: "u1", email: "a@b.com", documentsCount: 0 });
  });

  it("derives accountStatus: active, banned, unconfirmed", () => {
    const users = computeUserSummaries(
      bundle(),
      [
        { id: "u1", email: "active@b.com", emailConfirmedAt: "2026-01-01" },
        { id: "u2", email: "banned@b.com", emailConfirmedAt: "2026-01-01", bannedUntil: "2099-01-01" },
        { id: "u3", email: "unconfirmed@b.com", emailConfirmedAt: null },
      ],
      REF,
    );
    const byId = Object.fromEntries(users.map((u) => [u.ownerId, u.accountStatus]));
    expect(byId["u1"]).toBe("active");
    expect(byId["u2"]).toBe("banned");
    expect(byId["u3"]).toBe("unconfirmed");
  });

  it("marks users whose data rows outlive their auth account as orphaned/deleted", () => {
    const users = computeUserSummaries(
      bundle({
        collections: [
          { id: "c1", owner_id: "ghost", name: "Leftover", is_personal: true, created_at: "2026-01-01" },
        ],
      }),
      [{ id: "u1", email: "a@b.com", emailConfirmedAt: "2026-01-01" }],
      REF,
    );
    const ghost = users.find((u) => u.ownerId === "ghost");
    expect(ghost?.orphaned).toBe(true);
    expect(ghost?.accountStatus).toBe("orphaned");
  });

  it("marks data-only rows as unknown when the auth list is unavailable (authKnown=false)", () => {
    const users = computeUserSummaries(
      bundle({
        collections: [
          { id: "c1", owner_id: "mystery", name: "A", is_personal: true, created_at: "2026-01-01" },
        ],
      }),
      [],
      REF,
      false, // auth list could not be fetched (e.g. service-role key missing in production)
    );
    expect(users[0].orphaned).toBe(false);
    expect(users[0].accountStatus).toBe("unknown");
  });

  it("treats an expired ban as active again (not banned)", () => {
    const users = computeUserSummaries(
      bundle(),
      [{ id: "u1", email: "a@b.com", emailConfirmedAt: "2026-01-01", bannedUntil: "2020-01-01" }],
      REF,
    );
    expect(users[0].accountStatus).toBe("active");
  });

  it("aggregates collections, documents and finance per owner", () => {
    const users = computeUserSummaries(
      bundle({
        collections: [
          { id: "c1", owner_id: "u1", name: "Personal", is_personal: true, created_at: "2026-01-01" },
          { id: "c2", owner_id: "u1", name: "Company", is_personal: false, created_at: "2026-02-01" },
        ],
        documents: [
          {
            id: "d1",
            owner_id: "u1",
            collection_id: "c1",
            doc_type: "passport",
            display_name: "Passport",
            expires_at: "2026-09-20",
            reminder_days: 30,
            status: "active",
            assigned_to: null,
            renewal_fee: null,
            notes: null,
            file_name: null,
            file_path: null,
            file_size: null,
            created_at: "2026-01-01",
            updated_at: "2026-03-01",
          },
          {
            id: "d2",
            owner_id: "u1",
            collection_id: "c1",
            doc_type: "tradeLicence",
            display_name: "Licence",
            expires_at: "2026-09-01",
            reminder_days: 30,
            status: "active",
            assigned_to: null,
            renewal_fee: null,
            notes: null,
            file_name: null,
            file_path: null,
            file_size: null,
            created_at: "2026-01-01",
            updated_at: "2026-04-01",
          },
        ],
        transactions: [
          {
            id: "t1",
            owner_id: "u1",
            collection_id: null,
            kind: "income",
            category: "sales",
            title: "Sale",
            amount: 5000,
            currency: "AED",
            occurred_at: "2026-09-05",
            note: null,
            document_id: null,
            created_at: "2026-09-05",
          },
          {
            id: "t2",
            owner_id: "u1",
            collection_id: null,
            kind: "expense",
            category: "rent",
            title: "Rent",
            amount: 2000,
            currency: "AED",
            occurred_at: "2026-09-01",
            note: null,
            document_id: null,
            created_at: "2026-09-01",
          },
          {
            id: "t3",
            owner_id: "u1",
            collection_id: null,
            kind: "expense",
            category: "rent",
            title: "Old rent",
            amount: 800,
            currency: "AED",
            occurred_at: "2026-08-01",
            note: null,
            document_id: null,
            created_at: "2026-08-01",
          },
        ],
      }),
      [],
      REF,
    );

    expect(users).toHaveLength(1);
    const u = users[0];
    expect(u.collectionsCount).toBe(2);
    expect(u.personalCollections).toBe(1);
    expect(u.companyCollections).toBe(1);
    expect(u.documentsCount).toBe(2);
    expect(u.urgentExpiries).toBe(1); // d1 expires in 5 days
    expect(u.expiredDocuments).toBe(1); // d2 expired Sep 1
    expect(u.incomeThisMonth).toBe(5000);
    expect(u.expensesThisMonth).toBe(2000);
    expect(u.incomeTotal).toBe(5000);
    expect(u.expensesTotal).toBe(2800);
    expect(u.netTotal).toBe(2200);
  });

  it("separates owners into distinct rows", () => {
    const users = computeUserSummaries(
      bundle({
        collections: [
          { id: "c1", owner_id: "u1", name: "A", is_personal: true, created_at: "2026-01-01" },
          { id: "c2", owner_id: "u2", name: "B", is_personal: false, created_at: "2026-02-01" },
        ],
      }),
      [],
      REF,
    );
    expect(users.map((u) => u.ownerId).sort()).toEqual(["u1", "u2"]);
  });

  it("attributes reminders to the document owner", () => {
    const users = computeUserSummaries(
      bundle({
        documents: [
          {
            id: "d1",
            owner_id: "u1",
            collection_id: null,
            doc_type: "passport",
            display_name: "P",
            expires_at: "2027-01-01",
            reminder_days: 30,
            status: "active",
            assigned_to: null,
            renewal_fee: null,
            notes: null,
            file_name: null,
            file_path: null,
            file_size: null,
            created_at: "2026-01-01",
            updated_at: "2026-01-01",
          },
        ],
        reminders: [
          { id: "r1", document_id: "d1", remind_at: "2026-12-01", channel: "push", sent_at: null, created_at: "2026-01-01" },
          { id: "r2", document_id: "d1", remind_at: "2026-12-02", channel: "email", sent_at: "2026-12-02", created_at: "2026-01-01" },
        ],
      }),
      [],
      REF,
    );
    expect(users[0].remindersCount).toBe(2);
  });
});
