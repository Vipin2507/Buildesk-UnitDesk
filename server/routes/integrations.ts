import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, HttpError } from "../lib/http.ts";
import { requirePermission } from "../lib/access.ts";
import { requireUser } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";
import { notify } from "../lib/notify.ts";
import { audit } from "../lib/audit.ts";

export const integrationsRouter = Router();

integrationsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const data = await prisma.integration.findMany({ orderBy: { name: "asc" } });
    const logs = await prisma.messageLog.findMany({ take: 25, orderBy: { createdAt: "desc" } });
    res.json({ data, total: data.length, page: 1, pageSize: data.length, logs });
  }),
);

integrationsRouter.patch(
  "/:id",
  validate(
    z.object({
      enabled: z.boolean().optional(),
      config: z.record(z.string(), z.string()).optional(),
      name: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "approve");
    const existing = await prisma.integration.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) throw new HttpError(404, "Integration not found");
    const body = req.body as { enabled?: boolean; config?: Record<string, string>; name?: string };
    const updated = await prisma.integration.update({
      where: { id: existing.id },
      data: {
        enabled: body.enabled,
        name: body.name,
        config: body.config ? JSON.stringify({ ...JSON.parse(existing.config || "{}"), ...body.config }) : undefined,
      },
    });
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "integration.update",
      entityType: "integration",
      entityId: updated.id,
      meta: { provider: updated.provider, enabled: updated.enabled },
    });
    res.json(updated);
  }),
);

integrationsRouter.post(
  "/:id/test",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "approve");
    const existing = await prisma.integration.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) throw new HttpError(404, "Integration not found");
    const ok = existing.enabled;
    await prisma.integration.update({
      where: { id: existing.id },
      data: { lastTestAt: new Date(), lastTestOk: ok },
    });
    await prisma.messageLog.create({
      data: {
        provider: existing.provider,
        toAddress: "vipin@cravingcode.in",
        subject: "Connectivity test",
        body: `Test ping for ${existing.name}`,
        status: ok ? "sent" : "failed",
        error: ok ? null : "Enable the integration before testing",
      },
    });
    res.json({ ok, message: ok ? "Test delivered to message log" : "Enable the channel first" });
  }),
);

integrationsRouter.post(
  "/:id/send",
  validate(z.object({ to: z.string(), subject: z.string().optional(), body: z.string() })),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const existing = await prisma.integration.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) throw new HttpError(404, "Integration not found");
    const body = req.body as { to: string; subject?: string; body: string };
    const result = await notify({
      title: body.subject || existing.name,
      body: body.body,
      type: "outbound",
      employeeId: user.id,
      channel: existing.provider as "email" | "sms" | "whatsapp",
      to: body.to,
    });
    res.json(result);
  }),
);
