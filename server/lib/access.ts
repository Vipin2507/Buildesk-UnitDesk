import { prisma } from "./prisma.ts";
import { HttpError } from "./http.ts";
import type { AuthUser } from "../middleware/auth.ts";

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
  if (
    !user.permissions.includes(action) &&
    action !== "view"
  ) {
    throw new HttpError(403, `Missing permission: ${action}`);
  }
}
