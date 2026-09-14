import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, HttpError, listMeta, listResult } from "../lib/http.ts";
import { requirePermission } from "../lib/access.ts";
import { audit } from "../lib/audit.ts";
import { requireUser } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";

export const employeesRouter = Router();

const ACTIONS = [
  "view",
  "add",
  "edit",
  "book",
  "hold",
  "cancel",
  "payment_view",
  "payment_entry",
  "approve",
  "reports",
  "export",
];

const ACTION_SET = ACTIONS as [string, ...string[]];

function publicEmployee<T extends { passwordHash: string }>(row: T) {
  const { passwordHash: _, ...rest } = row;
  return rest;
}

async function assertRoleExists(roleId: string) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new HttpError(404, "Role not found");
  return role;
}

async function assertCanDropSuperAdmin(employeeId: string) {
  const remaining = await prisma.employee.count({
    where: {
      id: { not: employeeId },
      status: "active",
      role: { name: "Super Admin" },
    },
  });
  if (remaining === 0) throw new HttpError(409, "Cannot remove the last Super Admin");
}

employeesRouter.get(
  "/roles",
  asyncHandler(async (_req, res) => {
    const data = await prisma.role.findMany({
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      include: { permissions: true, _count: { select: { employees: true } } },
    });
    res.json({ data, total: data.length, page: 1, pageSize: data.length });
  }),
);

employeesRouter.get(
  "/actions",
  asyncHandler(async (_req, res) => {
    res.json({ data: ACTIONS });
  }),
);

employeesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = listMeta(req);
    const [data, total] = await Promise.all([
      prisma.employee.findMany({
        skip,
        take,
        orderBy: { name: "asc" },
        include: { role: true, access: { include: { project: true, wing: true } } },
      }),
      prisma.employee.count(),
    ]);
    res.json(
      listResult(
        data.map(({ passwordHash: _, ...rest }) => rest),
        total,
        page,
        pageSize,
      ),
    );
  }),
);

employeesRouter.post(
  "/roles",
  validate(
    z.object({
      name: z.string().min(2),
      permissions: z.array(z.enum(ACTION_SET)).min(1),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "approve");
    const body = req.body as { name: string; permissions: string[] };
    const exists = await prisma.role.findUnique({ where: { name: body.name } });
    if (exists) throw new HttpError(409, "A role with this name already exists");
    const role = await prisma.role.create({
      data: {
        name: body.name,
        permissions: { create: body.permissions.map((action) => ({ action })) },
      },
      include: { permissions: true, _count: { select: { employees: true } } },
    });
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "role.create",
      entityType: "role",
      entityId: role.id,
      meta: { name: role.name, permissions: body.permissions },
    });
    res.status(201).json(role);
  }),
);

employeesRouter.patch(
  "/roles/:id",
  validate(
    z.object({
      name: z.string().min(2).optional(),
      permissions: z.array(z.enum(ACTION_SET)).min(1).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "approve");
    const id = String(req.params.id);
    const body = req.body as { name?: string; permissions?: string[] };
    const role = await prisma.role.findUnique({ where: { id }, include: { permissions: true } });
    if (!role) throw new HttpError(404, "Role not found");
    if (role.isSystem && body.name && body.name !== role.name) {
      throw new HttpError(409, "System role names cannot be changed");
    }
    if (body.name && body.name !== role.name) {
      const clash = await prisma.role.findUnique({ where: { name: body.name } });
      if (clash) throw new HttpError(409, "A role with this name already exists");
    }

    if (body.permissions) {
      await prisma.permission.deleteMany({ where: { roleId: id } });
      await prisma.permission.createMany({
        data: body.permissions.map((action) => ({ roleId: id, action })),
      });
    }
    const updated = await prisma.role.update({
      where: { id },
      data: body.name ? { name: body.name } : {},
      include: { permissions: true, _count: { select: { employees: true } } },
    });
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "role.update",
      entityType: "role",
      entityId: id,
      meta: body,
    });
    res.json(updated);
  }),
);

employeesRouter.delete(
  "/roles/:id",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "approve");
    const id = String(req.params.id);
    const role = await prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { employees: true } } },
    });
    if (!role) throw new HttpError(404, "Role not found");
    if (role.isSystem) throw new HttpError(409, "System roles cannot be deleted");
    if (role._count.employees > 0) {
      throw new HttpError(409, "Reassign users before deleting this role");
    }
    await prisma.role.delete({ where: { id } });
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "role.delete",
      entityType: "role",
      entityId: id,
      meta: { name: role.name },
    });
    res.json({ ok: true });
  }),
);

employeesRouter.post(
  "/",
  validate(
    z.object({
      name: z.string().min(2),
      email: z.string().email(),
      phone: z.string().optional().nullable(),
      password: z.string().min(6),
      roleId: z.string(),
      status: z.enum(["active", "inactive"]).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "add");
    const body = req.body as {
      name: string;
      email: string;
      phone?: string | null;
      password: string;
      roleId: string;
      status?: string;
    };
    await assertRoleExists(body.roleId);
    const email = body.email.toLowerCase();
    const exists = await prisma.employee.findUnique({ where: { email } });
    if (exists) throw new HttpError(409, "A user with this email already exists");
    const created = await prisma.employee.create({
      data: {
        name: body.name,
        email,
        phone: body.phone || null,
        roleId: body.roleId,
        status: body.status ?? "active",
        passwordHash: await bcrypt.hash(body.password, 10),
      },
      include: { role: true, access: { include: { project: true, wing: true } } },
    });
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "employee.create",
      entityType: "employee",
      entityId: created.id,
      meta: { email: created.email, roleId: created.roleId },
    });
    res.status(201).json(publicEmployee(created));
  }),
);

employeesRouter.get(
  "/:id/access",
  asyncHandler(async (req, res) => {
    const data = await prisma.projectAccess.findMany({
      where: { employeeId: String(req.params.id) },
      include: { project: true, wing: true, unit: true },
    });
    res.json({ data, total: data.length, page: 1, pageSize: data.length });
  }),
);

employeesRouter.post(
  "/access",
  validate(
    z.object({
      employeeId: z.string(),
      projectId: z.string(),
      wingId: z.string().optional().nullable(),
      unitId: z.string().optional().nullable(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "approve");
    const body = req.body as {
      employeeId: string;
      projectId: string;
      wingId?: string | null;
      unitId?: string | null;
    };
    const employee = await prisma.employee.findUnique({ where: { id: body.employeeId } });
    if (!employee) throw new HttpError(404, "User not found");
    const project = await prisma.project.findUnique({ where: { id: body.projectId } });
    if (!project) throw new HttpError(404, "Project not found");
    const duplicate = await prisma.projectAccess.findFirst({
      where: {
        employeeId: body.employeeId,
        projectId: body.projectId,
        wingId: body.wingId ?? null,
        unitId: body.unitId ?? null,
      },
    });
    if (duplicate) throw new HttpError(409, "This access is already granted");
    const created = await prisma.projectAccess.create({
      data: {
        employeeId: body.employeeId,
        projectId: body.projectId,
        wingId: body.wingId || null,
        unitId: body.unitId || null,
      },
    });
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "employee.access.grant",
      entityType: "project_access",
      entityId: created.id,
      projectId: body.projectId,
      meta: { employeeId: body.employeeId },
    });
    res.status(201).json(created);
  }),
);

employeesRouter.delete(
  "/access/:id",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "approve");
    const id = String(req.params.id);
    const existing = await prisma.projectAccess.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Access record not found");
    await prisma.projectAccess.delete({ where: { id } });
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "employee.access.revoke",
      entityType: "project_access",
      entityId: id,
      projectId: existing.projectId,
      meta: { employeeId: existing.employeeId },
    });
    res.json({ ok: true });
  }),
);

employeesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const row = await prisma.employee.findUnique({
      where: { id: String(req.params.id) },
      include: { role: true, access: { include: { project: true, wing: true } } },
    });
    if (!row) throw new HttpError(404, "User not found");
    res.json(publicEmployee(row));
  }),
);

employeesRouter.patch(
  "/:id",
  validate(
    z.object({
      name: z.string().min(2).optional(),
      email: z.string().email().optional(),
      phone: z.string().optional().nullable(),
      roleId: z.string().optional(),
      status: z.enum(["active", "inactive"]).optional(),
      password: z.string().min(6).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "edit");
    const id = String(req.params.id);
    const body = req.body as {
      name?: string;
      email?: string;
      phone?: string | null;
      roleId?: string;
      status?: string;
      password?: string;
    };
    const existing = await prisma.employee.findUnique({ where: { id }, include: { role: true } });
    if (!existing) throw new HttpError(404, "User not found");

    if (id === user.id && body.status === "inactive") {
      throw new HttpError(409, "You cannot deactivate your own account");
    }

    let nextRole = existing.role;
    if (body.roleId && body.roleId !== existing.roleId) {
      nextRole = await assertRoleExists(body.roleId);
    }
    const droppingSuper =
      existing.role.name === "Super Admin" &&
      (body.status === "inactive" || (body.roleId && nextRole.name !== "Super Admin"));
    if (droppingSuper) await assertCanDropSuperAdmin(id);

    if (body.email) {
      const email = body.email.toLowerCase();
      const clash = await prisma.employee.findFirst({ where: { email, id: { not: id } } });
      if (clash) throw new HttpError(409, "A user with this email already exists");
    }

    const updated = await prisma.employee.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.email ? { email: body.email.toLowerCase() } : {}),
        ...(body.phone !== undefined ? { phone: body.phone || null } : {}),
        ...(body.roleId ? { roleId: body.roleId } : {}),
        ...(body.status ? { status: body.status } : {}),
        ...(body.password ? { passwordHash: await bcrypt.hash(body.password, 10) } : {}),
      },
      include: { role: true, access: { include: { project: true, wing: true } } },
    });
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "employee.update",
      entityType: "employee",
      entityId: id,
      meta: { ...body, password: body.password ? "[set]" : undefined },
    });
    res.json(publicEmployee(updated));
  }),
);

employeesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requirePermission(user, "approve");
    const id = String(req.params.id);
    if (id === user.id) throw new HttpError(409, "You cannot delete your own account");
    const existing = await prisma.employee.findUnique({ where: { id }, include: { role: true } });
    if (!existing) throw new HttpError(404, "User not found");
    if (existing.role.name === "Super Admin") await assertCanDropSuperAdmin(id);
    await prisma.employee.delete({ where: { id } });
    await audit({
      actorId: user.id,
      actorName: user.name,
      action: "employee.delete",
      entityType: "employee",
      entityId: id,
      meta: { email: existing.email, name: existing.name },
    });
    res.json({ ok: true });
  }),
);

