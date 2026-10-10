import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { defaultPrisma, prisma } from "../lib/prisma.ts";
import { asyncHandler, HttpError } from "../lib/http.ts";
import { authRequired, requireUser, signToken } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";
import { ALL_ACTIONS, isSuperAdminRole } from "../lib/permissions.ts";
import { resolveSlugByEmail } from "../lib/workspace-email.ts";
import { getTenantPrisma } from "../lib/tenant-prisma.ts";

export const authRouter = Router();

function legacyEnabled() {
  const v = (process.env.LEGACY_SINGLE_DB ?? "true").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

async function loginAgainst(
  client: PrismaClient,
  email: string,
  password: string,
  tenantSlug: string | null,
) {
  const employee = await client.employee.findUnique({
    where: { email: email.toLowerCase() },
    include: { role: { include: { permissions: true } } },
  });
  if (!employee || employee.status !== "active") {
    throw new HttpError(401, "Invalid email or password");
  }
  const ok = await bcrypt.compare(password, employee.passwordHash);
  if (!ok) throw new HttpError(401, "Invalid email or password");
  const superAdmin = isSuperAdminRole(employee.role);
  if (superAdmin) {
    const existing = await client.permission.findMany({
      where: { roleId: employee.roleId },
      select: { action: true },
    });
    const have = new Set(existing.map((p) => p.action));
    for (const action of ALL_ACTIONS) {
      if (!have.has(action)) {
        await client.permission.create({ data: { roleId: employee.roleId, action } });
      }
    }
  }
  const token = signToken(employee.id);
  return {
    token,
    tenantSlug,
    user: {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      role: employee.role.name,
      permissions: superAdmin ? [...ALL_ACTIONS] : employee.role.permissions.map((p) => p.action),
      isSuperAdmin: superAdmin,
      kind: "employee" as const,
    },
  };
}

authRouter.post(
  "/login",
  validate(
    z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };
    const normalized = email.toLowerCase();

    // 1) Multi-tenant: resolve workspace from global email directory (no slug needed)
    const slug = await resolveSlugByEmail(normalized);
    if (slug) {
      const client = getTenantPrisma(slug);
      const result = await loginAgainst(client, normalized, password, slug);
      return res.json(result);
    }

    // 2) Legacy single-DB install
    if (legacyEnabled()) {
      try {
        const result = await loginAgainst(defaultPrisma, normalized, password, null);
        return res.json(result);
      } catch (err) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(401, "Invalid email or password");
      }
    }

    // 3) Fallback: current request-scoped prisma (if X-Tenant-Slug was sent)
    try {
      const result = await loginAgainst(prisma, normalized, password, null);
      return res.json(result);
    } catch {
      throw new HttpError(401, "Invalid email or password");
    }
  }),
);

authRouter.get(
  "/me",
  authRequired,
  asyncHandler(async (req, res) => {
    res.json(requireUser(req));
  }),
);
