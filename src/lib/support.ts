import type { SupportRequest, SupportStatus } from "@/lib/types";

/** Valid support ticket statuses, in lifecycle order. */
export const SUPPORT_STATUSES: readonly SupportStatus[] = ["open", "in_progress", "resolved"] as const;

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
};

export const SUPPORT_TYPE_LABELS: Record<string, string> = {
  tracking_option_request: "Tracking Option",
  feature_request: "Feature Request",
  bug_report: "Bug Report",
  support_request: "Support",
};

/** Allowed status transitions: open -> in_progress -> resolved (back-steps allowed). */
export function isValidSupportStatus(value: unknown): value is SupportStatus {
  return typeof value === "string" && (SUPPORT_STATUSES as readonly string[]).includes(value);
}

export function supportStatusLabel(status: string): string {
  return isValidSupportStatus(status) ? SUPPORT_STATUS_LABELS[status] : "Unknown";
}

export function supportTypeLabel(type: string): string {
  return SUPPORT_TYPE_LABELS[type] ?? "Other";
}

/** Badge variant for a ticket status. */
export function supportStatusVariant(status: string): "warning" | "info" | "success" | "neutral" {
  if (status === "open") return "warning";
  if (status === "in_progress") return "info";
  if (status === "resolved") return "success";
  return "neutral";
}

export interface SupportStats {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  trackingRequests: number;
  bugReports: number;
  featureRequests: number;
  supportRequests: number;
}

/** Aggregate counts used by the Support page and dashboard widgets. */
export function computeSupportStats(requests: SupportRequest[]): SupportStats {
  const stats: SupportStats = {
    total: requests.length,
    open: 0,
    inProgress: 0,
    resolved: 0,
    trackingRequests: 0,
    bugReports: 0,
    featureRequests: 0,
    supportRequests: 0,
  };
  for (const r of requests) {
    if (r.status === "open") stats.open += 1;
    else if (r.status === "in_progress") stats.inProgress += 1;
    else if (r.status === "resolved") stats.resolved += 1;
    if (r.request_type === "tracking_option_request") stats.trackingRequests += 1;
    else if (r.request_type === "bug_report") stats.bugReports += 1;
    else if (r.request_type === "feature_request") stats.featureRequests += 1;
    else if (r.request_type === "support_request") stats.supportRequests += 1;
  }
  return stats;
}
