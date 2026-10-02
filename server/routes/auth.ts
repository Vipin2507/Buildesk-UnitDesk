import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, HttpError } from "../lib/http.ts";
import { authRequired, requireUser, signToken } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";
import { ALL_ACTIONS, isSuperAdminRole } from "../lib/permissions.ts";
import { ensureSuperAdminPermissions } from "../lib/access.ts";

export const authRouter = Router();

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
    const employee = await prisma.employee.findUnique({
      where: { email: email.toLowerCase() },
      include: { role: { include: { permissions: true } } },
    });
    if (!employee) throw new HttpError(401, "Invalid email or password");
    const ok = await bcrypt.compare(password, employee.passwordHash);
    if (!ok) throw new HttpError(401, "Invalid email or password");
    const superAdmin = isSuperAdminRole(employee.role);
    if (superAdmin) await ensureSuperAdminPermissions(employee.roleId);
    const token = signToken(employee.id);
    res.json({
      token,
      user: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        role: employee.role.name,
        permissions: superAdmin ? [...ALL_ACTIONS] : employee.role.permissions.map((p) => p.action),
        isSuperAdmin: superAdmin,
        kind: "employee" as const,
      },
    });
  }),
);

authRouter.get(
  "/me",
  authRequired,
  asyncHandler(async (req, res) => {
    res.json(requireUser(req));
  }),
);
