import { prisma } from "./prisma.ts";
import { HttpError } from "./http.ts";
import type { AuthUser } from "../middleware/auth.ts";
import { ALL_ACTIONS, isSuperAdminRole } from "./permissions.ts";

export async function assertProjectAccess(
  user: AuthUser,
  projectId: string,
  scope?: { wingId?: string | null; unitId?: string | null },
) {
  if (user.isSuperAdmin) return;

  const rows = await prisma.projectAccess.findMany({
    where: { employeeId: user.id, projectId },
  });
  if (!rows.length) {
    throw new HttpError(403, "No access to this project");
  }
  if (rows.some((r) => !r.wingId && !r.unitId)) return;

  if (scope?.unitId) {
    const unit = await prisma.unit.findUnique({
      where: { id: scope.unitId },
      include: { floor: true },
    });
    if (!unit) throw new HttpError(404, "Unit not found");
    const ok = rows.some(
      (r) =>
        r.unitId === unit.id ||
        (r.wingId === unit.floor.wingId && !r.unitId),
    );
    if (!ok) throw new HttpError(403, "No access to this unit");
    return;
  }

  if (scope?.wingId) {
    const ok = rows.some((r) => r.wingId === scope.wingId);
    if (!ok) throw new HttpError(403, "No access to this wing");
  }
}

export async function accessibleProjectIds(user: AuthUser) {
  if (user.isSuperAdmin) {
    const all = await prisma.project.findMany({ select: { id: true } });
    return all.map((p) => p.id);
  }
  const rows = await prisma.projectAccess.findMany({
    where: { employeeId: user.id },
    select: { projectId: true },
  });
  return [...new Set(rows.map((r) => r.projectId))];
}

export function requirePermission(user: AuthUser, action: string) {
  if (user.isSuperAdmin) return;
  if (!user.permissions.includes(action) && !user.permissions.includes("view")) {
    throw new HttpError(403, `Missing permission: ${action}`);
  }
  if (!user.permissions.includes(action) && action !== "view") {
    throw new HttpError(403, `Missing permission: ${action}`);
  }
}

/** Ensure Super Admin role has every action permission. */
export async function ensureSuperAdminPermissions(roleId: string) {
  const existing = await prisma.permission.findMany({ where: { roleId }, select: { action: true } });
  const have = new Set(existing.map((p) => p.action));
  const missing = ALL_ACTIONS.filter((a) => !have.has(a));
  for (const action of missing) {
    await prisma.permission.create({ data: { roleId, action } });
  }
}

/** Grant project-level access (no wing/unit scope) if missing. */
export async function ensureProjectAccess(employeeId: string, projectId: string) {
  const existing = await prisma.projectAccess.findFirst({
    where: { employeeId, projectId, wingId: null, unitId: null },
  });
  if (existing) return existing;
  return prisma.projectAccess.create({
    data: { employeeId, projectId, wingId: null, unitId: null },
  });
}

/** Super Admins get every project; used on account creation / role promotion. */
export async function grantAllProjectsToEmployee(employeeId: string) {
  const projects = await prisma.project.findMany({ select: { id: true } });
  for (const p of projects) {
    await ensureProjectAccess(employeeId, p.id);
  }
}

/** On new project: every Super Admin (and optional creator) gets access. */
export async function grantDefaultAccessOnProjectCreate(
  projectId: string,
  creatorEmployeeId?: string | null,
) {
  const superAdmins = await prisma.employee.findMany({
    where: { status: "active", role: { name: "Super Admin" } },
    select: { id: true },
  });
  const ids = new Set(superAdmins.map((e) => e.id));
  if (creatorEmployeeId) ids.add(creatorEmployeeId);
  for (const employeeId of ids) {
    await ensureProjectAccess(employeeId, projectId);
  }
}

export { isSuperAdminRole, ALL_ACTIONS };
