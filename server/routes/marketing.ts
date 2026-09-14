import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, HttpError, listMeta, listResult } from "../lib/http.ts";
import { accessibleProjectIds, requirePermission } from "../lib/access.ts";
import { requireUser } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";
import { notify } from "../lib/notify.ts";
import { audit } from "../lib/audit.ts";

export const marketingRouter = Router();

marketingRouter.get(
  "/leads",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const ids = await accessibleProjectIds(user);
    const { page, pageSize, skip, take } = listMeta(req);
    const search = String(req.query.search ?? "").trim();
    const where = {
      ...(req.query.projectId ? { projectId: String(req.query.projectId) } : { OR: [{ projectId: { in: ids } }, { projectId: null }] }),
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(search ? { OR: [{ name: { contains: search } }, { phone: { contains: search } }] } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: { project: true },
      }),
      prisma.lead.count({ where }),
    ]);
    res.json(listResult(data, total, page, pageSize));
  }),
);

marketingRouter.post(
  "/leads",
  validate(
    z.object({
      projectId: z.string().optional().nullable(),
      name: z.string().min(2),
      phone: z.string().optional().nullable(),
      email: z.string().optional().nullable(),
      source: z.string().optional().nullable(),
      status: z.string().optional(),
      notes: z.string().optional().nullable(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "add");
    const created = await prisma.lead.create({ data: req.body });
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "lead.create",
      entityType: "lead",
      entityId: created.id,
      projectId: created.projectId,
    });
    res.status(201).json(created);
  }),
);

marketingRouter.patch(
  "/leads/:id",
  validate(
    z.object({
      name: z.string().optional(),
      phone: z.string().optional().nullable(),
      email: z.string().optional().nullable(),
      source: z.string().optional().nullable(),
      status: z.string().optional(),
      notes: z.string().optional().nullable(),
      projectId: z.string().optional().nullable(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const updated = await prisma.lead.update({
      where: { id: String(req.params.id) },
      data: req.body,
    });
    res.json(updated);
  }),
);

marketingRouter.get(
  "/campaigns",
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = listMeta(req);
    const where = {
      ...(req.query.projectId ? { projectId: String(req.query.projectId) } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: { project: true },
      }),
      prisma.campaign.count({ where }),
    ]);
    res.json(listResult(data, total, page, pageSize));
  }),
);

marketingRouter.post(
  "/campaigns",
  validate(
    z.object({
      projectId: z.string().optional().nullable(),
      name: z.string().min(2),
      channel: z.enum(["email", "sms", "whatsapp"]),
      audience: z.enum(["customers", "partners", "leads"]),
      message: z.string().min(2),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "add");
    const created = await prisma.campaign.create({ data: req.body });
    res.status(201).json(created);
  }),
);

marketingRouter.post(
  "/campaigns/:id/send",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "edit");
    const campaign = await prisma.campaign.findUnique({ where: { id: String(req.params.id) } });
    if (!campaign) throw new HttpError(404, "Campaign not found");
    let recipients: { to: string; name: string }[] = [];
    if (campaign.audience === "leads") {
      const leads = await prisma.lead.findMany({
        where: { projectId: campaign.projectId ?? undefined },
      });
      recipients = leads
        .map((l) => ({ to: l.email || l.phone || "", name: l.name }))
        .filter((r) => r.to);
    } else if (campaign.audience === "partners") {
      const partners = await prisma.channelPartner.findMany({ where: { status: "active" } });
      recipients = partners
        .map((p) => ({ to: p.email || p.phone || "", name: p.name }))
        .filter((r) => r.to);
    } else {
      const customers = await prisma.customer.findMany({
        where: campaign.projectId ? { booking: { projectId: campaign.projectId } } : {},
      });
      recipients = customers
        .map((c) => ({ to: c.email || c.mobile, name: c.name }))
        .filter((r) => r.to);
    }
    for (const r of recipients) {
      await notify({
        title: campaign.name,
        body: campaign.message.replace("{name}", r.name),
        type: "campaign",
        channel: campaign.channel as "email" | "sms" | "whatsapp",
        to: r.to,
        employeeId: user.id,
      });
    }
    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "sent", sentCount: recipients.length },
    });
    res.json(updated);
  }),
);
