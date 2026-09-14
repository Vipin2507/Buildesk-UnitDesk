import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, HttpError, listMeta, listResult } from "../lib/http.ts";
import { requirePermission } from "../lib/access.ts";
import { requireUser } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";

export const partnersRouter = Router();

partnersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = listMeta(req);
    const search = String(req.query.search ?? "").trim();
    const where = search
      ? { OR: [{ name: { contains: search } }, { phone: { contains: search } }] }
      : {};
    const [data, total] = await Promise.all([
      prisma.channelPartner.findMany({
        where,
        skip,
        take,
        orderBy: { name: "asc" },
        include: { _count: { select: { bookings: true } } },
      }),
      prisma.channelPartner.count({ where }),
    ]);
    res.json(listResult(data, total, page, pageSize));
  }),
);

partnersRouter.post(
  "/",
  validate(
    z.object({
      name: z.string().min(2),
      phone: z.string().optional().nullable(),
      email: z.string().email().optional().nullable().or(z.literal("")),
      panGst: z.string().optional().nullable(),
      firmName: z.string().optional().nullable(),
      status: z.enum(["active", "inactive"]).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "add");
    const body = req.body as { email?: string | null };
    const created = await prisma.channelPartner.create({
      data: { ...req.body, email: body.email || null },
    });
    res.status(201).json(created);
  }),
);

partnersRouter.get(
  "/:id/dashboard",
  asyncHandler(async (req, res) => {
    const partner = await prisma.channelPartner.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!partner) throw new HttpError(404, "Partner not found");
    const bookings = await prisma.booking.findMany({
      where: { channelPartnerId: partner.id, status: { not: "cancelled" } },
      include: {
        financials: true,
        entitlement: true,
        project: true,
        unit: true,
      },
    });
    const kpis = bookings.reduce(
      (acc, b) => {
        acc.bookingValue += b.financials?.totalCost ?? 0;
        acc.entitlement += b.entitlement?.entitlementAmount ?? 0;
        acc.received += b.entitlement?.received ?? 0;
        acc.outstanding += b.entitlement?.outstanding ?? 0;
        return acc;
      },
      { bookingValue: 0, entitlement: 0, received: 0, outstanding: 0 },
    );
    res.json({
      partner,
      kpis,
      bookings: bookings.map((b) => ({
        id: b.id,
        project: b.project.name,
        unit: b.unit.unitNumber,
        bookingValue: b.financials?.totalCost ?? 0,
        entitlement: b.entitlement?.entitlementAmount ?? 0,
        received: b.entitlement?.received ?? 0,
        outstanding: b.entitlement?.outstanding ?? 0,
      })),
    });
  }),
);

partnersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const partner = await prisma.channelPartner.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!partner) throw new HttpError(404, "Partner not found");
    res.json(partner);
  }),
);
