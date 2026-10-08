import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, HttpError, listMeta, listResult } from "../lib/http.ts";
import { accessibleProjectIds, assertProjectAccess, requirePermission } from "../lib/access.ts";
import { round2 } from "../lib/commission.ts";
import { audit } from "../lib/audit.ts";
import { requireUser } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";
import {
  bookingReportStatus,
  dealMetrics,
  endOfMonth,
  monthKey,
  monthLabel,
  nextUpcomingInstallment,
  parseDayParam,
  parseMonthParam,
  parsePctParam,
  primaryCustomer,
  startOfMonth,
  weekOfMonth,
  weekRange,
  weeksInMonth,
} from "../lib/reports.ts";

export const reportsRouter = Router();

type ReportPreset = {
  id: string;
  name: string;
  kind: string;
  filters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function presetKey(userId: string) {
  return `reportPresets:${userId}`;
}

async function loadPresets(userId: string): Promise<ReportPreset[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: presetKey(userId) } });
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value) as ReportPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function savePresets(userId: string, presets: ReportPreset[]) {
  await prisma.appSetting.upsert({
    where: { key: presetKey(userId) },
    update: { value: JSON.stringify(presets) },
    create: { key: presetKey(userId), value: JSON.stringify(presets) },
  });
}

async function projectScope(user: ReturnType<typeof requireUser>, projectId?: string | null) {
  const ids = await accessibleProjectIds(user);
  if (projectId) {
    await assertProjectAccess(user, projectId);
    return [projectId];
  }
  return ids;
}

reportsRouter.get(
  "/presets",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const data = await loadPresets(user.id);
    res.json({ data, total: data.length, page: 1, pageSize: data.length });
  }),
);

reportsRouter.post(
  "/presets",
  validate(
    z.object({
      name: z.string().min(2).max(80),
      kind: z.string().min(2),
      filters: z.record(z.string(), z.unknown()).default({}),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "view");
    const body = req.body as { name: string; kind: string; filters: Record<string, unknown> };
    const presets = await loadPresets(user.id);
    const now = new Date().toISOString();
    const created: ReportPreset = {
      id: crypto.randomUUID(),
      name: body.name.trim(),
      kind: body.kind,
      filters: body.filters ?? {},
      createdAt: now,
      updatedAt: now,
    };
    presets.unshift(created);
    await savePresets(user.id, presets.slice(0, 50));
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "report_preset.create",
      entityType: "report_preset",
      entityId: created.id,
      meta: { name: created.name, kind: created.kind },
    });
    res.status(201).json(created);
  }),
);

reportsRouter.patch(
  "/presets/:id",
  validate(
    z.object({
      name: z.string().min(2).max(80).optional(),
      kind: z.string().min(2).optional(),
      filters: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "view");
    const id = String(req.params.id);
    const presets = await loadPresets(user.id);
    const idx = presets.findIndex((p) => p.id === id);
    if (idx < 0) throw new HttpError(404, "Saved report not found");
    const body = req.body as Partial<ReportPreset>;
    presets[idx] = {
      ...presets[idx],
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.kind !== undefined ? { kind: body.kind } : {}),
      ...(body.filters !== undefined ? { filters: body.filters } : {}),
      updatedAt: new Date().toISOString(),
    };
    await savePresets(user.id, presets);
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "report_preset.update",
      entityType: "report_preset",
      entityId: id,
    });
    res.json(presets[idx]);
  }),
);

reportsRouter.delete(
  "/presets/:id",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "view");
    const id = String(req.params.id);
    const presets = await loadPresets(user.id);
    const next = presets.filter((p) => p.id !== id);
    if (next.length === presets.length) throw new HttpError(404, "Saved report not found");
    await savePresets(user.id, next);
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "report_preset.delete",
      entityType: "report_preset",
      entityId: id,
    });
    res.json({ ok: true });
  }),
);

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
      chart: weeks.map((w) => ({
        name: w.label,
        expected: w.totalExpected,
        count: w.count,
      })),
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
    const fromDate = parseDayParam(req.query.fromDate ? String(req.query.fromDate) : null);
    const toDate = parseDayParam(req.query.toDate ? String(req.query.toDate) : null, true);
    const minPct = parsePctParam(req.query.minPct ? String(req.query.minPct) : null);
    const maxPct = parsePctParam(req.query.maxPct ? String(req.query.maxPct) : null);

    const where = {
      projectId: { in: ids },
      ...(status && !["overdue", "fully_paid", "partial"].includes(status)
        ? { status }
        : { status: { not: "cancelled" as const } }),
      ...(fromDate || toDate
        ? {
            bookingDate: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
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
    if (minPct != null) rows = rows.filter((r) => r.collectionPct >= minPct);
    if (maxPct != null) rows = rows.filter((r) => r.collectionPct <= maxPct);

    const summary = {
      total: rows.length,
      dealValue: round2(rows.reduce((s, r) => s + r.dealValue, 0)),
      toCollect: round2(rows.reduce((s, r) => s + r.valueToBeCollected, 0)),
      paid: round2(rows.reduce((s, r) => s + r.paidValue, 0)),
      outstanding: round2(rows.reduce((s, r) => s + r.outstanding, 0)),
      overdue: rows.filter((r) => r.status === "overdue").length,
      avgCollectionPct:
        rows.length > 0
          ? round2(rows.reduce((s, r) => s + r.collectionPct, 0) / rows.length)
          : 0,
    };

    const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});

    const pageRows = rows.slice(skip, skip + take);
    const filteredTotal =
      (status && ["overdue", "fully_paid", "partial"].includes(status)) ||
      minPct != null ||
      maxPct != null
        ? rows.length
        : totalBase;

    res.json({
      ...listResult(pageRows, filteredTotal, page, pageSize),
      summary,
      chart: {
        status: Object.entries(byStatus).map(([name, value]) => ({ name, value })),
        collection: [
          { name: "Paid", value: summary.paid },
          { name: "Outstanding", value: summary.outstanding },
        ],
      },
    });
  }),
);

reportsRouter.get(
  "/collection-aging",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const projectId = req.query.projectId ? String(req.query.projectId) : null;
    const ids = await projectScope(user, projectId);
    const bucketFilter = req.query.bucket ? String(req.query.bucket) : null;
    const fromDate = parseDayParam(req.query.fromDate ? String(req.query.fromDate) : null);
    const toDate = parseDayParam(req.query.toDate ? String(req.query.toDate) : null, true);
    const now = new Date();

    const schedules = await prisma.paymentSchedule.findMany({
      where: {
        outstanding: { gt: 0 },
        status: { not: "paid" },
        ...(fromDate || toDate
          ? {
              dueDate: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
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

    let rows = schedules.map((s) => {
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

    if (bucketFilter) rows = rows.filter((r) => r.bucket === bucketFilter);

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
      chart: Object.entries(buckets).map(([key, v]) => ({
        key,
        name: v.label,
        amount: v.amount,
        count: v.count,
      })),
    });
  }),
);

reportsRouter.get(
  "/partner-brokerage",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const projectId = req.query.projectId ? String(req.query.projectId) : null;
    const ids = await projectScope(user, projectId);
    const status = req.query.status ? String(req.query.status) : null;
    const minPct = parsePctParam(req.query.minPct ? String(req.query.minPct) : null);

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

    let data = entitlements.map((e) => {
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

    if (status) data = data.filter((d) => d.status === status);
    if (minPct != null) data = data.filter((d) => (d.sharePct ?? 0) >= minPct);

    const byPartner = data.reduce<Record<string, { entitlement: number; received: number; outstanding: number }>>(
      (acc, r) => {
        const cur = acc[r.partner] ?? { entitlement: 0, received: 0, outstanding: 0 };
        cur.entitlement += r.entitlement;
        cur.received += r.received;
        cur.outstanding += r.outstanding;
        acc[r.partner] = cur;
        return acc;
      },
      {},
    );

    res.json({
      summary: {
        partners: new Set(data.map((d) => d.partner)).size,
        entitlement: round2(data.reduce((s, r) => s + r.entitlement, 0)),
        received: round2(data.reduce((s, r) => s + r.received, 0)),
        outstanding: round2(data.reduce((s, r) => s + r.outstanding, 0)),
      },
      data,
      chart: Object.entries(byPartner)
        .map(([name, v]) => ({
          name,
          entitlement: round2(v.entitlement),
          received: round2(v.received),
          outstanding: round2(v.outstanding),
        }))
        .sort((a, b) => b.entitlement - a.entitlement)
        .slice(0, 12),
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
    const status = req.query.status ? String(req.query.status) : null;
    const unitType = req.query.unitType ? String(req.query.unitType) : null;

    const where = {
      floor: { wing: { projectId: { in: ids } } },
      ...(status ? { status } : {}),
      ...(unitType ? { unitType } : {}),
    };
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
      where: { floor: { wing: { projectId: { in: ids } } }, ...(unitType ? { unitType } : {}) },
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

    const byStatus = Object.fromEntries(allForSummary.map((r) => [r.status, r._count._all]));

    res.json({
      ...listResult(data, total, page, pageSize),
      summary: {
        total: Object.values(byStatus).reduce((s, n) => s + n, 0),
        byStatus,
      },
      chart: Object.entries(byStatus).map(([name, value]) => ({ name, value })),
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
    const status = req.query.status ? String(req.query.status) : null;
    const paymentMode = req.query.paymentMode ? String(req.query.paymentMode) : null;
    const fromDate = parseDayParam(req.query.fromDate ? String(req.query.fromDate) : null);
    const toDate = parseDayParam(req.query.toDate ? String(req.query.toDate) : null, true);

    const where = {
      booking: { projectId: { in: ids } },
      ...(appliesTo ? { appliesTo } : {}),
      ...(status ? { status } : {}),
      ...(paymentMode ? { paymentMode } : {}),
      ...(fromDate || toDate
        ? {
            paymentDate: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    };

    const [payments, total, agg, byMode, byDay] = await Promise.all([
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
      prisma.payment.groupBy({
        by: ["paymentMode"],
        where,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.payment.findMany({
        where,
        select: { paymentDate: true, amount: true },
        orderBy: { paymentDate: "asc" },
        take: 2000,
      }),
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

    const dayMap = new Map<string, number>();
    for (const p of byDay) {
      const key = p.paymentDate.toISOString().slice(0, 10);
      dayMap.set(key, round2((dayMap.get(key) ?? 0) + p.amount));
    }

    res.json({
      ...listResult(data, total, page, pageSize),
      summary: {
        total,
        amount: round2(agg._sum.amount ?? 0),
      },
      chart: {
        byMode: byMode.map((m) => ({
          name: m.paymentMode.toUpperCase(),
          value: round2(m._sum.amount ?? 0),
          count: m._count._all,
        })),
        byDay: [...dayMap.entries()].map(([name, value]) => ({ name, value })),
      },
    });
  }),
);
