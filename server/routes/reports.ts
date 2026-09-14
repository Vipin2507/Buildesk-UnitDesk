import { Router } from "express";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, listMeta, listResult } from "../lib/http.ts";
import { accessibleProjectIds } from "../lib/access.ts";
import { requireUser } from "../middleware/auth.ts";

export const reportsRouter = Router();

reportsRouter.get(
  "/:kind",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const ids = await accessibleProjectIds(user);
    const { page, pageSize, skip, take } = listMeta(req);
    const kind = String(req.params.kind);
    if (kind === "bookings") {
      const [data, total] = await Promise.all([
        prisma.booking.findMany({
          where: { projectId: { in: ids } },
          skip,
          take,
          include: { project: true, unit: true, financials: true, customers: true },
          orderBy: { bookingDate: "desc" },
        }),
        prisma.booking.count({ where: { projectId: { in: ids } } }),
      ]);
      return res.json(listResult(data, total, page, pageSize));
    }
    if (kind === "inventory") {
      const [data, total] = await Promise.all([
        prisma.unit.findMany({
          where: { floor: { wing: { projectId: { in: ids } } } },
          skip,
          take,
          include: { floor: { include: { wing: { include: { project: true } } } } },
          orderBy: { unitNumber: "asc" },
        }),
        prisma.unit.count({ where: { floor: { wing: { projectId: { in: ids } } } } }),
      ]);
      return res.json(listResult(data, total, page, pageSize));
    }
    const [data, total] = await Promise.all([
      prisma.payment.findMany({
        skip,
        take,
        include: { booking: { include: { project: true, unit: true } } },
        orderBy: { paymentDate: "desc" },
      }),
      prisma.payment.count(),
    ]);
    res.json(listResult(data, total, page, pageSize));
  }),
);
