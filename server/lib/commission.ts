type Slab = { min: number; max: number | null; rate: number };

export function computeEntitlement(
  rule: { type: string; value: number | null; slabConfig: string | null },
  totalCost: number,
) {
  if (rule.type === "percentage") {
    const percent = rule.value ?? 0;
    return { percent, amount: round2((totalCost * percent) / 100) };
  }
  if (rule.type === "flat_per_unit") {
    return { percent: null as number | null, amount: round2(rule.value ?? 0) };
  }
  const slabs: Slab[] = rule.slabConfig ? JSON.parse(rule.slabConfig) : [];
  const slab = slabs.find(
    (s) => totalCost >= s.min && (s.max == null || totalCost <= s.max),
  );
  const rate = slab?.rate ?? 0;
  return { percent: rate, amount: round2((totalCost * rate) / 100) };
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function recomputePartnerEntitlement(
  tx: {
    partnerEntitlement: {
      findUnique: Function;
      update: Function;
    };
    payment: { aggregate: Function };
  },
  bookingId: string,
) {
  const entitlement = await tx.partnerEntitlement.findUnique({
    where: { bookingId },
  });
  if (!entitlement) return null;
  const agg = await tx.payment.aggregate({
    where: {
      bookingId,
      appliesTo: "partner",
      status: { not: "pending" },
    },
    _sum: { amount: true },
  });
  const received = agg._sum.amount ?? 0;
  return tx.partnerEntitlement.update({
    where: { id: entitlement.id },
    data: {
      received,
      outstanding: round2(entitlement.entitlementAmount - received),
    },
  });
}
