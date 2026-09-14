type Tx = {
  invoice: { create: Function; count: Function };
};

export async function issueDocument(
  tx: Tx,
  input: {
    bookingId: string;
    kind: "invoice" | "receipt";
    amount: number;
    tax?: number;
    paymentId?: string | null;
    notes?: string | null;
  },
) {
  const year = new Date().getFullYear();
  const prefix = input.kind === "invoice" ? "INV" : "RCP";
  const count = await tx.invoice.count({
    where: { number: { startsWith: `${prefix}-${year}-` } },
  });
  const number = `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;
  return tx.invoice.create({
    data: {
      bookingId: input.bookingId,
      number,
      kind: input.kind,
      amount: input.amount,
      tax: input.tax ?? 0,
      status: "issued",
      paymentId: input.paymentId ?? null,
      notes: input.notes ?? null,
    },
  });
}
