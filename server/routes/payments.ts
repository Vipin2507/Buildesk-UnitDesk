import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, HttpError, listMeta, listResult } from "../lib/http.ts";
import { assertProjectAccess, requirePermission } from "../lib/access.ts";
import { recomputePartnerEntitlement } from "../lib/commission.ts";
import { requireUser } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";
import { applyCustomerPayment } from "../lib/schedule.ts";
import { issueDocument } from "../lib/invoice.ts";
import { audit } from "../lib/audit.ts";
import { notify } from "../lib/notify.ts";

export const paymentsRouter = Router();

paymentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = listMeta(req);
    const where = {
      ...(req.query.bookingId ? { bookingId: String(req.query.bookingId) } : {}),
      ...(req.query.appliesTo ? { appliesTo: String(req.query.appliesTo) } : {}),
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.projectId ? { booking: { projectId: String(req.query.projectId) } } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take,
        orderBy: { paymentDate: "desc" },
        include: {
          booking: {
            include: { unit: true, project: true, channelPartner: true, customers: true },
          },
        },
      }),
      prisma.payment.count({ where }),
    ]);
    res.json(listResult(data, total, page, pageSize));
  }),
);

paymentsRouter.get(
  "/by-booking/:id",
  asyncHandler(async (req, res) => {
    const booking = await prisma.booking.findUnique({ where: { id: String(req.params.id) } });
    if (!booking) throw new HttpError(404, "Booking not found");
    const user = requireUser(req);
    await assertProjectAccess(user, booking.projectId);
    const data = await prisma.payment.findMany({
      where: { bookingId: booking.id },
      orderBy: { paymentDate: "desc" },
    });
    res.json({ data, total: data.length, page: 1, pageSize: data.length });
  }),
);

paymentsRouter.post(
  "/",
  validate(
    z.object({
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
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "payment_entry");
    const body = req.body as {
      bookingId: string;
      paymentDate: string;
      amount: number;
      paymentMode: string;
      utrOrCheque?: string | null;
      bank?: string | null;
      proofUrl?: string | null;
      remarks?: string | null;
      appliesTo: "customer" | "partner";
      status?: string;
    };
    const booking = await prisma.booking.findUnique({ where: { id: body.bookingId } });
    if (!booking) throw new HttpError(404, "Booking not found");
    await assertProjectAccess(user, booking.projectId);

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
      if (body.appliesTo === "customer" && (body.status ?? "received") !== "pending") {
        await applyCustomerPayment(tx, body.bookingId, body.amount);
        await issueDocument(tx, {
          bookingId: body.bookingId,
          kind: "receipt",
          amount: body.amount,
          paymentId: created.id,
          notes: `${body.paymentMode.toUpperCase()} ${body.utrOrCheque ?? ""}`.trim(),
        });
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
        await applyCustomerPayment(tx, existing.bookingId, payment.amount);
      }
      return payment;
    });
    res.json(updated);
  }),
);
