import { Router } from "express";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, listMeta, listResult } from "../lib/http.ts";
import { accessibleProjectIds, assertProjectAccess } from "../lib/access.ts";
import { round2 } from "../lib/commission.ts";
import { requireUser } from "../middleware/auth.ts";
import {
  bookingReportStatus,
  dealMetrics,
  endOfMonth,
  monthKey,
  monthLabel,
  nextUpcomingInstallment,
  parseMonthParam,
  primaryCustomer,
  startOfMonth,
  weekOfMonth,
  weekRange,
  weeksInMonth,
} from "../lib/reports.ts";

export const reportsRouter = Router();

async function projectScope(user: ReturnType<typeof requireUser>, projectId?: string | null) {
  const ids = await accessibleProjectIds(user);
  if (projectId) {
    await assertProjectAccess(user, projectId);
    return [projectId];
  }
  return ids;
}

reportsRouter.get(
  "/cashflow",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const projectId = req.query.projectId ? String(req.query.projectId) : null;
    const ids = await projectScope(user, projectId);
    const monthDate = parseMonthParam(req.query.month ? String(req.query.month) : null);
    const from = startOfMonth(monthDate);
    const to = endOfMonth(monthDate);
    const weekCount = weeksInMonth(from);

    const schedules = await prisma.paymentSchedule.findMany({
      where: {
        dueDate: { gte: from, lte: to },
        outstanding: { gt: 0 },
        status: { not: "paid" },
        booking: {
          projectId: { in: ids },
          status: { not: "cancelled" },
        },
      },
      include: {
        booking: {
          include: {
            customers: true,
            financials: true,
            unit: true,
            project: true,
            payments: {
              where: { appliesTo: "customer", status: { not: "pending" } },
              select: { amount: true, appliesTo: true, status: true },
            },
          },
        },
      },
      orderBy: [{ dueDate: "asc" }, { sortOrder: "asc" }],
    });

    const weeks = Array.from({ length: weekCount }, (_, i) => {
      const week = i + 1;
      const range = weekRange(from, week);
      const rows = schedules
        .filter((s) => weekOfMonth(s.dueDate) === week)
        .map((s) => {
          const customer = primaryCustomer(s.booking.customers);
          const metrics = dealMetrics(s.booking.financials, s.booking.payments);
          return {
            id: s.id,
            bookingId: s.booking.id,
            bookingNumber: s.booking.bookingNumber,
            customerName: customer?.name ?? "—",
            mobile: customer?.mobile ?? null,
            unit: s.booking.unit.unitNumber,
            project: s.booking.project.name,
            dealValue: metrics.dealValue,
            valuePaid: metrics.paid,
            upcomingInstallment: s.name,
            installmentAmount: round2(s.outstanding > 0 ? s.outstanding : s.amount),
            dueDate: s.dueDate,
            afterDays: s.afterDays,
            status: s.status,
          };
        });
      const totalExpected = round2(rows.reduce((sum, r) => sum + r.installmentAmount, 0));
      return {
        week,
        label: `Week ${week}`,
        rangeLabel: `${range.fromDay}–${range.toDay} ${monthLabel(from).split(" ")[0]}`,
        from: range.from,
        to: range.to,
        totalExpected,
        count: rows.length,
        rows,
      };
    });

    const expected = round2(weeks.reduce((s, w) => s + w.totalExpected, 0));
    const uniqueBookings = new Set(schedules.map((s) => s.bookingId)).size;

    res.json({
      month: monthKey(from),
      monthLabel: monthLabel(from),
      summary: {
        expected,
        installments: schedules.length,
        bookings: uniqueBookings,
        weeks: weekCount,
      },
      weeks,
    });
  }),
);

reportsRouter.get(
  "/bookings-detail",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const projectId = req.query.projectId ? String(req.query.projectId) : null;
    const ids = await projectScope(user, projectId);
    const { page, pageSize, skip, take } = listMeta(req);
    const status = req.query.status ? String(req.query.status) : null;
    const search = String(req.query.search ?? "").trim();

    const where = {
      projectId: { in: ids },
      ...(status && !["overdue", "fully_paid", "partial"].includes(status)
        ? { status }
        : { status: { not: "cancelled" as const } }),
      ...(search
        ? {
            OR: [
              { bookingNumber: { contains: search } },
              { unit: { unitNumber: { contains: search } } },
              { customers: { some: { name: { contains: search } } } },
            ],
          }
        : {}),
    };

    const [bookings, totalBase] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          customers: true,
          financials: true,
          unit: true,
          project: true,
          channelPartner: true,
          schedules: { orderBy: { sortOrder: "asc" } },
          payments: {
            where: { appliesTo: "customer", status: { not: "pending" } },
            select: { amount: true, appliesTo: true, status: true },
          },
        },
        orderBy: { bookingDate: "desc" },
      }),
      prisma.booking.count({ where }),
    ]);

    let rows = bookings.map((b) => {
      const customer = primaryCustomer(b.customers);
      const metrics = dealMetrics(b.financials, b.payments);
      const upcoming = nextUpcomingInstallment(b.schedules);
      const reportStatus = bookingReportStatus(b.status, b.schedules, metrics.paid, metrics.toCollect);
      const upcomingWeek =
        upcoming != null
          ? `W${weekOfMonth(upcoming.dueDate)} · ${monthLabel(upcoming.dueDate).split(" ")[0]}`
          : "—";
      return {
        id: b.id,
        bookingNumber: b.bookingNumber,
        customerName: customer?.name ?? "—",
        mobile: customer?.mobile ?? null,
        unit: b.unit.unitNumber,
        project: b.project.name,
        dealDate: b.bookingDate,
        dealValue: metrics.dealValue,
        valueToBeCollected: metrics.toCollect,
        paidValue: metrics.paid,
        outstanding: metrics.outstanding,
        collectionPct: metrics.collectionPct,
        upcomingInstallment: upcoming
          ? `${upcoming.name} · ₹${upcoming.outstanding.toLocaleString("en-IN")}`
          : "—",
        upcomingInstallmentName: upcoming?.name ?? null,
        upcomingInstallmentAmount: upcoming ? round2(upcoming.outstanding) : null,
        upcomingDueDate: upcoming?.dueDate ?? null,
        upcomingWeek,
        status: reportStatus,
        bookingStatus: b.status,
        partner: b.channelPartner?.name ?? null,
      };
    });

    if (status === "overdue" || status === "fully_paid" || status === "partial") {
      rows = rows.filter((r) => r.status === status);
    }

    const summary = {
      total: rows.length,
      dealValue: round2(rows.reduce((s, r) => s + r.dealValue, 0)),
      toCollect: round2(rows.reduce((s, r) => s + r.valueToBeCollected, 0)),
      paid: round2(rows.reduce((s, r) => s + r.paidValue, 0)),
      outstanding: round2(rows.reduce((s, r) => s + r.outstanding, 0)),
      overdue: rows.filter((r) => r.status === "overdue").length,
    };

    const pageRows = rows.slice(skip, skip + take);
    res.json({
      ...listResult(pageRows, status && ["overdue", "fully_paid", "partial"].includes(status) ? rows.length : totalBase, page, pageSize),
      summary,
    });
  }),
);

reportsRouter.get(
  "/collection-aging",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const projectId = req.query.projectId ? String(req.query.projectId) : null;
    const ids = await projectScope(user, projectId);
    const now = new Date();

    const schedules = await prisma.paymentSchedule.findMany({
      where: {
        outstanding: { gt: 0 },
        status: { not: "paid" },
        booking: { projectId: { in: ids }, status: { not: "cancelled" } },
      },
      include: {
        booking: {
          include: {
            customers: true,
            unit: true,
            project: true,
            financials: true,
            payments: {
              where: { appliesTo: "customer", status: { not: "pending" } },
              select: { amount: true, appliesTo: true, status: true },
            },
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    const buckets = {
      current: { label: "Not yet due", amount: 0, count: 0 },
      d0_30: { label: "1–30 days overdue", amount: 0, count: 0 },
      d31_60: { label: "31–60 days overdue", amount: 0, count: 0 },
      d61_90: { label: "61–90 days overdue", amount: 0, count: 0 },
      d90p: { label: "90+ days overdue", amount: 0, count: 0 },
    };

    const rows = schedules.map((s) => {
      const days = Math.floor((now.getTime() - s.dueDate.getTime()) / (24 * 60 * 60 * 1000));
      let bucket: keyof typeof buckets = "current";
      if (days > 90) bucket = "d90p";
      else if (days > 60) bucket = "d61_90";
      else if (days > 30) bucket = "d31_60";
      else if (days > 0) bucket = "d0_30";
      buckets[bucket].amount = round2(buckets[bucket].amount + s.outstanding);
      buckets[bucket].count += 1;
      const customer = primaryCustomer(s.booking.customers);
      const metrics = dealMetrics(s.booking.financials, s.booking.payments);
      return {
        id: s.id,
        bookingId: s.booking.id,
        bookingNumber: s.booking.bookingNumber,
        customerName: customer?.name ?? "—",
        unit: s.booking.unit.unitNumber,
        project: s.booking.project.name,
        installment: s.name,
        dueDate: s.dueDate,
        outstanding: round2(s.outstanding),
        daysOverdue: Math.max(0, days),
        bucket,
        dealValue: metrics.dealValue,
        valuePaid: metrics.paid,
      };
    });

    res.json({
      summary: {
        totalOutstanding: round2(rows.reduce((s, r) => s + r.outstanding, 0)),
        overdueOutstanding: round2(
          rows.filter((r) => r.daysOverdue > 0).reduce((s, r) => s + r.outstanding, 0),
        ),
        count: rows.length,
      },
      buckets: Object.entries(buckets).map(([key, v]) => ({ key, ...v })),
      data: rows,
    });
  }),
);

reportsRouter.get(
  "/partner-brokerage",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const projectId = req.query.projectId ? String(req.query.projectId) : null;
    const ids = await projectScope(user, projectId);

    const entitlements = await prisma.partnerEntitlement.findMany({
      where: {
        booking: { projectId: { in: ids }, status: { not: "cancelled" }, channelPartnerId: { not: null } },
      },
      include: {
        booking: {
          include: {
            channelPartner: true,
            unit: true,
            project: true,
            customers: true,
            financials: true,
          },
        },
        rule: true,
      },
      orderBy: { outstanding: "desc" },
    });

    const data = entitlements.map((e) => {
      const customer = primaryCustomer(e.booking.customers);
      return {
        id: e.id,
        bookingId: e.booking.id,
        bookingNumber: e.booking.bookingNumber,
        partner: e.booking.channelPartner?.name ?? "—",
        customerName: customer?.name ?? "—",
        unit: e.booking.unit.unitNumber,
        project: e.booking.project.name,
        dealValue: round2(e.booking.financials?.totalCost ?? 0),
        sharePct: e.entitlementPercent,
        entitlement: round2(e.entitlementAmount),
        received: round2(e.received),
        outstanding: round2(e.outstanding),
        status: e.outstanding <= 0.01 ? "settled" : e.received > 0 ? "partial" : "pending",
      };
    });

    res.json({
      summary: {
        partners: new Set(data.map((d) => d.partner)).size,
        entitlement: round2(data.reduce((s, r) => s + r.entitlement, 0)),
        received: round2(data.reduce((s, r) => s + r.received, 0)),
        outstanding: round2(data.reduce((s, r) => s + r.outstanding, 0)),
      },
      data,
    });
  }),
);

reportsRouter.get(
  "/inventory",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const projectId = req.query.projectId ? String(req.query.projectId) : null;
    const ids = await projectScope(user, projectId);
    const { page, pageSize, skip, take } = listMeta(req);

    const where = { floor: { wing: { projectId: { in: ids } } } };
    const [units, total] = await Promise.all([
      prisma.unit.findMany({
        where,
        skip,
        take,
        include: {
          floor: { include: { wing: { include: { project: true } } } },
        },
        orderBy: { unitNumber: "asc" },
      }),
      prisma.unit.count({ where }),
    ]);

    const allForSummary = await prisma.unit.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    });

    const data = units.map((u) => ({
      id: u.id,
      unitNumber: u.unitNumber,
      unitType: u.unitType,
      status: u.status,
      project: u.floor.wing.project.name,
      wing: u.floor.wing.name,
      floor: u.floor.number,
      basePrice: u.basePrice,
    }));

    res.json({
      ...listResult(data, total, page, pageSize),
      summary: {
        total,
        byStatus: Object.fromEntries(allForSummary.map((r) => [r.status, r._count._all])),
      },
    });
  }),
);

reportsRouter.get(
  "/payments",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const projectId = req.query.projectId ? String(req.query.projectId) : null;
    const ids = await projectScope(user, projectId);
    const { page, pageSize, skip, take } = listMeta(req);
    const appliesTo = req.query.appliesTo ? String(req.query.appliesTo) : null;

    const where = {
      booking: { projectId: { in: ids } },
      ...(appliesTo ? { appliesTo } : {}),
    };

    const [payments, total, agg] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take,
        include: {
          booking: {
            include: {
              project: true,
              unit: true,
              customers: true,
            },
          },
        },
        orderBy: { paymentDate: "desc" },
      }),
      prisma.payment.count({ where }),
      prisma.payment.aggregate({ where, _sum: { amount: true } }),
    ]);

    const data = payments.map((p) => {
      const customer = primaryCustomer(p.booking.customers);
      return {
        id: p.id,
        paymentDate: p.paymentDate,
        amount: p.amount,
        paymentMode: p.paymentMode,
        status: p.status,
        appliesTo: p.appliesTo,
        bookingNumber: p.booking.bookingNumber,
        bookingId: p.booking.id,
        customerName: customer?.name ?? "—",
        unit: p.booking.unit.unitNumber,
        project: p.booking.project.name,
      };
    });

    res.json({
      ...listResult(data, total, page, pageSize),
      summary: {
        total,
        amount: round2(agg._sum.amount ?? 0),
      },
    });
  }),
);

