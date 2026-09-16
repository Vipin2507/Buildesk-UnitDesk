import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, HttpError } from "../lib/http.ts";
import { validate } from "../middleware/validate.ts";

const JWT_SECRET = process.env.JWT_SECRET ?? "unitdesk-dev-secret-change-in-production";

export const partnerAuthRouter = Router();
export const partnerPortalRouter = Router();

function partnerOf(req: Request) {
  if (!req.partner) throw new HttpError(401, "Unauthorized");
  return req.partner;
}

partnerAuthRouter.post(
  "/login",
  validate(z.object({ email: z.string().email(), password: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };
    const partner = await prisma.channelPartner.findFirst({
      where: { email: email.toLowerCase(), status: "active" },
    });
    if (!partner?.passwordHash) throw new HttpError(401, "Invalid email or password");
    const ok = await bcrypt.compare(password, partner.passwordHash);
    if (!ok) throw new HttpError(401, "Invalid email or password");
    const token = jwt.sign({ sub: partner.id, kind: "partner" }, JWT_SECRET, { expiresIn: "7d" });
    res.json({
      token,
      user: {
        id: partner.id,
        name: partner.name,
        email: partner.email,
        role: "Channel Partner",
        permissions: ["view", "payment_view"],
        isSuperAdmin: false,
        kind: "partner",
      },
    });
  }),
);

export async function partnerRequired(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new HttpError(401, "Unauthorized");
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; kind?: string };
    if (payload.kind !== "partner") throw new HttpError(403, "Partner portal only");
    const partner = await prisma.channelPartner.findUnique({ where: { id: payload.sub } });
    if (!partner) throw new HttpError(401, "Unauthorized");
    req.partner = { id: partner.id, name: partner.name };
    next();
  } catch (err) {
    next(err instanceof HttpError ? err : new HttpError(401, "Unauthorized"));
  }
}

const bookingInclude = {
  financials: true,
  entitlement: true,
  project: true,
  unit: true,
  schedules: { orderBy: { sortOrder: "asc" as const } },
  invoices: { orderBy: { issuedAt: "desc" as const } },
  documents: { orderBy: { createdAt: "desc" as const } },
  customers: true,
  payments: { orderBy: { paymentDate: "desc" as const } },
};

partnerPortalRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const partner = await prisma.channelPartner.findUnique({
      where: { id: partnerOf(req).id },
    });
    res.json(partner);
  }),
);

partnerPortalRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const id = partnerOf(req).id;
    const bookings = await prisma.booking.findMany({
      where: { channelPartnerId: id, status: { not: "cancelled" } },
      include: bookingInclude,
    });
    const kpis = bookings.reduce(
      (acc, b) => {
        acc.bookingValue += b.financials?.totalDealValue ?? 0;
        acc.entitlement += b.entitlement?.entitlementAmount ?? 0;
        acc.received += b.entitlement?.received ?? 0;
        acc.outstanding += b.entitlement?.outstanding ?? 0;
        return acc;
      },
      { bookingValue: 0, entitlement: 0, received: 0, outstanding: 0 },
    );
    res.json({ kpis, bookings });
  }),
);

partnerPortalRouter.get(
  "/bookings",
  asyncHandler(async (req, res) => {
    const id = partnerOf(req).id;
    const bookings = await prisma.booking.findMany({
      where: { channelPartnerId: id },
      include: bookingInclude,
      orderBy: { bookingDate: "desc" },
    });
    res.json({ data: bookings, total: bookings.length, page: 1, pageSize: bookings.length });
  }),
);

partnerPortalRouter.get(
  "/bookings/:id",
  asyncHandler(async (req, res) => {
    const id = partnerOf(req).id;
    const booking = await prisma.booking.findFirst({
      where: { id: String(req.params.id), channelPartnerId: id },
      include: bookingInclude,
    });
    if (!booking) throw new HttpError(404, "Booking not found");
    res.json(booking);
  }),
);

partnerPortalRouter.get(
  "/documents",
  asyncHandler(async (req, res) => {
    const id = partnerOf(req).id;
    const bookings = await prisma.booking.findMany({
      where: { channelPartnerId: id },
      select: { id: true },
    });
    const data = await prisma.document.findMany({
      where: { bookingId: { in: bookings.map((b) => b.id) } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ data, total: data.length, page: 1, pageSize: data.length });
  }),
);

partnerPortalRouter.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    const id = partnerOf(req).id;
    const data = await prisma.notification.findMany({
      where: { partnerId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    const unread = data.filter((n) => !n.readAt).length;
    res.json({ data, total: data.length, page: 1, pageSize: data.length, unread });
  }),
);

partnerPortalRouter.patch(
  "/notifications/:id/read",
  asyncHandler(async (req, res) => {
    const id = partnerOf(req).id;
    const existing = await prisma.notification.findUnique({ where: { id: String(req.params.id) } });
    if (!existing || existing.partnerId !== id) throw new HttpError(404, "Notification not found");
    const updated = await prisma.notification.update({
      where: { id: existing.id },
      data: { readAt: new Date() },
    });
    res.json(updated);
  }),
);
