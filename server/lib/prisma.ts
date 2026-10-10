import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

export type PrismaStore = { client: PrismaClient; dbPath: string };

export const prismaAls = new AsyncLocalStorage<PrismaStore>();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function defaultDbPath() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const file = url.replace(/^file:/, "").replace(/^\.\//, "");
  if (path.isAbsolute(file)) return file;
  return path.resolve(root, "prisma", file);
}

const globalForPrisma = globalThis as unknown as { defaultPrisma?: PrismaClient };

export const defaultPrisma =
  globalForPrisma.defaultPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.defaultPrisma = defaultPrisma;
}

/** Request-scoped tenant client when set; otherwise the legacy/default DB. */
export const prisma: PrismaClient = new Proxy(defaultPrisma, {
  get(_target, prop, receiver) {
    const store = prismaAls.getStore();
    const client = store?.client ?? defaultPrisma;
    const value = Reflect.get(client as object, prop, receiver);
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});

export function activeDbPath() {
  return prismaAls.getStore()?.dbPath ?? defaultDbPath();
}

export function runWithPrisma<T>(store: PrismaStore, fn: () => T): T {
  return prismaAls.run(store, fn);
}
