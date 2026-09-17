import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, HttpError, listMeta, listResult } from "../lib/http.ts";
import { accessibleProjectIds, assertProjectAccess, requirePermission } from "../lib/access.ts";
import { recomputePartnerEntitlement, round2 } from "../lib/commission.ts";
import { requireUser } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";
import {
  collectableAmount,
  customerCollectionSummary,
  recomputeCustomerCollection,
} from "../lib/schedule.ts";
import { issueDocument } from "../lib/invoice.ts";
import { audit } from "../lib/audit.ts";
import { notify } from "../lib/notify.ts";

export const paymentsRouter = Router();

const paymentBody = z.object({
  bookingId: z.string(),
  paymentDate: z.string(),
  amount: z.number().positive(),
  paymentMode: z.enum(["cash", "cheque", "neft", "rtgs", "upi"]),
  utrOrCheque: z.string().optional().nullable(),
  bank: z.string().optional().nullable(),
  proofUrl: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  appliesTo: z.enum(["customer", "partner"]).default("customer"),
  status: z.enum(["pending", "received", "verified", "reconciled"]).optional(),
});

const paymentInclude = {
  booking: {
    include: {
      unit: true,
      project: true,
      channelPartner: true,
      customers: { where: { role: "primary" }, take: 1 },
      financials: true,
    },
  },
} as const;

paymentsRouter.get(
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

    const [bookings, payments] = await Promise.all([
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

    const toCollect = round2(
      bookings.reduce((s, b) => s + collectableAmount(b.financials), 0),
    );
    const received = round2(payments.reduce((s, p) => s + p.amount, 0));
    const outstanding = round2(Math.max(0, toCollect - received));
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const thisMonth = round2(
      payments.filter((p) => p.paymentDate >= monthStart).reduce((s, p) => s + p.amount, 0),
    );

    res.json({
      toCollect,
      received,
      outstanding,
      thisMonth,
      collectionPct: toCollect ? Math.round((received / toCollect) * 1000) / 10 : 0,
      bookings: bookings.length,
      payments: payments.length,
    });
  }),
);

paymentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const projectIds = await accessibleProjectIds(user);
    const { page, pageSize, skip, take } = listMeta(req);
    const where = {
      ...(req.query.bookingId ? { bookingId: String(req.query.bookingId) } : {}),
      ...(req.query.appliesTo ? { appliesTo: String(req.query.appliesTo) } : {}),
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.projectId
        ? { booking: { projectId: String(req.query.projectId) } }
        : { booking: { projectId: { in: projectIds } } }),
    };
    const [data, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take,
        orderBy: { paymentDate: "desc" },
        include: paymentInclude,
      }),
      prisma.payment.count({ where }),
    ]);
    res.json(
      listResult(
        data.map((p) => ({
          ...p,
          booking: {
            ...p.booking,
            toCollect: collectableAmount(p.booking.financials),
          },
        })),
        total,
        page,
        pageSize,
      ),
    );
  }),
);

paymentsRouter.get(
  "/by-booking/:id",
  asyncHandler(async (req, res) => {
    const booking = await prisma.booking.findUnique({
      where: { id: String(req.params.id) },
      include: { financials: true },
    });
    if (!booking) throw new HttpError(404, "Booking not found");
    const user = requireUser(req);
    await assertProjectAccess(user, booking.projectId);
    const data = await prisma.payment.findMany({
      where: { bookingId: booking.id },
      orderBy: { paymentDate: "desc" },
    });
    const summary = await customerCollectionSummary(prisma, booking.id);
    res.json({ data, total: data.length, page: 1, pageSize: data.length, summary });
  }),
);

paymentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const payment = await prisma.payment.findUnique({
      where: { id: String(req.params.id) },
      include: paymentInclude,
    });
    if (!payment) throw new HttpError(404, "Payment not found");
    await assertProjectAccess(user, payment.booking.projectId);
    res.json({
      ...payment,
      booking: {
        ...payment.booking,
        toCollect: collectableAmount(payment.booking.financials),
      },
    });
  }),
);

paymentsRouter.post(
  "/",
  validate(paymentBody),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "payment_entry");
    const body = req.body as z.infer<typeof paymentBody>;
    const booking = await prisma.booking.findUnique({
      where: { id: body.bookingId },
      include: { financials: true },
    });
    if (!booking) throw new HttpError(404, "Booking not found");
    await assertProjectAccess(user, booking.projectId);

    if (body.appliesTo === "customer" && (body.status ?? "received") !== "pending") {
      const summary = await customerCollectionSummary(prisma, booking.id);
      if (round2(body.amount) > summary.outstanding + 0.01) {
        throw new HttpError(422, "Amount exceeds value to be collected outstanding", {
          amount: [`Outstanding against value to be collected is ₹${summary.outstanding.toLocaleString("en-IN")}`],
        });
      }
    }

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          bookingId: body.bookingId,
          paymentDate: new Date(body.paymentDate),
          amount: body.amount,
          paymentMode: body.paymentMode,
          utrOrCheque: body.utrOrCheque,
          bank: body.bank,
          proofUrl: body.proofUrl,
          remarks: body.remarks,
          appliesTo: body.appliesTo,
          status: body.status ?? "received",
          addedBy: user.id,
        },
      });
      if (body.appliesTo === "partner") {
        await recomputePartnerEntitlement(tx, body.bookingId);
      }
      if (body.appliesTo === "customer") {
        await recomputeCustomerCollection(tx, body.bookingId);
        if ((body.status ?? "received") !== "pending") {
          await issueDocument(tx, {
            bookingId: body.bookingId,
            kind: "receipt",
            amount: body.amount,
            paymentId: created.id,
            notes: `${body.paymentMode.toUpperCase()} ${body.utrOrCheque ?? ""}`.trim(),
          });
        }
      }
      return created;
    });
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "payment.create",
      entityType: "payment",
      entityId: payment.id,
      projectId: booking.projectId,
      meta: { amount: payment.amount, appliesTo: payment.appliesTo },
    });
    await notify({
      title: "Payment recorded",
      body: `₹${body.amount.toLocaleString("en-IN")} posted on booking`,
      type: "payment",
      employeeId: user.id,
      partnerId: body.appliesTo === "partner" ? booking.channelPartnerId : null,
      linkUrl: `/bookings/${booking.id}`,
    });
    res.status(201).json(payment);
  }),
);

paymentsRouter.patch(
  "/:id",
  validate(paymentBody.partial().extend({ bookingId: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "payment_entry");
    const existing = await prisma.payment.findUnique({
      where: { id: String(req.params.id) },
      include: { booking: { include: { financials: true } } },
    });
    if (!existing) throw new HttpError(404, "Payment not found");
    await assertProjectAccess(user, existing.booking.projectId);

    const body = req.body as Partial<z.infer<typeof paymentBody>>;
    const bookingId = body.bookingId ?? existing.bookingId;
    const appliesTo = body.appliesTo ?? (existing.appliesTo as "customer" | "partner");
    const amount = body.amount ?? existing.amount;
    const status = body.status ?? existing.status;

    if (appliesTo === "customer" && status !== "pending") {
      const others = await prisma.payment.findMany({
        where: {
          bookingId,
          appliesTo: "customer",
          status: { not: "pending" },
          id: { not: existing.id },
        },
      });
      const booking =
        bookingId === existing.bookingId
          ? existing.booking
          : await prisma.booking.findUnique({
              where: { id: bookingId },
              include: { financials: true },
            });
      const toCollect = collectableAmount(booking?.financials ?? null);
      const already = others.reduce((s, p) => s + p.amount, 0);
      const outstanding = round2(Math.max(0, toCollect - already));
      if (round2(amount) > outstanding + 0.01) {
        throw new HttpError(422, "Amount exceeds value to be collected outstanding", {
          amount: [`Outstanding against value to be collected is ₹${outstanding.toLocaleString("en-IN")}`],
        });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.update({
        where: { id: existing.id },
        data: {
          bookingId,
          paymentDate: body.paymentDate ? new Date(body.paymentDate) : undefined,
          amount: body.amount,
          paymentMode: body.paymentMode,
          utrOrCheque: body.utrOrCheque,
          bank: body.bank,
          proofUrl: body.proofUrl,
          remarks: body.remarks,
          appliesTo: body.appliesTo,
          status: body.status,
        },
      });

      const touch = new Set([existing.bookingId, bookingId]);
      for (const id of touch) {
        if (existing.appliesTo === "partner" || appliesTo === "partner") {
          await recomputePartnerEntitlement(tx, id);
        }
        if (existing.appliesTo === "customer" || appliesTo === "customer") {
          await recomputeCustomerCollection(tx, id);
        }
      }
      return payment;
    });

    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "payment.update",
      entityType: "payment",
      entityId: updated.id,
      projectId: existing.booking.projectId,
      meta: body,
    });
    res.json(updated);
  }),
);

paymentsRouter.patch(
  "/:id/status",
  validate(z.object({ status: z.enum(["pending", "received", "verified", "reconciled"]) })),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "approve");
    const existing = await prisma.payment.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) throw new HttpError(404, "Payment not found");
    const status = (req.body as { status: string }).status;
    const updated = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.update({
        where: { id: existing.id },
        data: { status, verifiedBy: user.id },
      });
      if (payment.appliesTo === "partner") {
        await recomputePartnerEntitlement(tx, existing.bookingId);
      }
      if (payment.appliesTo === "customer") {
        await recomputeCustomerCollection(tx, existing.bookingId);
      }
      return payment;
    });
    res.json(updated);
  }),
);

paymentsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "delete");
    const existing = await prisma.payment.findUnique({
      where: { id: String(req.params.id) },
      include: { booking: true },
    });
    if (!existing) throw new HttpError(404, "Payment not found");
    await assertProjectAccess(user, existing.booking.projectId);

    await prisma.$transaction(async (tx) => {
      await tx.invoice.deleteMany({ where: { paymentId: existing.id } });
      await tx.payment.delete({ where: { id: existing.id } });
      if (existing.appliesTo === "partner") {
        await recomputePartnerEntitlement(tx, existing.bookingId);
      }
      if (existing.appliesTo === "customer") {
        await recomputeCustomerCollection(tx, existing.bookingId);
      }
    });

    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "payment.delete",
      entityType: "payment",
      entityId: existing.id,
      projectId: existing.booking.projectId,
      meta: { amount: existing.amount, appliesTo: existing.appliesTo },
    });
    res.status(204).end();
  }),
);
