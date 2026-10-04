import { round2 } from "./commission.ts";
import { collectableAmount } from "./schedule.ts";

export function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function parseMonthParam(raw?: string | null) {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(d: Date) {
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/** Week index 1–5 within a calendar month (1–7, 8–14, 15–21, 22–28, 29–end). */
export function weekOfMonth(d: Date) {
  const day = d.getDate();
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  if (day <= 28) return 4;
  return 5;
}

export function weekRange(monthStart: Date, week: number) {
  const y = monthStart.getFullYear();
  const m = monthStart.getMonth();
  const lastDay = endOfMonth(monthStart).getDate();
  const fromDay = (week - 1) * 7 + 1;
  const toDay = Math.min(week * 7, lastDay);
  return {
    from: new Date(y, m, fromDay, 0, 0, 0, 0),
    to: new Date(y, m, toDay, 23, 59, 59, 999),
    fromDay,
    toDay,
  };
}

export function weeksInMonth(monthStart: Date) {
  const last = endOfMonth(monthStart).getDate();
  return last > 28 ? 5 : 4;
}

export function primaryCustomer(
  customers: { name: string; role: string; mobile?: string }[],
) {
  return customers.find((c) => c.role === "primary") ?? customers[0] ?? null;
}

export function customerPaid(
  payments: { amount: number; appliesTo: string; status: string }[],
) {
  return round2(
    payments
      .filter((p) => p.appliesTo === "customer" && p.status !== "pending")
      .reduce((s, p) => s + p.amount, 0),
  );
}

export function nextUpcomingInstallment(
  schedules: {
    id: string;
    name: string;
    dueDate: Date;
    amount: number;
    outstanding: number;
    status: string;
    afterDays?: number | null;
  }[],
  from = new Date(),
) {
  const open = schedules
    .filter((s) => s.outstanding > 0.01 && s.status !== "paid")
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  const upcoming = open.find((s) => s.dueDate >= startOfDay(from)) ?? open[0] ?? null;
  return upcoming;
}

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function bookingReportStatus(
  status: string,
  schedules: { outstanding: number; dueDate: Date; status: string }[],
  paid: number,
  toCollect: number,
) {
  if (status === "cancelled") return "cancelled";
  if (toCollect > 0 && paid + 0.5 >= toCollect) return "fully_paid";
  const now = new Date();
  const hasOverdue = schedules.some(
    (s) => s.outstanding > 0.01 && s.dueDate < now && s.status !== "paid",
  );
  if (hasOverdue) return "overdue";
  if (paid > 0 && paid < toCollect) return "partial";
  return status;
}

export function dealMetrics(
  financials: {
    totalCost?: number | null;
    valueToBeCollected?: number | null;
    finance?: number | null;
  } | null,
  payments: { amount: number; appliesTo: string; status: string }[],
) {
  const dealValue = round2(financials?.totalCost ?? 0);
  const toCollect = collectableAmount(financials);
  const paid = customerPaid(payments);
  const outstanding = round2(Math.max(0, toCollect - paid));
  return {
    dealValue,
    toCollect,
    paid,
    outstanding,
    collectionPct: toCollect ? Math.round((paid / toCollect) * 1000) / 10 : 0,
  };
}
