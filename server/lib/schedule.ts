import { round2 } from "./commission.ts";

type Tx = {
  paymentSchedule: {
    createMany: Function;
    findMany: Function;
    update: Function;
    deleteMany: Function;
  };
  payment: {
    findMany: Function;
  };
  booking: {
    findUnique: Function;
  };
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
  const addDays = (d: Date, n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  const rows = [
    { name: "Booking amount", dueDate: start, amount: bookingAmt, sortOrder: 1 },
    { name: "Slab 1 — 10%", dueDate: addDays(start, 90), amount: thirds, sortOrder: 2 },
    { name: "Slab 2 — 40%", dueDate: addDays(start, 180), amount: thirds, sortOrder: 3 },
    { name: "Possession — balance", dueDate: addDays(start, 270), amount: last, sortOrder: 4 },
  ].filter((r) => r.amount > 0);

  await tx.paymentSchedule.createMany({
    data: rows.map((r) => ({
      bookingId: booking.id,
      name: r.name,
      dueDate: r.dueDate,
      amount: r.amount,
      received: 0,
      outstanding: r.amount,
      status: "pending",
      sortOrder: r.sortOrder,
    })),
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

/** Rebuild demand schedule from value-to-be-collected, then re-apply customer payments. */
export async function recomputeCustomerCollection(tx: Tx, bookingId: string) {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { financials: true },
  });
  if (!booking) return;

  await tx.paymentSchedule.deleteMany({ where: { bookingId } });
  await generateSchedules(tx, booking);

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
