import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { asyncHandler, HttpError } from "../lib/http.ts";
import { requireUser } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";
import {
  clearBusinessData,
  createBackup,
  databaseStatus,
  deleteBackup,
  getBackupFile,
  listBackups,
  restoreBackup,
} from "../lib/database.ts";

export const databaseRouter = Router();

function requireSuperAdmin(user: ReturnType<typeof requireUser>) {
  if (!user.isSuperAdmin) throw new HttpError(403, "Super Admin only");
}

async function verifyAdminPassword(userId: string, password: string) {
  const employee = await prisma.employee.findUnique({ where: { id: userId } });
  if (!employee) throw new HttpError(401, "Unauthorized");
  const ok = await bcrypt.compare(password, employee.passwordHash);
  if (!ok) throw new HttpError(403, "Incorrect password");
}

databaseRouter.get(
  "/status",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requireSuperAdmin(user);
    res.json(await databaseStatus());
  }),
);

databaseRouter.get(
  "/backups",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requireSuperAdmin(user);
    const data = listBackups();
    res.json({ data, total: data.length, page: 1, pageSize: data.length });
  }),
);

databaseRouter.post(
  "/backups",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requireSuperAdmin(user);
    const backup = await createBackup({
      kind: "manual",
      actorId: user.id,
      actorName: user.name,
    });
    res.status(201).json(backup);
  }),
);

databaseRouter.get(
  "/backups/:id/download",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requireSuperAdmin(user);
    const name = String(req.params.id);
    const file = getBackupFile(name);
    res.download(file, name);
  }),
);

databaseRouter.post(
  "/backups/:id/restore",
  validate(z.object({ password: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requireSuperAdmin(user);
    const body = req.body as { password: string };
    await verifyAdminPassword(user.id, body.password);
    const result = await restoreBackup(String(req.params.id), {
      id: user.id,
      name: user.name,
    });
    res.json(result);
  }),
);

databaseRouter.delete(
  "/backups/:id",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requireSuperAdmin(user);
    res.json(
      await deleteBackup(String(req.params.id), { id: user.id, name: user.name }),
    );
  }),
);

databaseRouter.post(
  "/clear",
  validate(
    z.object({
      password: z.string().min(1),
      confirm: z.literal("CLEAR"),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    requireSuperAdmin(user);
    const body = req.body as { password: string; confirm: "CLEAR" };
    await verifyAdminPassword(user.id, body.password);
    const result = await clearBusinessData({ id: user.id, name: user.name });
    res.json(result);
  }),
);
