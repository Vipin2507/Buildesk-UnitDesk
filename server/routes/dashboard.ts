import { Router } from "express";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler } from "../lib/http.ts";
import { accessibleProjectIds, assertProjectAccess } from "../lib/access.ts";
import { requireUser } from "../middleware/auth.ts";

export const dashboardRouter = Router();

dashboardRouter.get(
  "/admin",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const projectIds = await accessibleProjectIds(user);
    const [projects, units, bookings] = await Promise.all([
      prisma.project.count({ where: { id: { in: projectIds } } }),
      prisma.unit.findMany({
        where: { floor: { wing: { projectId: { in: projectIds } } } },
        select: { status: true, basePrice: true },
      }),
      prisma.booking.findMany({
        where: { projectId: { in: projectIds }, status: { not: "cancelled" } },
        include: { financials: true },
      }),
    ]);
    const byStatus = (s: string) => units.filter((u) => u.status === s).length;
    const monthBuckets: Record<string, number> = {};
    for (const b of bookings) {
      const key = b.bookingDate.toISOString().slice(0, 7);
      monthBuckets[key] = (monthBuckets[key] ?? 0) + 1;
    }
    const trend = Object.entries(monthBuckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([month, count]) => ({ month, count }));

    res.json({
      kpis: {
        projects,
        units: units.length,
        booked: byStatus("booked") + byStatus("sold"),
        available: byStatus("available"),
        hold: byStatus("hold"),
        sold: byStatus("sold"),
        bookingValue: bookings.reduce((s, b) => s + (b.financials?.totalCost ?? 0), 0),
      },
      status: [
        { name: "Available", value: byStatus("available"), key: "available" },
        { name: "Sold", value: byStatus("sold"), key: "sold" },
        { name: "Booked", value: byStatus("booked"), key: "booked" },
        { name: "Hold", value: byStatus("hold"), key: "hold" },
        { name: "Blocked", value: byStatus("blocked"), key: "blocked" },
      ],
      trend,
    });
  }),
);

dashboardRouter.get(
  "/project/:id",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    await assertProjectAccess(user, String(req.params.id));
    const projectId = String(req.params.id);
    const [units, bookings] = await Promise.all([
      prisma.unit.findMany({
        where: { floor: { wing: { projectId } } },
        select: { status: true },
      }),
      prisma.booking.findMany({
        where: { projectId, status: { not: "cancelled" } },
        include: { financials: true, entitlement: true },
      }),
    ]);
    const byStatus = (s: string) => units.filter((u) => u.status === s).length;
    res.json({
      kpis: {
        units: units.length,
        available: byStatus("available"),
        booked: byStatus("booked"),
        sold: byStatus("sold"),
        hold: byStatus("hold"),
        bookingValue: bookings.reduce((s, b) => s + (b.financials?.totalCost ?? 0), 0),
        partnerOutstanding: bookings.reduce((s, b) => s + (b.entitlement?.outstanding ?? 0), 0),
      },
    });
  }),
);
