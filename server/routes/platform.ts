import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { platformPrisma, type ClientAccount, type Plan } from "../lib/platform-prisma.ts";
import { asyncHandler, HttpError, listMeta, listResult } from "../lib/http.ts";
import { validate } from "../middleware/validate.ts";
import {
  platformAuthRequired,
  requirePlatformUser,
  signPlatformToken,
} from "../middleware/platform-auth.ts";
import {
  provisionTenant,
  resetTenantAdminPassword,
  tenantUsage,
} from "../lib/tenant-prisma.ts";

type AccountWithPlan = ClientAccount & { plan: Plan };

export const platformRouter = Router();

const slugSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, hyphens");

platformRouter.post(
  "/auth/login",
  validate(
    z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };
    const user = await platformPrisma.platformUser.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user || user.status !== "active") {
      throw new HttpError(401, "Invalid email or password");
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new HttpError(401, "Invalid email or password");
    res.json({
      token: signPlatformToken(user.id),
      user: { id: user.id, name: user.name, email: user.email },
    });
  }),
);

platformRouter.get(
  "/auth/me",
  platformAuthRequired,
  asyncHandler(async (req, res) => {
    const user = requirePlatformUser(req);
    res.json(user);
  }),
);

platformRouter.get(
  "/dashboard",
  platformAuthRequired,
  asyncHandler(async (_req, res) => {
    const [total, active, trial, suspended, expired, byPlan] = await Promise.all([
      platformPrisma.clientAccount.count(),
      platformPrisma.clientAccount.count({ where: { status: "active" } }),
      platformPrisma.clientAccount.count({ where: { status: "trial" } }),
      platformPrisma.clientAccount.count({ where: { status: "suspended" } }),
      platformPrisma.clientAccount.count({ where: { status: "expired" } }),
      platformPrisma.clientAccount.groupBy({
        by: ["planId"],
        _count: { _all: true },
      }),
    ]);
    const plans = await platformPrisma.plan.findMany();
    const planMap = Object.fromEntries(plans.map((p: Plan) => [p.id, p.code]));
    res.json({
      total,
      active,
      trial,
      suspended,
      expired,
      byPlan: byPlan.map((r: { planId: string; _count: { _all: number } }) => ({
        planId: r.planId,
        planCode: planMap[r.planId] ?? "?",
        count: r._count._all,
      })),
    });
  }),
);

platformRouter.get(
  "/plans",
  platformAuthRequired,
  asyncHandler(async (_req, res) => {
    const data = await platformPrisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
    res.json({ data, total: data.length });
  }),
);

platformRouter.patch(
  "/plans/:id",
  platformAuthRequired,
  validate(
    z.object({
      name: z.string().min(1).optional(),
      maxUsers: z.number().int().min(1).optional(),
      maxProjects: z.number().int().min(1).optional(),
      maxUnits: z.number().int().min(1).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const updated = await platformPrisma.plan.update({
      where: { id: String(req.params.id) },
      data: req.body,
    });
    res.json(updated);
  }),
);

function accountInclude() {
  return { plan: true } as const;
}

platformRouter.get(
  "/accounts",
  platformAuthRequired,
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = listMeta(req);
    const q = String(req.query.search ?? "").trim();
    const status = req.query.status ? String(req.query.status) : null;
    const where = {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { slug: { contains: q } },
              { adminEmail: { contains: q } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      platformPrisma.clientAccount.findMany({
        where,
        include: accountInclude(),
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      platformPrisma.clientAccount.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map(async (row: AccountWithPlan) => {
        const usage = await tenantUsage(row.slug);
        return {
          ...row,
          limits: {
            maxUsers: row.maxUsers ?? row.plan.maxUsers,
            maxProjects: row.maxProjects ?? row.plan.maxProjects,
            maxUnits: row.maxUnits ?? row.plan.maxUnits,
          },
          usage,
        };
      }),
    );
    res.json(listResult(data, total, page, pageSize));
  }),
);

platformRouter.get(
  "/accounts/:id",
  platformAuthRequired,
  asyncHandler(async (req, res) => {
    const row = await platformPrisma.clientAccount.findUnique({
      where: { id: String(req.params.id) },
      include: accountInclude(),
    });
    if (!row) throw new HttpError(404, "Account not found");
    const usage = await tenantUsage(row.slug);
    res.json({
      ...row,
      limits: {
        maxUsers: row.maxUsers ?? row.plan.maxUsers,
        maxProjects: row.maxProjects ?? row.plan.maxProjects,
        maxUnits: row.maxUnits ?? row.plan.maxUnits,
      },
      usage,
      workspaceUrl: `/t/${row.slug}/login`,
    });
  }),
);

platformRouter.post(
  "/accounts",
  platformAuthRequired,
  validate(
    z.object({
      name: z.string().min(2),
      slug: slugSchema,
      planCode: z.enum(["free", "basic", "pro"]).default("basic"),
      status: z.enum(["trial", "active", "suspended", "expired"]).optional(),
      expiresAt: z.string().optional().nullable(),
      maxUsers: z.number().int().min(1).optional().nullable(),
      maxProjects: z.number().int().min(1).optional().nullable(),
      maxUnits: z.number().int().min(1).optional().nullable(),
      adminName: z.string().min(2),
      adminEmail: z.string().email(),
      adminPassword: z.string().min(6),
      notes: z.string().optional().nullable(),
    }),
  ),
  asyncHandler(async (req, res) => {
    requirePlatformUser(req);
    const body = req.body as {
      name: string;
      slug: string;
      planCode: "free" | "basic" | "pro";
      status?: string;
      expiresAt?: string | null;
      maxUsers?: number | null;
      maxProjects?: number | null;
      maxUnits?: number | null;
      adminName: string;
      adminEmail: string;
      adminPassword: string;
      notes?: string | null;
    };

    const slug = body.slug.toLowerCase();
    const clash = await platformPrisma.clientAccount.findUnique({ where: { slug } });
    if (clash) throw new HttpError(409, "Slug already in use");

    const plan = await platformPrisma.plan.findUnique({ where: { code: body.planCode } });
    if (!plan) throw new HttpError(404, "Plan not found");

    const provisioned = await provisionTenant({
      slug,
      adminName: body.adminName,
      adminEmail: body.adminEmail,
      adminPassword: body.adminPassword,
    });

    const created = await platformPrisma.clientAccount.create({
      data: {
        name: body.name,
        slug,
        planId: plan.id,
        status: body.status ?? "trial",
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        maxUsers: body.maxUsers ?? null,
        maxProjects: body.maxProjects ?? null,
        maxUnits: body.maxUnits ?? null,
        dbFile: provisioned.dbFile,
        adminEmail: body.adminEmail.toLowerCase(),
        adminName: body.adminName,
        notes: body.notes ?? null,
      },
      include: accountInclude(),
    });

    res.status(201).json({
      ...created,
      limits: {
        maxUsers: created.maxUsers ?? created.plan.maxUsers,
        maxProjects: created.maxProjects ?? created.plan.maxProjects,
        maxUnits: created.maxUnits ?? created.plan.maxUnits,
      },
      workspaceUrl: `/t/${created.slug}/login`,
    });
  }),
);

platformRouter.patch(
  "/accounts/:id",
  platformAuthRequired,
  validate(
    z.object({
      name: z.string().min(2).optional(),
      planCode: z.enum(["free", "basic", "pro"]).optional(),
      status: z.enum(["trial", "active", "suspended", "expired"]).optional(),
      expiresAt: z.string().optional().nullable(),
      maxUsers: z.number().int().min(1).optional().nullable(),
      maxProjects: z.number().int().min(1).optional().nullable(),
      maxUnits: z.number().int().min(1).optional().nullable(),
      notes: z.string().optional().nullable(),
      adminName: z.string().min(2).optional(),
      adminEmail: z.string().email().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await platformPrisma.clientAccount.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Account not found");

    const body = req.body as {
      name?: string;
      planCode?: "free" | "basic" | "pro";
      status?: string;
      expiresAt?: string | null;
      maxUsers?: number | null;
      maxProjects?: number | null;
      maxUnits?: number | null;
      notes?: string | null;
      adminName?: string;
      adminEmail?: string;
    };

    let planId = existing.planId;
    if (body.planCode) {
      const plan = await platformPrisma.plan.findUnique({ where: { code: body.planCode } });
      if (!plan) throw new HttpError(404, "Plan not found");
      planId = plan.id;
    }

    const updated = await platformPrisma.clientAccount.update({
      where: { id },
      data: {
        ...(body.name != null ? { name: body.name } : {}),
        planId,
        ...(body.status != null ? { status: body.status } : {}),
        ...(body.expiresAt !== undefined
          ? { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null }
          : {}),
        ...(body.maxUsers !== undefined ? { maxUsers: body.maxUsers } : {}),
        ...(body.maxProjects !== undefined ? { maxProjects: body.maxProjects } : {}),
        ...(body.maxUnits !== undefined ? { maxUnits: body.maxUnits } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.adminName != null ? { adminName: body.adminName } : {}),
        ...(body.adminEmail != null ? { adminEmail: body.adminEmail.toLowerCase() } : {}),
      },
      include: accountInclude(),
    });

    res.json({
      ...updated,
      limits: {
        maxUsers: updated.maxUsers ?? updated.plan.maxUsers,
        maxProjects: updated.maxProjects ?? updated.plan.maxProjects,
        maxUnits: updated.maxUnits ?? updated.plan.maxUnits,
      },
      workspaceUrl: `/t/${updated.slug}/login`,
    });
  }),
);

platformRouter.post(
  "/accounts/:id/reset-admin-password",
  platformAuthRequired,
  validate(z.object({ password: z.string().min(6) })),
  asyncHandler(async (req, res) => {
    const account = await platformPrisma.clientAccount.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!account) throw new HttpError(404, "Account not found");
    const { password } = req.body as { password: string };
    await resetTenantAdminPassword(account.slug, account.adminEmail, password);
    res.json({ ok: true });
  }),
);

platformRouter.post(
  "/accounts/:id/suspend",
  platformAuthRequired,
  asyncHandler(async (req, res) => {
    const updated = await platformPrisma.clientAccount.update({
      where: { id: String(req.params.id) },
      data: { status: "suspended" },
      include: accountInclude(),
    });
    res.json(updated);
  }),
);

platformRouter.post(
  "/accounts/:id/activate",
  platformAuthRequired,
  asyncHandler(async (req, res) => {
    const updated = await platformPrisma.clientAccount.update({
      where: { id: String(req.params.id) },
      data: { status: "active" },
      include: accountInclude(),
    });
    res.json(updated);
  }),
);
