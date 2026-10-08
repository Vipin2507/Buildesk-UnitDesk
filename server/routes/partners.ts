import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, HttpError, listMeta, listResult } from "../lib/http.ts";
import { requirePermission } from "../lib/access.ts";
import { round2 } from "../lib/commission.ts";
import { requireUser } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";
import { audit } from "../lib/audit.ts";

export const partnersRouter = Router();

const partnerBody = z.object({
  name: z.string().min(2),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  panGst: z.string().optional().nullable(),
  firmName: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
  password: z.string().min(6).optional().nullable(),
});

function publicPartner<T extends { passwordHash?: string | null }>(row: T) {
  const { passwordHash: _, ...rest } = row;
  return { ...rest, hasPortalAccess: Boolean(row.passwordHash) };
}

partnersRouter.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    const [total, active, inactive, withBookings, entitlements] = await Promise.all([
      prisma.channelPartner.count(),
      prisma.channelPartner.count({ where: { status: "active" } }),
      prisma.channelPartner.count({ where: { status: "inactive" } }),
      prisma.channelPartner.count({ where: { bookings: { some: { status: { not: "cancelled" } } } } }),
      prisma.partnerEntitlement.findMany({
        where: { booking: { status: { not: "cancelled" }, channelPartnerId: { not: null } } },
        select: { entitlementAmount: true, received: true, outstanding: true },
      }),
    ]);
    res.json({
      total,
      active,
      inactive,
      withBookings,
      entitlement: round2(entitlements.reduce((s, e) => s + e.entitlementAmount, 0)),
      received: round2(entitlements.reduce((s, e) => s + e.received, 0)),
      outstanding: round2(entitlements.reduce((s, e) => s + e.outstanding, 0)),
    });
  }),
);

partnersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = listMeta(req);
    const search = String(req.query.search ?? "").trim();
    const status = req.query.status ? String(req.query.status) : null;
    const where = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { phone: { contains: search } },
              { email: { contains: search } },
              { firmName: { contains: search } },
              { panGst: { contains: search } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.channelPartner.findMany({
        where,
        skip,
        take,
        orderBy: { name: "asc" },
        include: { _count: { select: { bookings: true } } },
      }),
      prisma.channelPartner.count({ where }),
    ]);
    res.json(listResult(rows.map(publicPartner), total, page, pageSize));
  }),
);

partnersRouter.post(
  "/",
  validate(partnerBody),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "add");
    const body = req.body as z.infer<typeof partnerBody>;
    const created = await prisma.channelPartner.create({
      data: {
        name: body.name,
        phone: body.phone || null,
        email: body.email || null,
        panGst: body.panGst || null,
        firmName: body.firmName || null,
        status: body.status ?? "active",
        passwordHash: body.password ? await bcrypt.hash(body.password, 10) : null,
      },
    });
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "partner.create",
      entityType: "channel_partner",
      entityId: created.id,
      meta: { name: created.name },
    });
    res.status(201).json(publicPartner(created));
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
      partner: publicPartner(partner),
      kpis: {
        bookingValue: round2(kpis.bookingValue),
        entitlement: round2(kpis.entitlement),
        received: round2(kpis.received),
        outstanding: round2(kpis.outstanding),
        bookings: bookings.length,
      },
      bookings: bookings.map((b) => ({
        id: b.id,
        project: b.project.name,
        projectId: b.projectId,
        unit: b.unit.unitNumber,
        bookingNumber: b.bookingNumber,
        bookingValue: b.financials?.totalCost ?? 0,
        entitlement: b.entitlement?.entitlementAmount ?? 0,
        received: b.entitlement?.received ?? 0,
        outstanding: b.entitlement?.outstanding ?? 0,
        status: b.status,
      })),
    });
  }),
);

partnersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const partner = await prisma.channelPartner.findUnique({
      where: { id: String(req.params.id) },
      include: { _count: { select: { bookings: true } } },
    });
    if (!partner) throw new HttpError(404, "Partner not found");
    res.json(publicPartner(partner));
  }),
);

partnersRouter.patch(
  "/:id",
  validate(partnerBody.partial()),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "edit");
    const id = String(req.params.id);
    const existing = await prisma.channelPartner.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Partner not found");
    const body = req.body as Partial<z.infer<typeof partnerBody>>;
    const updated = await prisma.channelPartner.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.phone !== undefined ? { phone: body.phone || null } : {}),
        ...(body.email !== undefined ? { email: body.email || null } : {}),
        ...(body.panGst !== undefined ? { panGst: body.panGst || null } : {}),
        ...(body.firmName !== undefined ? { firmName: body.firmName || null } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.password ? { passwordHash: await bcrypt.hash(body.password, 10) } : {}),
      },
    });
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "partner.update",
      entityType: "channel_partner",
      entityId: id,
      meta: body,
    });
    res.json(publicPartner(updated));
  }),
);

partnersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "edit");
    const id = String(req.params.id);
    const existing = await prisma.channelPartner.findUnique({
      where: { id },
      include: { _count: { select: { bookings: true } } },
    });
    if (!existing) throw new HttpError(404, "Partner not found");
    const outstandingCount = await prisma.booking.count({
      where: {
        channelPartnerId: id,
        status: { not: "cancelled" },
        entitlement: { outstanding: { gt: 0 } },
      },
    });
    if (outstandingCount > 0) {
      throw new HttpError(409, "Partner has outstanding brokerage — deactivate instead of delete");
    }
    if (existing._count.bookings > 0) {
      const updated = await prisma.channelPartner.update({
        where: { id },
        data: { status: "inactive" },
      });
      await audit({
        actorId: user.id,
        actorName: user.name,
        action: "partner.deactivate",
        entityType: "channel_partner",
        entityId: id,
      });
      return res.json({ ...publicPartner(updated), deactivated: true });
    }
    await prisma.channelPartner.delete({ where: { id } });
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "partner.delete",
      entityType: "channel_partner",
      entityId: id,
    });
    res.json({ ok: true });
  }),
);
