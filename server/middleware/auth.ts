import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.ts";
import { HttpError } from "../lib/http.ts";

const JWT_SECRET = process.env.JWT_SECRET ?? "unitdesk-dev-secret-change-in-production";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  isSuperAdmin: boolean;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      partner?: { id: string; name: string };
    }
  }
}

export function signToken(employeeId: string) {
  return jwt.sign({ sub: employeeId, kind: "employee" }, JWT_SECRET, { expiresIn: "7d" });
}

export async function authRequired(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new HttpError(401, "Unauthorized");
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; kind?: string };
    if (payload.kind === "partner") throw new HttpError(403, "Employee workspace only");
    const employee = await prisma.employee.findUnique({
      where: { id: payload.sub },
      include: { role: { include: { permissions: true } } },
    });
    if (!employee || employee.status !== "active") throw new HttpError(401, "Unauthorized");
    req.user = {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      role: employee.role.name,
      permissions: employee.role.permissions.map((p) => p.action),
      isSuperAdmin: employee.role.name === "Super Admin",
    };
    next();
  } catch (err) {
    next(err instanceof HttpError ? err : new HttpError(401, "Unauthorized"));
  }
}

export function requireUser(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  return req.user;
}
