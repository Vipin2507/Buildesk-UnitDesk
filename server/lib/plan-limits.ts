import type { Request } from "express";
import { prisma } from "./prisma.ts";
import { HttpError } from "./http.ts";
import { effectiveLimits } from "../middleware/tenant.ts";

export async function assertCanCreateUser(req: Request) {
  const limits = effectiveLimits(req);
  if (!limits) return;
  const count = await prisma.employee.count();
  if (count >= limits.maxUsers) {
    throw new HttpError(403, `User limit reached (${limits.maxUsers}). Upgrade the plan.`);
  }
}

export async function assertCanCreateProject(req: Request) {
  const limits = effectiveLimits(req);
  if (!limits) return;
  const count = await prisma.project.count();
  if (count >= limits.maxProjects) {
    throw new HttpError(403, `Project limit reached (${limits.maxProjects}). Upgrade the plan.`);
  }
}

export async function assertCanCreateUnit(req: Request, addCount = 1) {
  const limits = effectiveLimits(req);
  if (!limits) return;
  const count = await prisma.unit.count();
  if (count + addCount > limits.maxUnits) {
    throw new HttpError(403, `Unit limit reached (${limits.maxUnits}). Upgrade the plan.`);
  }
}
