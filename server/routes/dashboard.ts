import { Router } from "express";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler } from "../lib/http.ts";
import { accessibleProjectIds, assertProjectAccess } from "../lib/access.ts";
import { requireUser } from "../middleware/auth.ts";

export const dashboardRouter = Router();

function monthKey(d: Date) {
  return d.toISOString().slice(0, 7);
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleString("en-IN", { month: "short", year: "2-digit" });
}

function lastNMonths(n: number) {
  const keys: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKey(d));
  }
  return keys;
}

function agingBucket(days: number) {
  if (days <= 30) return "<30 days";
  if (days <= 60) return "31–60 days";
  if (days <= 90) return "61–90 days";
  return "90+ days";
}

function normalizeType(unitType?: string | null, configuration?: string | null) {
  const raw = (configuration || unitType || "Other").toUpperCase().replace(/\s+/g, "");
  if (raw.includes("1BHK") || raw.includes("1B")) return "1BHK";
  if (raw.includes("2BHK") || raw.includes("2B")) return "2BHK";
  if (raw.includes("3BHK") || raw.includes("3B")) return "3BHK";
  if (raw.includes("4BHK") || raw.includes("4B")) return "4BHK";
  return configuration || unitType || "Other";
}

type Fin = {
  agreement: number;
  gst: number;
  otherCharges: number;
  totalCost: number;
  gstOnAgreement: number;
  stampDutyRegistration: number;
  valueToBeCollected: number;
  finance: number;
} | null;

function sumFinancials(rows: { financials: Fin }[]) {
  return rows.reduce(
    (acc, b) => {
      const f = b.financials;
      if (!f) return acc;
      acc.agreement += f.agreement ?? 0;
      acc.gst += f.gst ?? 0;
      acc.otherCharges += f.otherCharges ?? 0;
      acc.totalCost += f.totalCost ?? 0;
      acc.gstOnAgreement += f.gstOnAgreement ?? 0;
      acc.stampDutyRegistration += f.stampDutyRegistration ?? 0;
      acc.valueToBeCollected += f.valueToBeCollected ?? 0;
      acc.finance += f.finance ?? 0;
      return acc;
    },
    {
      agreement: 0,
      gst: 0,
      otherCharges: 0,
      totalCost: 0,
      gstOnAgreement: 0,
      stampDutyRegistration: 0,
      valueToBeCollected: 0,
      finance: 0,
    },
  );
}

dashboardRouter.get(
  "/admin",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const projectIds = await accessibleProjectIds(user);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [companies, projects, units, bookings, partners, customers, schedules, recentBookings] =
      await Promise.all([
        prisma.company.count(),
        prisma.project.findMany({
          where: { id: { in: projectIds } },
          select: {
            id: true,
            name: true,
            location: true,
            status: true,
            photoUrl: true,
            company: { select: { name: true } },
          },
          orderBy: { name: "asc" },
        }),
        prisma.unit.findMany({
          where: { floor: { wing: { projectId: { in: projectIds } } } },
          select: {
            id: true,
            status: true,
            unitType: true,
            configuration: true,
            basePrice: true,
            saleableArea: true,
            carpetArea: true,
            floor: { select: { wing: { select: { projectId: true } } } },
          },
        }),
        prisma.booking.findMany({
          where: { projectId: { in: projectIds }, status: { not: "cancelled" } },
          include: {
            financials: true,
            entitlement: true,
            customers: { where: { role: "primary" }, take: 1 },
            unit: { select: { unitNumber: true, unitType: true, configuration: true } },
            project: { select: { id: true, name: true } },
          },
        }),
        prisma.channelPartner.findMany({
          where: { status: "active" },
          select: { id: true },
        }),
        prisma.customer.count({
          where: { booking: { projectId: { in: projectIds }, status: { not: "cancelled" } } },
        }),
        prisma.paymentSchedule.findMany({
          where: {
            booking: { projectId: { in: projectIds }, status: { not: "cancelled" } },
            outstanding: { gt: 0 },
          },
          select: { dueDate: true, outstanding: true, amount: true, received: true, name: true },
        }),
        prisma.booking.findMany({
          where: { projectId: { in: projectIds }, status: { not: "cancelled" } },
          include: {
            financials: true,
            customers: { where: { role: "primary" }, take: 1 },
            unit: { select: { unitNumber: true } },
            project: { select: { name: true } },
          },
          orderBy: { bookingDate: "desc" },
          take: 12,
        }),
      ]);

    const byStatus = (s: string) => units.filter((u) => u.status === s).length;
    const financials = sumFinancials(bookings);
    const collectionPct = financials.totalCost
      ? Math.round(((financials.totalCost - financials.valueToBeCollected) / financials.totalCost) * 1000) / 10
      : 0;
    const pendingPct = financials.totalCost
      ? Math.round((financials.valueToBeCollected / financials.totalCost) * 1000) / 10
      : 0;

    const months = lastNMonths(8);
    const trendMap = Object.fromEntries(
      months.map((m) => [m, { month: monthLabel(m), bookings: 0, dealValue: 0, received: 0, pending: 0 }]),
    ) as Record<
      string,
      { month: string; bookings: number; dealValue: number; received: number; pending: number }
    >;
    for (const b of bookings) {
      const key = monthKey(b.bookingDate);
      if (!trendMap[key]) continue;
      trendMap[key].bookings += 1;
      trendMap[key].dealValue += b.financials?.totalCost ?? 0;
      trendMap[key].received += (b.financials ? b.financials.totalCost - b.financials.valueToBeCollected : 0) ?? 0;
      trendMap[key].pending += b.financials?.valueToBeCollected ?? 0;
    }
    const collectionTrend = months.map((m) => trendMap[m]!);

    const typeMap = new Map<
      string,
      { type: string; total: number; sold: number; booked: number; available: number; hold: number; priceSum: number; priceCount: number }
    >();
    for (const u of units) {
      const type = normalizeType(u.unitType, u.configuration);
      const row = typeMap.get(type) ?? {
        type,
        total: 0,
        sold: 0,
        booked: 0,
        available: 0,
        hold: 0,
        priceSum: 0,
        priceCount: 0,
      };
      row.total += 1;
      if (u.status === "sold") row.sold += 1;
      else if (u.status === "booked") row.booked += 1;
      else if (u.status === "available") row.available += 1;
      else if (u.status === "hold") row.hold += 1;
      if (u.basePrice) {
        row.priceSum += u.basePrice;
        row.priceCount += 1;
      }
      typeMap.set(type, row);
    }
    const unitTypes = [...typeMap.values()]
      .map((r) => ({
        id: r.type,
        type: r.type,
        total: r.total,
        sold: r.sold,
        booked: r.booked,
        unsold: r.available + r.hold,
        available: r.available,
        hold: r.hold,
        soldPct: r.total ? Math.round(((r.sold + r.booked) / r.total) * 1000) / 10 : 0,
        avgPrice: r.priceCount ? Math.round(r.priceSum / r.priceCount) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const agingBuckets = ["<30 days", "31–60 days", "61–90 days", "90+ days"] as const;
    const agingMap = Object.fromEntries(agingBuckets.map((b) => [b, { bucket: b, amount: 0, count: 0 }])) as Record<
      string,
      { bucket: string; amount: number; count: number }
    >;
    for (const s of schedules) {
      const days = Math.max(0, Math.floor((now.getTime() - s.dueDate.getTime()) / 86_400_000));
      const bucket = agingBucket(days);
      agingMap[bucket]!.amount += s.outstanding;
      agingMap[bucket]!.count += 1;
    }
    const aging = agingBuckets.map((b) => agingMap[b]!);

    const projectStats = projects.map((p) => {
      const pUnits = units.filter((u) => u.floor.wing.projectId === p.id);
      const pBookings = bookings.filter((b) => b.projectId === p.id);
      const fin = sumFinancials(pBookings);
      return {
        id: p.id,
        name: p.name,
        company: p.company.name,
        location: p.location,
        status: p.status,
        photoUrl: p.photoUrl,
        units: pUnits.length,
        available: pUnits.filter((u) => u.status === "available").length,
        sold: pUnits.filter((u) => u.status === "sold").length,
        booked: pUnits.filter((u) => u.status === "booked").length,
        hold: pUnits.filter((u) => u.status === "hold").length,
        totalCost: fin.totalCost,
        finance: fin.finance,
        valueToBeCollected: fin.valueToBeCollected,
        collectionPct: fin.totalCost
          ? Math.round(((fin.totalCost - fin.valueToBeCollected) / fin.totalCost) * 1000) / 10
          : 0,
      };
    });

    const thisMonthBookings = bookings.filter((b) => b.bookingDate >= monthStart);
    const partnerOutstanding = bookings.reduce((s, b) => s + (b.entitlement?.outstanding ?? 0), 0);
    const partnerReceived = bookings.reduce((s, b) => s + (b.entitlement?.received ?? 0), 0);
    const partnerEntitlement = bookings.reduce((s, b) => s + (b.entitlement?.entitlementAmount ?? 0), 0);

    const area = {
      saleable: units.reduce((s, u) => s + (u.saleableArea ?? 0), 0),
      carpet: units.reduce((s, u) => s + (u.carpetArea ?? 0), 0),
      sold: units
        .filter((u) => u.status === "sold" || u.status === "booked")
        .reduce((s, u) => s + (u.saleableArea ?? 0), 0),
      unsold: units
        .filter((u) => u.status === "available" || u.status === "hold")
        .reduce((s, u) => s + (u.saleableArea ?? 0), 0),
    };

    res.json({
      kpis: {
        companies,
        projects: projects.length,
        units: units.length,
        available: byStatus("available"),
        sold: byStatus("sold"),
        booked: byStatus("booked"),
        hold: byStatus("hold"),
        blocked: byStatus("blocked"),
        customers,
        ...financials,
        collectionPct,
        pendingPct,
        partnerOutstanding,
        bookingsThisMonth: thisMonthBookings.length,
        bookingValueThisMonth: sumFinancials(thisMonthBookings).totalCost,
      },
      status: [
        { name: "Available", value: byStatus("available"), key: "available" },
        { name: "Sold", value: byStatus("sold"), key: "sold" },
        { name: "Booked", value: byStatus("booked"), key: "booked" },
        { name: "Hold", value: byStatus("hold"), key: "hold" },
        { name: "Blocked", value: byStatus("blocked"), key: "blocked" },
      ],
      unitTypes,
      collectionTrend,
      aging,
      area,
      projects: projectStats,
      recentBookings: recentBookings.map((b) => ({
        id: b.id,
        bookingNumber: b.bookingNumber,
        bookingDate: b.bookingDate,
        status: b.status,
        project: b.project.name,
        unit: b.unit.unitNumber,
        customer: b.customers[0]?.name ?? "—",
        totalCost: b.financials?.totalCost ?? 0,
        finance: b.financials?.finance ?? 0,
        valueToBeCollected: b.financials?.valueToBeCollected ?? 0,
      })),
      glance: {
        financial: financials,
        sales: {
          totalBookings: bookings.length,
          thisMonth: thisMonthBookings.length,
          dealValue: financials.totalCost,
          avgDeal: bookings.length ? Math.round(financials.totalCost / bookings.length) : 0,
        },
        inventory: {
          available: byStatus("available"),
          booked: byStatus("booked"),
          sold: byStatus("sold"),
          hold: byStatus("hold"),
          blocked: byStatus("blocked"),
        },
        partners: {
          active: partners.length,
          entitlement: partnerEntitlement,
          received: partnerReceived,
          outstanding: partnerOutstanding,
        },
      },
      // backward-compatible alias
      trend: collectionTrend.map((t) => ({ month: t.month, count: t.bookings })),
    });
  }),
);

dashboardRouter.get(
  "/project/:id",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const projectId = String(req.params.id);
    await assertProjectAccess(user, projectId);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [project, units, bookings, schedules, recentBookings] = await Promise.all([
      prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        include: { company: { select: { id: true, name: true } } },
      }),
      prisma.unit.findMany({
        where: { floor: { wing: { projectId } } },
        select: {
          status: true,
          unitType: true,
          configuration: true,
          basePrice: true,
          saleableArea: true,
          carpetArea: true,
        },
      }),
      prisma.booking.findMany({
        where: { projectId, status: { not: "cancelled" } },
        include: {
          financials: true,
          entitlement: true,
          customers: { where: { role: "primary" }, take: 1 },
          unit: { select: { unitNumber: true, unitType: true, configuration: true } },
        },
      }),
      prisma.paymentSchedule.findMany({
        where: { booking: { projectId, status: { not: "cancelled" } }, outstanding: { gt: 0 } },
        select: { dueDate: true, outstanding: true, name: true },
      }),
      prisma.booking.findMany({
        where: { projectId, status: { not: "cancelled" } },
        include: {
          financials: true,
          customers: { where: { role: "primary" }, take: 1 },
          unit: { select: { unitNumber: true } },
        },
        orderBy: { bookingDate: "desc" },
        take: 10,
      }),
    ]);

    const byStatus = (s: string) => units.filter((u) => u.status === s).length;
    const financials = sumFinancials(bookings);
    const collectionPct = financials.totalCost
      ? Math.round(((financials.totalCost - financials.valueToBeCollected) / financials.totalCost) * 1000) / 10
      : 0;
    const pendingPct = financials.totalCost
      ? Math.round((financials.valueToBeCollected / financials.totalCost) * 1000) / 10
      : 0;

    const months = lastNMonths(8);
    const trendMap = Object.fromEntries(
      months.map((m) => [m, { month: monthLabel(m), bookings: 0, dealValue: 0, received: 0, pending: 0 }]),
    ) as Record<
      string,
      { month: string; bookings: number; dealValue: number; received: number; pending: number }
    >;
    for (const b of bookings) {
      const key = monthKey(b.bookingDate);
      if (!trendMap[key]) continue;
      trendMap[key].bookings += 1;
      trendMap[key].dealValue += b.financials?.totalCost ?? 0;
      trendMap[key].received += (b.financials ? b.financials.totalCost - b.financials.valueToBeCollected : 0) ?? 0;
      trendMap[key].pending += b.financials?.valueToBeCollected ?? 0;
    }

    const typeMap = new Map<
      string,
      { type: string; total: number; sold: number; booked: number; available: number; hold: number; priceSum: number; priceCount: number }
    >();
    for (const u of units) {
      const type = normalizeType(u.unitType, u.configuration);
      const row = typeMap.get(type) ?? {
        type,
        total: 0,
        sold: 0,
        booked: 0,
        available: 0,
        hold: 0,
        priceSum: 0,
        priceCount: 0,
      };
      row.total += 1;
      if (u.status === "sold") row.sold += 1;
      else if (u.status === "booked") row.booked += 1;
      else if (u.status === "available") row.available += 1;
      else if (u.status === "hold") row.hold += 1;
      if (u.basePrice) {
        row.priceSum += u.basePrice;
        row.priceCount += 1;
      }
      typeMap.set(type, row);
    }

    const agingBuckets = ["<30 days", "31–60 days", "61–90 days", "90+ days"] as const;
    const agingMap = Object.fromEntries(agingBuckets.map((b) => [b, { bucket: b, amount: 0, count: 0 }])) as Record<
      string,
      { bucket: string; amount: number; count: number }
    >;
    for (const s of schedules) {
      const days = Math.max(0, Math.floor((now.getTime() - s.dueDate.getTime()) / 86_400_000));
      const bucket = agingBucket(days);
      agingMap[bucket]!.amount += s.outstanding;
      agingMap[bucket]!.count += 1;
    }

    const thisMonthBookings = bookings.filter((b) => b.bookingDate >= monthStart);

    res.json({
      project: {
        id: project.id,
        name: project.name,
        location: project.location,
        reraNumber: project.reraNumber,
        status: project.status,
        launchDate: project.launchDate,
        expectedCompletion: project.expectedCompletion,
        photoUrl: project.photoUrl,
        company: project.company,
      },
      kpis: {
        units: units.length,
        available: byStatus("available"),
        booked: byStatus("booked"),
        sold: byStatus("sold"),
        hold: byStatus("hold"),
        blocked: byStatus("blocked"),
        customers: bookings.reduce((s, b) => s + b.customers.length, 0),
        bookingValue: financials.totalCost,
        partnerOutstanding: bookings.reduce((s, b) => s + (b.entitlement?.outstanding ?? 0), 0),
        ...financials,
        collectionPct,
        pendingPct,
        bookingsThisMonth: thisMonthBookings.length,
      },
      status: [
        { name: "Available", value: byStatus("available"), key: "available" },
        { name: "Sold", value: byStatus("sold"), key: "sold" },
        { name: "Booked", value: byStatus("booked"), key: "booked" },
        { name: "Hold", value: byStatus("hold"), key: "hold" },
        { name: "Blocked", value: byStatus("blocked"), key: "blocked" },
      ],
      unitTypes: [...typeMap.values()]
        .map((r) => ({
          id: r.type,
          type: r.type,
          total: r.total,
          sold: r.sold,
          booked: r.booked,
          unsold: r.available + r.hold,
          available: r.available,
          hold: r.hold,
          soldPct: r.total ? Math.round(((r.sold + r.booked) / r.total) * 1000) / 10 : 0,
          avgPrice: r.priceCount ? Math.round(r.priceSum / r.priceCount) : 0,
        }))
        .sort((a, b) => b.total - a.total),
      collectionTrend: months.map((m) => trendMap[m]!),
      aging: agingBuckets.map((b) => agingMap[b]!),
      area: {
        saleable: units.reduce((s, u) => s + (u.saleableArea ?? 0), 0),
        carpet: units.reduce((s, u) => s + (u.carpetArea ?? 0), 0),
        sold: units
          .filter((u) => u.status === "sold" || u.status === "booked")
          .reduce((s, u) => s + (u.saleableArea ?? 0), 0),
        unsold: units
          .filter((u) => u.status === "available" || u.status === "hold")
          .reduce((s, u) => s + (u.saleableArea ?? 0), 0),
      },
      recentBookings: recentBookings.map((b) => ({
        id: b.id,
        bookingNumber: b.bookingNumber,
        bookingDate: b.bookingDate,
        status: b.status,
        unit: b.unit.unitNumber,
        customer: b.customers[0]?.name ?? "—",
        totalCost: b.financials?.totalCost ?? 0,
        finance: b.financials?.finance ?? 0,
        valueToBeCollected: b.financials?.valueToBeCollected ?? 0,
      })),
      glance: {
        financial: financials,
        sales: {
          totalBookings: bookings.length,
          thisMonth: thisMonthBookings.length,
          dealValue: financials.totalCost,
          avgDeal: bookings.length ? Math.round(financials.totalCost / bookings.length) : 0,
        },
        inventory: {
          available: byStatus("available"),
          booked: byStatus("booked"),
          sold: byStatus("sold"),
          hold: byStatus("hold"),
          blocked: byStatus("blocked"),
        },
      },
    });
  }),
);
