import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, HttpError, listMeta, listResult } from "../lib/http.ts";
import { accessibleProjectIds, assertProjectAccess, requirePermission } from "../lib/access.ts";
import { computeEntitlement } from "../lib/commission.ts";
import { requireUser } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";
import { generateSchedules } from "../lib/schedule.ts";
import { issueDocument } from "../lib/invoice.ts";
import { audit } from "../lib/audit.ts";
import { notify } from "../lib/notify.ts";

export const bookingsRouter = Router();

const customerSchema = z.object({
  role: z.enum(["primary", "co_applicant", "nominee"]),
  name: z.string().min(2),
  mobile: z.string().min(8),
  email: z.string().email().optional().nullable().or(z.literal("")),
  pan: z.string().optional().nullable(),
  aadhaar: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  dob: z.string().optional().nullable(),
});

const financialSchema = z.object({
  agreement: z.number().optional(),
  gst: z.number().optional(),
  otherCharges: z.number().optional(),
  totalCost: z.number(),
  gstOnAgreement: z.number().optional(),
  stampDutyRegistration: z.number().optional(),
  valueToBeCollected: z.number().optional(),
  finance: z.number().optional(),
});

const bookingSchema = z.object({
  bookingDate: z.string(),
  projectId: z.string(),
  unitId: z.string(),
  salesEmployeeId: z.string().optional().nullable(),
  channelPartnerId: z.string().optional().nullable(),
  status: z.enum(["booked", "hold", "cancelled", "confirmed"]).optional(),
  remarks: z.string().optional().nullable(),
  customers: z.array(customerSchema).min(1),
  financials: financialSchema,
});

async function nextBookingNumber() {
  const year = new Date().getFullYear();
  const count = await prisma.booking.count({
    where: { bookingNumber: { startsWith: `BK-${year}-` } },
  });
  return `BK-${year}-${String(count + 1).padStart(4, "0")}`;
}

bookingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const ids = await accessibleProjectIds(user);
    const { page, pageSize, skip, take } = listMeta(req);
    const search = String(req.query.search ?? "").trim();
    const statusRaw = String(req.query.status ?? "").trim();
    const statuses = statusRaw
      ? statusRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const where = {
      projectId: req.query.projectId
        ? String(req.query.projectId)
        : req.query.project
          ? String(req.query.project)
          : { in: ids },
      ...(statuses.length === 1
        ? { status: statuses[0] }
        : statuses.length > 1
          ? { status: { in: statuses } }
          : {}),
      ...(search
        ? {
            OR: [
              { bookingNumber: { contains: search } },
              { customers: { some: { name: { contains: search } } } },
              { unit: { unitNumber: { contains: search } } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take,
        orderBy: { bookingDate: "desc" },
        include: {
          unit: { include: { floor: { include: { wing: true } } } },
          project: { include: { company: true } },
          customers: true,
          financials: true,
          channelPartner: true,
          entitlement: true,
        },
      }),
      prisma.booking.count({ where }),
    ]);
    res.json(listResult(data, total, page, pageSize));
  }),
);

bookingsRouter.post(
  "/",
  validate(bookingSchema),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "book");
    const body = req.body as z.infer<typeof bookingSchema>;
    await assertProjectAccess(user, body.projectId, { unitId: body.unitId });

    const result = await prisma.$transaction(async (tx) => {
      const unit = await tx.unit.findUnique({
        where: { id: body.unitId },
        include: { bookings: { where: { status: { not: "cancelled" } } } },
      });
      if (!unit) throw new HttpError(404, "Unit not found");
      if (unit.bookings.length) throw new HttpError(409, "Unit already has an active booking");
      if (!["available", "hold"].includes(unit.status)) {
        throw new HttpError(409, `Unit is ${unit.status} and cannot be booked`);
      }

      const booking = await tx.booking.create({
        data: {
          bookingNumber: await nextBookingNumber(),
          bookingDate: new Date(body.bookingDate),
          projectId: body.projectId,
          unitId: body.unitId,
          salesEmployeeId: body.salesEmployeeId ?? user.id,
          channelPartnerId: body.channelPartnerId ?? null,
          status: body.status ?? "booked",
          remarks: body.remarks ?? null,
          customers: {
            create: body.customers.map((c) => ({
              ...c,
              email: c.email || null,
              dob: c.dob ? new Date(c.dob) : null,
            })),
          },
          financials: { create: body.financials },
        },
      });

      const unitStatus =
        (body.status ?? "booked") === "hold"
          ? "hold"
          : (body.status ?? "booked") === "confirmed"
            ? "sold"
            : "booked";
      await tx.unit.update({ where: { id: unit.id }, data: { status: unitStatus } });

      if (body.channelPartnerId) {
        const rule = await tx.commissionRule.findFirst({
          where: { projectId: body.projectId, active: true },
        });
        if (!rule) throw new HttpError(422, "No active commission rule for this project", {
          channelPartnerId: ["Configure a commission rule before attaching a partner"],
        });
        const snap = computeEntitlement(rule, body.financials.totalCost);
        await tx.partnerEntitlement.create({
          data: {
            bookingId: booking.id,
            ruleId: rule.id,
            entitlementPercent: snap.percent,
            entitlementAmount: snap.amount,
            received: 0,
            outstanding: snap.amount,
          },
        });
      }

      const full = await tx.booking.findUniqueOrThrow({
        where: { id: booking.id },
        include: { financials: true, customers: true },
      });
      await generateSchedules(tx, full);
      await issueDocument(tx, {
        bookingId: booking.id,
        kind: "invoice",
        amount: body.financials.totalCost,
        tax: body.financials.gst ?? 0,
        notes: `Agreement invoice for ${full.bookingNumber}`,
      });
      await tx.reminder.create({
        data: {
          bookingId: booking.id,
          projectId: body.projectId,
          type: "kyc_pending",
          channel: "email",
          title: `KYC pending — ${full.bookingNumber}`,
          message: `Collect KYC for ${full.customers[0]?.name ?? "customer"} on ${full.bookingNumber}.`,
          dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        },
      });

      return tx.booking.findUniqueOrThrow({
        where: { id: booking.id },
        include: {
          customers: true,
          financials: true,
          entitlement: true,
          unit: true,
          channelPartner: true,
          schedules: true,
          invoices: true,
        },
      });
    });

    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "booking.create",
      entityType: "booking",
      entityId: result.id,
      projectId: result.projectId,
      meta: { bookingNumber: result.bookingNumber },
    });
    await notify({
      title: `Booking ${result.bookingNumber}`,
      body: `Unit booked. Schedule and invoice generated.`,
      type: "booking",
      employeeId: user.id,
      linkUrl: `/bookings/${result.id}`,
    });

    res.status(201).json(result);
  }),
);

bookingsRouter.get(
  "/:id/schedule",
  asyncHandler(async (req, res) => {
    const booking = await prisma.booking.findUnique({ where: { id: String(req.params.id) } });
    if (!booking) throw new HttpError(404, "Booking not found");
    const user = requireUser(req);
    await assertProjectAccess(user, booking.projectId);
    const data = await prisma.paymentSchedule.findMany({
      where: { bookingId: booking.id },
      orderBy: { sortOrder: "asc" },
    });
    res.json({ data, total: data.length, page: 1, pageSize: data.length });
  }),
);

bookingsRouter.post(
  "/:id/schedule/generate",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "edit");
    const booking = await prisma.booking.findUnique({
      where: { id: String(req.params.id) },
      include: { financials: true, schedules: true },
    });
    if (!booking) throw new HttpError(404, "Booking not found");
    await assertProjectAccess(user, booking.projectId);
    if (booking.schedules.length) throw new HttpError(409, "Schedule already exists");
    await generateSchedules(prisma, booking);
    const data = await prisma.paymentSchedule.findMany({
      where: { bookingId: booking.id },
      orderBy: { sortOrder: "asc" },
    });
    res.status(201).json({ data, total: data.length, page: 1, pageSize: data.length });
  }),
);

bookingsRouter.get(
  "/:id/invoices",
  asyncHandler(async (req, res) => {
    const booking = await prisma.booking.findUnique({ where: { id: String(req.params.id) } });
    if (!booking) throw new HttpError(404, "Booking not found");
    const user = requireUser(req);
    await assertProjectAccess(user, booking.projectId);
    const data = await prisma.invoice.findMany({
      where: { bookingId: booking.id },
      orderBy: { issuedAt: "desc" },
    });
    res.json({ data, total: data.length, page: 1, pageSize: data.length });
  }),
);

bookingsRouter.post(
  "/:id/invoices",
  validate(z.object({ kind: z.enum(["invoice", "receipt"]), amount: z.number().optional(), paymentId: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "add");
    const booking = await prisma.booking.findUnique({
      where: { id: String(req.params.id) },
      include: { financials: true },
    });
    if (!booking) throw new HttpError(404, "Booking not found");
    await assertProjectAccess(user, booking.projectId);
    const body = req.body as { kind: "invoice" | "receipt"; amount?: number; paymentId?: string };
    const created = await issueDocument(prisma, {
      bookingId: booking.id,
      kind: body.kind,
      amount: body.amount ?? booking.financials?.totalCost ?? 0,
      tax: booking.financials?.gst ?? 0,
      paymentId: body.paymentId,
    });
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: `${body.kind}.issue`,
      entityType: "booking",
      entityId: booking.id,
      projectId: booking.projectId,
      meta: { number: created.number },
    });
    res.status(201).json(created);
  }),
);

bookingsRouter.get(
  "/:id/payments",
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

bookingsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const booking = await prisma.booking.findUnique({
      where: { id: String(req.params.id) },
      include: {
        unit: { include: { floor: { include: { wing: true } } } },
        project: true,
        customers: true,
        financials: true,
        entitlement: { include: { rule: true } },
        payments: { orderBy: { paymentDate: "desc" } },
        channelPartner: true,
        schedules: { orderBy: { sortOrder: "asc" } },
        invoices: { orderBy: { issuedAt: "desc" } },
        documents: { orderBy: { createdAt: "desc" } },
        reminders: { orderBy: { dueAt: "asc" } },
      },
    });
    if (!booking) throw new HttpError(404, "Booking not found");
    const user = requireUser(req);
    await assertProjectAccess(user, booking.projectId, { unitId: booking.unitId });
    res.json(booking);
  }),
);

bookingsRouter.patch(
  "/:id/status",
  validate(z.object({ status: z.enum(["booked", "hold", "cancelled", "confirmed"]) })),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const status = (req.body as { status: string }).status;
    if (status === "cancelled") requirePermission(user, "cancel");
    const existing = await prisma.booking.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) throw new HttpError(404, "Booking not found");
    await assertProjectAccess(user, existing.projectId, { unitId: existing.unitId });

    if (!user.isSuperAdmin) {
      const key = status === "cancelled" ? "requireApprovalForCancel" : status === "confirmed" ? "requireApprovalForConfirm" : null;
      if (key) {
        const setting = await prisma.appSetting.findUnique({ where: { key } });
        if (setting?.value === "true") {
          const approval = await prisma.approval.create({
            data: {
              type: status === "cancelled" ? "booking_cancel" : "booking_confirm",
              entityType: "booking",
              entityId: existing.id,
              projectId: existing.projectId,
              requestedBy: user.id,
              reason: `Requested status ${status}`,
            },
          });
          await notify({
            title: "Approval required",
            body: `${user.name} requested ${status} on ${existing.bookingNumber}`,
            type: "approval",
            employeeId: user.id,
            linkUrl: "/approvals",
          });
          return res.status(202).json({ approval, message: "Sent for approval" });
        }
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.update({
        where: { id: existing.id },
        data: { status },
      });
      const unitStatus =
        status === "cancelled"
          ? "available"
          : status === "hold"
            ? "hold"
            : status === "confirmed"
              ? "sold"
              : "booked";
      await tx.unit.update({ where: { id: existing.unitId }, data: { status: unitStatus } });
      return booking;
    });
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: `booking.status.${status}`,
      entityType: "booking",
      entityId: existing.id,
      projectId: existing.projectId,
    });
    res.json(updated);
  }),
);

bookingsRouter.post(
  "/:id/customers",
  validate(customerSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.booking.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) throw new HttpError(404, "Booking not found");
    const user = requireUser(req);
    await assertProjectAccess(user, existing.projectId);
    const body = req.body as z.infer<typeof customerSchema>;
    const created = await prisma.customer.create({
      data: {
        ...body,
        bookingId: existing.id,
        email: body.email || null,
        dob: body.dob ? new Date(body.dob) : null,
      },
    });
    res.status(201).json(created);
  }),
);

bookingsRouter.patch(
  "/:id/financials",
  validate(financialSchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = await prisma.booking.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) throw new HttpError(404, "Booking not found");
    const user = requireUser(req);
    requirePermission(user, "edit");
    await assertProjectAccess(user, existing.projectId);
    const updated = await prisma.bookingFinancial.update({
      where: { bookingId: existing.id },
      data: req.body,
    });
    res.json(updated);
  }),
);
