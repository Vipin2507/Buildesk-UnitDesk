import { round2 } from "./commission.ts";

type Tx = {
  paymentSchedule: {
    createMany: Function;
    findMany: Function;
    update: Function;
    updateMany: Function;
    deleteMany: Function;
  };
  payment: {
    findMany: Function;
  };
  booking: {
    findUnique: Function;
  };
  reminder?: {
    createMany: Function;
    deleteMany: Function;
  };
};

export type InstallmentInput = {
  name: string;
  afterDays: number;
  amount: number;
};

export function collectableAmount(
  financials: { valueToBeCollected?: number | null; totalCost?: number | null; finance?: number | null } | null,
) {
  if (!financials) return 0;
  if (financials.valueToBeCollected != null && financials.valueToBeCollected > 0) {
    return round2(financials.valueToBeCollected);
  }
  const total = financials.totalCost ?? 0;
  const finance = financials.finance ?? 0;
  return round2(Math.max(0, total - finance));
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export async function generateSchedules(
  tx: Tx,
  booking: {
    id: string;
    bookingDate: Date;
    financials: { totalCost: number; valueToBeCollected: number; finance: number } | null;
  },
) {
  const collect = collectableAmount(booking.financials);
  if (collect <= 0) return;

  const bookingAmt = round2(collect * 0.2);
  const rest = Math.max(0, round2(collect - bookingAmt));
  const thirds = round2(rest / 3);
  const last = round2(rest - thirds * 2);
  const start = new Date(booking.bookingDate);
  const rows = [
    { name: "Booking amount", afterDays: 0, dueDate: start, amount: bookingAmt, sortOrder: 1 },
    { name: "Slab 1 — 10%", afterDays: 90, dueDate: addDays(start, 90), amount: thirds, sortOrder: 2 },
    { name: "Slab 2 — 40%", afterDays: 180, dueDate: addDays(start, 180), amount: thirds, sortOrder: 3 },
    { name: "Possession — balance", afterDays: 270, dueDate: addDays(start, 270), amount: last, sortOrder: 4 },
  ].filter((r) => r.amount > 0);

  await tx.paymentSchedule.createMany({
    data: rows.map((r) => ({
      bookingId: booking.id,
      name: r.name,
      afterDays: r.afterDays,
      dueDate: r.dueDate,
      amount: r.amount,
      received: 0,
      outstanding: r.amount,
      status: "pending",
      sortOrder: r.sortOrder,
    })),
  });
}

/** Create custom installment schedule from booking form (days after booking date). */
export async function createInstallmentSchedules(
  tx: Tx,
  booking: {
    id: string;
    bookingDate: Date;
    financials: { totalCost: number; valueToBeCollected: number; finance: number } | null;
  },
  installments: InstallmentInput[],
) {
  const collect = collectableAmount(booking.financials);
  const cleaned = installments
    .map((row, i) => ({
      name: (row.name || `Installment ${i + 1}`).trim(),
      afterDays: Math.max(0, Math.round(Number(row.afterDays) || 0)),
      amount: round2(Number(row.amount) || 0),
      sortOrder: i + 1,
    }))
    .filter((r) => r.amount > 0);

  if (!cleaned.length) {
    await generateSchedules(tx, booking);
    return;
  }

  const sum = round2(cleaned.reduce((s, r) => s + r.amount, 0));
  if (collect > 0 && Math.abs(sum - collect) > 1) {
    throw new Error(
      `Installment total ₹${sum.toLocaleString("en-IN")} must equal value to be collected ₹${collect.toLocaleString("en-IN")}`,
    );
  }

  const start = new Date(booking.bookingDate);
  await tx.paymentSchedule.createMany({
    data: cleaned.map((r) => ({
      bookingId: booking.id,
      name: r.name,
      afterDays: r.afterDays,
      dueDate: addDays(start, r.afterDays),
      amount: r.amount,
      received: 0,
      outstanding: r.amount,
      status: "pending",
      sortOrder: r.sortOrder,
    })),
  });
}

/** Schedule payment_due reminders for each installment due date. */
export async function syncInstallmentReminders(
  tx: Tx,
  input: {
    bookingId: string;
    projectId: string;
    bookingNumber: string;
    customerName?: string | null;
  },
) {
  if (!tx.reminder) return;

  const schedules = await tx.paymentSchedule.findMany({
    where: { bookingId: input.bookingId },
    orderBy: { sortOrder: "asc" },
  });

  await tx.reminder.deleteMany({
    where: { bookingId: input.bookingId, type: "payment_due" },
  });

  if (!schedules.length) return;

  const customer = input.customerName?.trim() || "customer";
  await tx.reminder.createMany({
    data: schedules.map(
      (s: { name: string; dueDate: Date; amount: number; afterDays: number | null }) => ({
        bookingId: input.bookingId,
        projectId: input.projectId,
        type: "payment_due",
        channel: "in_app",
        title: `${s.name} due — ${input.bookingNumber}`,
        message: `${s.name} of ₹${Number(s.amount).toLocaleString("en-IN")} for ${customer} on ${input.bookingNumber} is due${
          s.afterDays != null ? ` (${s.afterDays} days after booking)` : ""
        }.`,
        dueAt: s.dueDate,
        status: "scheduled",
      }),
    ),
  });
}

export async function applyCustomerPayment(tx: Tx, bookingId: string, amount: number) {
  const items = await tx.paymentSchedule.findMany({
    where: { bookingId, status: { not: "paid" } },
    orderBy: { sortOrder: "asc" },
  });
  let remaining = amount;
  const now = new Date();
  for (const item of items) {
    if (remaining <= 0) break;
    const take = Math.min(item.outstanding, remaining);
    const received = round2(item.received + take);
    const outstanding = round2(item.amount - received);
    let status = outstanding <= 0 ? "paid" : "partial";
    if (outstanding > 0 && item.dueDate < now) status = "overdue";
    await tx.paymentSchedule.update({
      where: { id: item.id },
      data: { received, outstanding, status },
    });
    remaining = round2(remaining - take);
  }
}

/** Re-apply customer payments onto existing installment rows (preserves custom breakup). */
export async function recomputeCustomerCollection(tx: Tx, bookingId: string) {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { financials: true },
  });
  if (!booking) return;

  const existing = await tx.paymentSchedule.findMany({
    where: { bookingId },
    orderBy: { sortOrder: "asc" },
  });

  if (existing.length) {
    for (const row of existing) {
      await tx.paymentSchedule.update({
        where: { id: row.id },
        data: {
          received: 0,
          outstanding: row.amount,
          status: "pending",
        },
      });
    }
  } else {
    await generateSchedules(tx, booking);
  }

  const payments = await tx.payment.findMany({
    where: {
      bookingId,
      appliesTo: "customer",
      status: { not: "pending" },
    },
    orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
  });
  for (const payment of payments) {
    await applyCustomerPayment(tx, bookingId, payment.amount);
  }
}

export async function customerCollectionSummary(
  tx: { payment: { findMany: Function }; booking: { findUnique: Function } },
  bookingId: string,
) {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { financials: true },
  });
  const toCollect = collectableAmount(booking?.financials ?? null);
  const payments = await tx.payment.findMany({
    where: {
      bookingId,
      appliesTo: "customer",
      status: { not: "pending" },
    },
  });
  const received = round2(payments.reduce((s: number, p: { amount: number }) => s + p.amount, 0));
  const outstanding = round2(Math.max(0, toCollect - received));
  return { toCollect, received, outstanding };
}

export function markOverdueStatus(dueDate: Date, outstanding: number, status: string) {
  if (outstanding > 0 && dueDate < new Date() && status !== "paid") return "overdue";
  return status;
}
