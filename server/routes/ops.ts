import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, HttpError, listMeta, listResult } from "../lib/http.ts";
import { accessibleProjectIds, assertProjectAccess, requirePermission } from "../lib/access.ts";
import { requireUser } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";
import { audit } from "../lib/audit.ts";
import { dispatchReminder, notify } from "../lib/notify.ts";
import { applyCustomerPayment } from "../lib/schedule.ts";

export const opsRouter = Router();

const uploadDir = path.resolve("uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^\w.\-]+/g, "_");
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

opsRouter.get(
  "/search",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const ids = await accessibleProjectIds(user);
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) return res.json({ units: [], bookings: [], customers: [], partners: [] });
    const [units, bookings, customers, partners] = await Promise.all([
      prisma.unit.findMany({
        where: { unitNumber: { contains: q }, floor: { wing: { projectId: { in: ids } } } },
        take: 8,
        include: { floor: { include: { wing: { include: { project: true } } } } },
      }),
      prisma.booking.findMany({
        where: { projectId: { in: ids }, bookingNumber: { contains: q } },
        take: 8,
        include: { unit: true, project: true },
      }),
      prisma.customer.findMany({
        where: {
          booking: { projectId: { in: ids } },
          OR: [{ name: { contains: q } }, { mobile: { contains: q } }],
        },
        take: 8,
        include: { booking: { include: { unit: true } } },
      }),
      prisma.channelPartner.findMany({
        where: { OR: [{ name: { contains: q } }, { phone: { contains: q } }] },
        take: 8,
      }),
    ]);
    res.json({ units, bookings, customers, partners });
  }),
);

opsRouter.get(
  "/documents",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const ids = await accessibleProjectIds(user);
    const { page, pageSize, skip, take } = listMeta(req);
    const where = {
      ...(req.query.projectId ? { projectId: String(req.query.projectId) } : { projectId: { in: ids } }),
      ...(req.query.bookingId ? { bookingId: String(req.query.bookingId) } : {}),
      ...(req.query.unitId ? { unitId: String(req.query.unitId) } : {}),
      ...(req.query.entityType ? { entityType: String(req.query.entityType) } : {}),
      ...(req.query.category ? { category: String(req.query.category) } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.document.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      prisma.document.count({ where }),
    ]);
    res.json(listResult(data, total, page, pageSize));
  }),
);

opsRouter.post(
  "/uploads/image",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    if (!user.isSuperAdmin && !user.permissions.includes("add") && !user.permissions.includes("edit")) {
      throw new HttpError(403, "Missing permission: add or edit");
    }
    const file = req.file;
    if (!file) throw new HttpError(422, "Image is required", { file: ["Required"] });
    if (!file.mimetype.startsWith("image/")) {
      throw new HttpError(422, "Only image files are allowed", { file: ["Must be an image"] });
    }
    res.status(201).json({
      url: `/uploads/${file.filename}`,
      name: file.originalname,
      size: file.size,
    });
  }),
);

opsRouter.post(
  "/documents",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "add");
    const file = req.file;
    if (!file) throw new HttpError(422, "File is required", { file: ["Required"] });
    const body = req.body as {
      entityType?: string;
      entityId?: string;
      projectId?: string;
      bookingId?: string;
      unitId?: string;
      customerId?: string;
      category?: string;
      name?: string;
    };
    const created = await prisma.document.create({
      data: {
        entityType: body.entityType || "booking",
        entityId: body.entityId || body.bookingId || body.unitId || body.projectId || "unknown",
        projectId: body.projectId || null,
        bookingId: body.bookingId || null,
        unitId: body.unitId || null,
        customerId: body.customerId || null,
        category: body.category || "other",
        name: body.name || file.originalname,
        fileUrl: `/uploads/${file.filename}`,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedBy: user.id,
      },
    });
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "document.upload",
      entityType: created.entityType,
      entityId: created.entityId,
      projectId: created.projectId,
      meta: { name: created.name },
    });
    res.status(201).json(created);
  }),
);

opsRouter.delete(
  "/documents/:id",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "edit");
    const doc = await prisma.document.findUnique({ where: { id: String(req.params.id) } });
    if (!doc) throw new HttpError(404, "Document not found");
    await prisma.document.delete({ where: { id: doc.id } });
    res.json({ ok: true });
  }),
);

opsRouter.get(
  "/invoices/:id",
  asyncHandler(async (req, res) => {
    const invoice = await prisma.invoice.findUnique({
      where: { id: String(req.params.id) },
      include: {
        booking: {
          include: {
            project: { include: { company: true } },
            unit: true,
            customers: true,
            financials: true,
          },
        },
      },
    });
    if (!invoice) throw new HttpError(404, "Invoice not found");
    res.json(invoice);
  }),
);

opsRouter.get(
  "/reminders",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const ids = await accessibleProjectIds(user);
    const { page, pageSize, skip, take } = listMeta(req);
    const where = {
      ...(req.query.projectId ? { projectId: String(req.query.projectId) } : { OR: [{ projectId: { in: ids } }, { projectId: null }] }),
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.type ? { type: String(req.query.type) } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.reminder.findMany({
        where,
        skip,
        take,
        orderBy: { dueAt: "asc" },
        include: { booking: { include: { unit: true, customers: true } } },
      }),
      prisma.reminder.count({ where }),
    ]);
    res.json(listResult(data, total, page, pageSize));
  }),
);

opsRouter.post(
  "/reminders",
  validate(
    z.object({
      projectId: z.string().optional().nullable(),
      bookingId: z.string().optional().nullable(),
      type: z.string(),
      channel: z.enum(["email", "sms", "whatsapp", "in_app"]).optional(),
      title: z.string().min(2),
      message: z.string().min(2),
      dueAt: z.string(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "add");
    const body = req.body as {
      projectId?: string | null;
      bookingId?: string | null;
      type: string;
      channel?: string;
      title: string;
      message: string;
      dueAt: string;
    };
    const created = await prisma.reminder.create({
      data: {
        ...body,
        dueAt: new Date(body.dueAt),
        channel: body.channel ?? "in_app",
      },
    });
    res.status(201).json(created);
  }),
);

opsRouter.post(
  "/reminders/:id/send",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "edit");
    const sent = await dispatchReminder(String(req.params.id));
    res.json(sent);
  }),
);

opsRouter.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const { page, pageSize, skip, take } = listMeta(req);
    const where = { employeeId: user.id };
    const [data, total, unread] = await Promise.all([
      prisma.notification.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    res.json({ ...listResult(data, total, page, pageSize), unread });
  }),
);

opsRouter.patch(
  "/notifications/:id/read",
  asyncHandler(async (req, res) => {
    const updated = await prisma.notification.update({
      where: { id: String(req.params.id) },
      data: { readAt: new Date() },
    });
    res.json(updated);
  }),
);

opsRouter.post(
  "/notifications/read-all",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    await prisma.notification.updateMany({
      where: { employeeId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ ok: true });
  }),
);

opsRouter.get(
  "/audit",
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = listMeta(req);
    const where = {
      ...(req.query.entityType ? { entityType: String(req.query.entityType) } : {}),
      ...(req.query.entityId ? { entityId: String(req.query.entityId) } : {}),
      ...(req.query.projectId ? { projectId: String(req.query.projectId) } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      prisma.auditLog.count({ where }),
    ]);
    res.json(listResult(data, total, page, pageSize));
  }),
);

opsRouter.get(
  "/approvals",
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = listMeta(req);
    const where = {
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.projectId ? { projectId: String(req.query.projectId) } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.approval.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      prisma.approval.count({ where }),
    ]);
    res.json(listResult(data, total, page, pageSize));
  }),
);

opsRouter.post(
  "/approvals",
  validate(
    z.object({
      type: z.string(),
      entityType: z.string(),
      entityId: z.string(),
      projectId: z.string().optional().nullable(),
      reason: z.string().optional().nullable(),
      payload: z.unknown().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const body = req.body as {
      type: string;
      entityType: string;
      entityId: string;
      projectId?: string | null;
      reason?: string | null;
      payload?: unknown;
    };
    const created = await prisma.approval.create({
      data: {
        type: body.type,
        entityType: body.entityType,
        entityId: body.entityId,
        projectId: body.projectId ?? null,
        requestedBy: user.id,
        reason: body.reason ?? null,
        payload: body.payload ? JSON.stringify(body.payload) : null,
      },
    });
    await notify({
      title: `Approval: ${body.type}`,
      body: `${user.name} requested ${body.type} on ${body.entityType} ${body.entityId}`,
      type: "approval",
      employeeId: user.id,
      linkUrl: "/approvals",
    });
    res.status(201).json(created);
  }),
);

opsRouter.post(
  "/approvals/:id/decide",
  validate(z.object({ status: z.enum(["approved", "rejected"]), reason: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "approve");
    const existing = await prisma.approval.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) throw new HttpError(404, "Approval not found");
    if (existing.status !== "pending") throw new HttpError(409, "Already decided");
    const status = (req.body as { status: "approved" | "rejected"; reason?: string }).status;
    const reason = (req.body as { reason?: string }).reason;

    const updated = await prisma.$transaction(async (tx) => {
      const approval = await tx.approval.update({
        where: { id: existing.id },
        data: { status, decidedBy: user.id, decidedAt: new Date(), reason: reason ?? existing.reason },
      });
      if (status === "approved") {
        if (existing.type === "booking_cancel" && existing.entityType === "booking") {
          await tx.booking.update({ where: { id: existing.entityId }, data: { status: "cancelled" } });
          const booking = await tx.booking.findUnique({ where: { id: existing.entityId } });
          if (booking) await tx.unit.update({ where: { id: booking.unitId }, data: { status: "available" } });
        }
        if (existing.type === "booking_confirm" && existing.entityType === "booking") {
          await tx.booking.update({ where: { id: existing.entityId }, data: { status: "confirmed" } });
          const booking = await tx.booking.findUnique({ where: { id: existing.entityId } });
          if (booking) await tx.unit.update({ where: { id: booking.unitId }, data: { status: "sold" } });
        }
        if (existing.type === "payment_verify" && existing.entityType === "payment") {
          const payment = await tx.payment.update({
            where: { id: existing.entityId },
            data: { status: "verified", verifiedBy: user.id },
          });
          if (payment.appliesTo === "customer") {
            await applyCustomerPayment(tx, payment.bookingId, payment.amount);
          }
        }
      }
      return approval;
    });
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: `approval.${status}`,
      entityType: existing.entityType,
      entityId: existing.entityId,
      projectId: existing.projectId,
    });
    res.json(updated);
  }),
);

opsRouter.get(
  "/settings",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.appSetting.findMany();
    res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  }),
);

opsRouter.patch(
  "/settings",
  validate(z.record(z.string(), z.string())),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "approve");
    const body = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(body)) {
      await prisma.appSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }
    const rows = await prisma.appSetting.findMany();
    res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  }),
);

opsRouter.get(
  "/masters",
  asyncHandler(async (req, res) => {
    const group = req.query.group ? String(req.query.group) : undefined;
    const data = await prisma.masterOption.findMany({
      where: { ...(group ? { group } : {}), active: true },
      orderBy: [{ group: "asc" }, { sortOrder: "asc" }],
    });
    res.json({ data, total: data.length, page: 1, pageSize: data.length });
  }),
);

opsRouter.post(
  "/masters",
  validate(z.object({ group: z.string(), label: z.string(), value: z.string() })),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "add");
    const body = req.body as { group: string; label: string; value: string };
    const created = await prisma.masterOption.create({ data: body });
    res.status(201).json(created);
  }),
);
