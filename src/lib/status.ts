export type UnitStatus =
  | "available"
  | "hold"
  | "booked"
  | "sold"
  | "blocked"
  | "not_available";

export const UNIT_STATUSES: UnitStatus[] = [
  "available",
  "hold",
  "booked",
  "sold",
  "blocked",
  "not_available",
];

export const statusTone: Record<
  string,
  "muted" | "info" | "success" | "warning" | "danger"
> = {
  available: "success",
  active: "success",
  verified: "success",
  reconciled: "success",
  confirmed: "success",
  received: "success",
  sold: "danger",
  cancelled: "danger",
  inactive: "muted",
  hold: "warning",
  pending: "warning",
  upcoming: "info",
  booked: "info",
  blocked: "info",
  completed: "muted",
  not_available: "muted",
  overdue: "danger",
  scheduled: "info",
  sent: "success",
  paid: "success",
  partial: "warning",
  issued: "info",
  approved: "success",
  rejected: "danger",
  draft: "muted",
  new: "info",
  contacted: "info",
  site_visit: "warning",
  skipped: "muted",
  failed: "danger",
};

export const statusLabel: Record<string, string> = {
  available: "Available",
  hold: "Hold",
  booked: "Booked",
  sold: "Sold",
  blocked: "Blocked",
  not_available: "Not released",
  active: "Active",
  inactive: "Inactive",
  upcoming: "Upcoming",
  completed: "Completed",
  cancelled: "Cancelled",
  confirmed: "Confirmed",
  pending: "Pending",
  received: "Received",
  verified: "Verified",
  reconciled: "Reconciled",
  overdue: "Overdue",
  scheduled: "Scheduled",
  sent: "Sent",
  paid: "Paid",
  partial: "Partial",
  issued: "Issued",
  approved: "Approved",
  rejected: "Rejected",
  draft: "Draft",
  new: "New",
  contacted: "Contacted",
  site_visit: "Site visit",
  skipped: "Skipped",
  failed: "Failed",
};

export const statusDotClass: Record<string, string> = {
  available: "bg-status-available",
  sold: "bg-status-sold",
  booked: "bg-status-booked",
  hold: "bg-status-hold",
  blocked: "bg-status-blocked",
  not_available: "bg-status-unavailable",
};

export const statusCellClass: Record<string, string> = {
  available:
    "bg-success/12 text-success border-success/25 hover:bg-success/20",
  sold: "bg-destructive/12 text-destructive border-destructive/25 hover:bg-destructive/20",
  booked: "bg-primary/12 text-primary border-primary/25 hover:bg-primary/20",
  hold: "bg-warning/15 text-warning-foreground border-warning/30 hover:bg-warning/25",
  blocked: "bg-primary/10 text-primary border-primary/20 hover:bg-primary/16",
  not_available:
    "bg-muted text-muted-foreground border-border hover:bg-muted/80",
};
