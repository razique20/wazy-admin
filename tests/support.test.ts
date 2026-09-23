import { describe, expect, it } from "vitest";
import {
  SUPPORT_STATUSES,
  computeSupportStats,
  isValidSupportStatus,
  supportStatusVariant,
  supportTypeLabel,
} from "@/lib/support";
import type { SupportRequest } from "@/lib/types";

function row(overrides: Partial<SupportRequest>): SupportRequest {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    user_id: null,
    user_email: "user@example.com",
    request_type: "support_request",
    title: "Help",
    description: null,
    status: "open",
    admin_notes: null,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
    ...overrides,
  };
}

describe("support status validation", () => {
  it("accepts exactly the lifecycle values", () => {
    expect(SUPPORT_STATUSES).toEqual(["open", "in_progress", "resolved"]);
    for (const s of SUPPORT_STATUSES) expect(isValidSupportStatus(s)).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isValidSupportStatus("closed")).toBe(false);
    expect(isValidSupportStatus("OPEN")).toBe(false);
    expect(isValidSupportStatus(null)).toBe(false);
    expect(isValidSupportStatus(42)).toBe(false);
  });
});

describe("labels and badge variants", () => {
  it("maps statuses to human labels", () => {
    expect(supportTypeLabel("tracking_option_request")).toBe("Tracking Option");
    expect(supportTypeLabel("bug_report")).toBe("Bug Report");
    expect(supportTypeLabel("feature_request")).toBe("Feature Request");
    expect(supportTypeLabel("support_request")).toBe("Support");
  });

  it("falls back to Other / Unknown for unknown values", () => {
    expect(supportTypeLabel("something_new")).toBe("Other");
  });

  it("maps status to badge variants", () => {
    expect(supportStatusVariant("open")).toBe("warning");
    expect(supportStatusVariant("in_progress")).toBe("info");
    expect(supportStatusVariant("resolved")).toBe("success");
    expect(supportStatusVariant("weird")).toBe("neutral");
  });
});

describe("computeSupportStats", () => {
  it("counts statuses and types", () => {
    const requests = [
      row({ id: "1", status: "open", request_type: "bug_report" }),
      row({ id: "2", status: "open", request_type: "tracking_option_request" }),
      row({ id: "3", status: "in_progress", request_type: "feature_request" }),
      row({ id: "4", status: "resolved", request_type: "support_request" }),
      row({ id: "5", status: "open", request_type: "tracking_option_request" }),
    ];
    const stats = computeSupportStats(requests);
    expect(stats.total).toBe(5);
    expect(stats.open).toBe(3);
    expect(stats.inProgress).toBe(1);
    expect(stats.resolved).toBe(1);
    expect(stats.trackingRequests).toBe(2);
    expect(stats.bugReports).toBe(1);
    expect(stats.featureRequests).toBe(1);
    expect(stats.supportRequests).toBe(1);
  });

  it("returns zeros for an empty list", () => {
    const stats = computeSupportStats([]);
    expect(stats.total).toBe(0);
    expect(stats.open).toBe(0);
    expect(stats.trackingRequests).toBe(0);
  });
});
