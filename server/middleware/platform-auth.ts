import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { platformPrisma } from "../lib/platform-prisma.ts";
import { HttpError } from "../lib/http.ts";

const JWT_SECRET = process.env.JWT_SECRET ?? "unitdesk-dev-secret-change-in-production";

export type PlatformAuthUser = {
  id: string;
  name: string;
  email: string;
};

declare global {
  namespace Express {
    interface Request {
      platformUser?: PlatformAuthUser;
    }
  }
}

export function signPlatformToken(userId: string) {
  return jwt.sign({ sub: userId, kind: "platform" }, JWT_SECRET, { expiresIn: "7d" });
}

export async function platformAuthRequired(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new HttpError(401, "Unauthorized");
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; kind?: string };
    if (payload.kind !== "platform") throw new HttpError(403, "Platform access only");
    const user = await platformPrisma.platformUser.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== "active") throw new HttpError(401, "Unauthorized");
    req.platformUser = { id: user.id, name: user.name, email: user.email };
    next();
  } catch (err) {
    next(err instanceof HttpError ? err : new HttpError(401, "Unauthorized"));
  }
}

export function requirePlatformUser(req: Request): PlatformAuthUser {
  if (!req.platformUser) throw new HttpError(401, "Unauthorized");
  return req.platformUser;
}
