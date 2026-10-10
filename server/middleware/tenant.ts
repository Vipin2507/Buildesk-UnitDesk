import type { NextFunction, Request, Response } from "express";
import { platformPrisma } from "../lib/platform-prisma.ts";
import { defaultPrisma, runWithPrisma } from "../lib/prisma.ts";
import { getTenantPrisma, tenantDbPath } from "../lib/tenant-prisma.ts";
import { HttpError } from "../lib/http.ts";

export type TenantContext = {
  id: string;
  slug: string;
  name: string;
  status: string;
  maxUsers: number;
  maxProjects: number;
  maxUnits: number;
  expiresAt: Date | null;
  adminEmail: string;
};

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext | null;
      tenantSlug?: string | null;
    }
  }
}

function legacyEnabled() {
  const v = (process.env.LEGACY_SINGLE_DB ?? "true").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function extractSlug(req: Request): string | null {
  const header = req.header("x-tenant-slug")?.trim().toLowerCase();
  if (header) return header;
  const q = typeof req.query.tenant === "string" ? req.query.tenant.trim().toLowerCase() : "";
  if (q) return q;
  return null;
}

export async function resolveTenant(req: Request, res: Response, next: NextFunction) {
  // Platform + health never need a tenant DB
  if (req.path.startsWith("/api/platform") || req.path === "/api/health") {
    return next();
  }
  if (!req.path.startsWith("/api/")) {
    return next();
  }

  const slug = extractSlug(req);

  try {
    if (!slug) {
      if (!legacyEnabled()) {
        throw new HttpError(400, "Workspace slug required (X-Tenant-Slug)");
      }
      req.tenant = null;
      req.tenantSlug = null;
      return runWithPrisma({ client: defaultPrisma, dbPath: "" }, () => next());
    }

    const account = await platformPrisma.clientAccount.findUnique({
      where: { slug },
      include: { plan: true },
    });
    if (!account) throw new HttpError(404, `Unknown workspace "${slug}"`);

    if (account.status === "suspended") {
      throw new HttpError(403, "This workspace is suspended");
    }
    if (account.expiresAt && account.expiresAt.getTime() < Date.now()) {
      if (account.status !== "expired") {
        await platformPrisma.clientAccount.update({
          where: { id: account.id },
          data: { status: "expired" },
        });
      }
      throw new HttpError(403, "This workspace has expired");
    }
    if (account.status === "expired") {
      throw new HttpError(403, "This workspace has expired");
    }

    const maxUsers = account.maxUsers ?? account.plan.maxUsers;
    const maxProjects = account.maxProjects ?? account.plan.maxProjects;
    const maxUnits = account.maxUnits ?? account.plan.maxUnits;

    req.tenant = {
      id: account.id,
      slug: account.slug,
      name: account.name,
      status: account.status,
      maxUsers,
      maxProjects,
      maxUnits,
      expiresAt: account.expiresAt,
      adminEmail: account.adminEmail,
    };
    req.tenantSlug = account.slug;

    const client = getTenantPrisma(account.slug);
    return runWithPrisma({ client, dbPath: tenantDbPath(account.slug) }, () => next());
  } catch (err) {
    next(err);
  }
}

export function effectiveLimits(req: Request) {
  return req.tenant
    ? {
        maxUsers: req.tenant.maxUsers,
        maxProjects: req.tenant.maxProjects,
        maxUnits: req.tenant.maxUnits,
      }
    : null;
}
