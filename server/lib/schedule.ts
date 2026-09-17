import { round2 } from "./commission.ts";

type Tx = {
  paymentSchedule: {
    createMany: Function;
    findMany: Function;
    update: Function;
  };
};

export async function generateSchedules(
  tx: Tx,
  booking: {
    id: string;
    bookingDate: Date;
    financials: { totalCost: number; valueToBeCollected: number; finance: number } | null;
  },
) {
  const total = booking.financials?.totalCost ?? 0;
  const finance = booking.financials?.finance ?? 0;
  const bookingAmt =
    finance > 0
      ? round2(Math.max(0, total - finance))
      : booking.financials?.valueToBeCollected
        ? round2(Math.min(booking.financials.valueToBeCollected, total * 0.2))
        : round2(total * 0.2);
  const rest = Math.max(0, round2(total - bookingAmt));
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

export function markOverdueStatus(dueDate: Date, outstanding: number, status: string) {
  if (outstanding > 0 && dueDate < new Date() && status !== "paid") return "overdue";
  return status;
}
