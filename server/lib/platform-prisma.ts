import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/platform-client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function platformDbUrl() {
  const raw = process.env.PLATFORM_DATABASE_URL ?? "file:../platform.db";
  if (raw.startsWith("file:")) {
    const file = raw.slice("file:".length);
    if (path.isAbsolute(file)) return raw;
    // Schema lives in prisma/platform/ — relative URLs resolve from there
    const abs = path.resolve(root, "prisma/platform", file);
    return `file:${abs}`;
  }
  return raw;
}

const globalForPlatform = globalThis as unknown as { platformPrisma?: PrismaClient };

export const platformPrisma =
  globalForPlatform.platformPrisma ??
  new PrismaClient({
    datasources: { db: { url: platformDbUrl() } },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPlatform.platformPrisma = platformPrisma;
}

export function platformDbFilePath() {
  const url = platformDbUrl();
  return url.replace(/^file:/, "");
}

export type { Plan, ClientAccount, PlatformUser } from "@prisma/platform-client";
