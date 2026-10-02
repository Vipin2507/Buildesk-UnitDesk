import { Router } from "express";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, listMeta, listResult } from "../lib/http.ts";
import { accessibleProjectIds, assertProjectAccess } from "../lib/access.ts";
import { round2 } from "../lib/commission.ts";
import { collectableAmount } from "../lib/schedule.ts";
import { requireUser } from "../middleware/auth.ts";

export const customersRouter = Router();

customersRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const projectIds = await accessibleProjectIds(user);
    const projectId = req.query.projectId ? String(req.query.projectId) : null;
    if (projectId) await assertProjectAccess(user, projectId);

    const bookingWhere = {
      status: { not: "cancelled" as const },
      projectId: projectId ? projectId : { in: projectIds },
    };

    const [customers, bookings, payments] = await Promise.all([
      prisma.customer.findMany({
        where: { booking: bookingWhere },
        include: {
          booking: { select: { bookingDate: true, status: true } },
        },
      }),
      prisma.booking.findMany({
        where: bookingWhere,
        include: { financials: true },
      }),
      prisma.payment.findMany({
        where: {
          booking: bookingWhere,
          appliesTo: "customer",
          status: { not: "pending" },
        },
      }),
    ]);

    const primary = customers.filter((c) => c.role === "primary");
    const coApplicants = customers.filter((c) => c.role === "co_applicant");
    const uniqueMobiles = new Set(primary.map((c) => c.mobile.replace(/\D/g, "")).filter(Boolean));

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const thisMonth = primary.filter((c) => c.booking.bookingDate >= monthStart).length;

    const toCollect = round2(bookings.reduce((s, b) => s + collectableAmount(b.financials), 0));
    const received = round2(payments.reduce((s, p) => s + p.amount, 0));
    const outstanding = round2(Math.max(0, toCollect - received));

    res.json({
      total: customers.length,
      primary: primary.length,
      coApplicants: coApplicants.length,
      uniqueBuyers: uniqueMobiles.size,
      withEmail: customers.filter((c) => Boolean(c.email?.trim())).length,
      withPan: customers.filter((c) => Boolean(c.pan?.trim())).length,
      thisMonth,
      toCollect,
      received,
      outstanding,
      collectionPct: toCollect ? Math.round((received / toCollect) * 1000) / 10 : 0,
    });
  }),
);

customersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const ids = await accessibleProjectIds(user);
    const { page, pageSize, skip, take } = listMeta(req);
    const search = String(req.query.search ?? "").trim();
    const role = req.query.role ? String(req.query.role) : null;
    const projectId = req.query.projectId ? String(req.query.projectId) : null;
    const unitQ = String(req.query.unit ?? "").trim();
    const status = req.query.status ? String(req.query.status) : null;
    const thisMonth = req.query.thisMonth === "1" || req.query.thisMonth === "true";
    const minCollectedRaw = req.query.minCollected;
    const minCollected =
      minCollectedRaw != null && String(minCollectedRaw).trim() !== ""
        ? Number(minCollectedRaw)
        : null;
    const useCollectedFilter = minCollected != null && !Number.isNaN(minCollected) && minCollected > 0;
    const sort = String(req.query.sort ?? "name");
    const dirAsc = String(req.query.dir ?? "asc") !== "desc";
    const dirConst = (dirAsc ? "asc" : "desc") as "asc" | "desc";

    if (projectId) await assertProjectAccess(user, projectId);

    let monthFrom: Date | undefined;
    if (thisMonth) {
      monthFrom = new Date();
      monthFrom.setDate(1);
      monthFrom.setHours(0, 0, 0, 0);
    }

    const andFilters: object[] = [];
    if (search) {
      const compact = search.replace(/[\s_-]/g, "");
      const searchOr: object[] = [
        { name: { contains: search } },
        { mobile: { contains: search } },
        { email: { contains: search } },
        { pan: { contains: search } },
        { booking: { bookingNumber: { contains: search } } },
        { booking: { unit: { unitNumber: { contains: search } } } },
        { booking: { project: { name: { contains: search } } } },
      ];
      if (compact && compact.toLowerCase() !== search.toLowerCase()) {
        searchOr.push({ booking: { unit: { unitNumber: { contains: compact } } } });
      }
      andFilters.push({ OR: searchOr });
    }
    if (unitQ) {
      const compact = unitQ.replace(/[\s_-]/g, "");
      const unitOr: object[] = [{ booking: { unit: { unitNumber: { contains: unitQ } } } }];
      if (compact && compact !== unitQ) {
        unitOr.push({ booking: { unit: { unitNumber: { contains: compact } } } });
      }
      andFilters.push({ OR: unitOr });
    }

    const where = {
      ...(role ? { role } : {}),
      booking: {
        projectId: projectId ? projectId : { in: ids },
        status: status ? status : { not: "cancelled" as const },
        ...(monthFrom ? { bookingDate: { gte: monthFrom } } : {}),
      },
      ...(andFilters.length ? { AND: andFilters } : {}),
    };

    const orderBy =
      sort === "date"
        ? { booking: { bookingDate: dirConst } }
        : sort === "unit"
          ? { booking: { unit: { unitNumber: dirConst } } }
          : sort === "booking"
            ? { booking: { bookingNumber: dirConst } }
            : sort === "mobile"
              ? { mobile: dirConst }
              : { name: dirConst };

    const [rows, totalBase] = await Promise.all([
      prisma.customer.findMany({
        where,
        ...(useCollectedFilter ? {} : { skip, take }),
        orderBy,
        include: {
          booking: {
            include: {
              unit: true,
              project: true,
              financials: true,
              payments: {
                where: { appliesTo: "customer", status: { not: "pending" } },
                select: { amount: true },
              },
            },
          },
        },
      }),
      useCollectedFilter ? Promise.resolve(0) : prisma.customer.count({ where }),
    ]);

    let data = rows.map((c) => {
      const toCollect = collectableAmount(c.booking.financials);
      const received = round2(c.booking.payments.reduce((s, p) => s + p.amount, 0));
      const outstanding = round2(Math.max(0, toCollect - received));
      const collectionPct = toCollect ? Math.round((received / toCollect) * 1000) / 10 : 0;
      const { payments: _payments, ...bookingRest } = c.booking;
      return {
        ...c,
        booking: {
          ...bookingRest,
          toCollect,
          received,
          outstanding,
          collectionPct,
        },
      };
    });

    if (useCollectedFilter && minCollected != null) {
      data = data.filter((c) => c.booking.collectionPct + 0.05 >= minCollected);
    }

    const total = useCollectedFilter ? data.length : totalBase;
    const pageData = useCollectedFilter ? data.slice(skip, skip + take) : data;

    res.json(listResult(pageData, total, page, pageSize));
  }),
);
