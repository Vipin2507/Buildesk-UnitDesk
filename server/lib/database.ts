import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "./prisma.ts";
import { HttpError } from "./http.ts";
import { audit } from "./audit.ts";
import { bootstrapEssentials } from "./bootstrap.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const MAX_BACKUPS = 30;

let busy: Promise<unknown> | null = null;

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  if (busy) throw new HttpError(409, "Another database operation is in progress");
  const run = fn().finally(() => {
    if (busy === run) busy = null;
  });
  busy = run;
  return run as Promise<T>;
}

/** Prisma resolves relative file: URLs against the schema directory (prisma/). */
export function resolveDbPath() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const file = url.replace(/^file:/, "").replace(/^\.\//, "");
  if (path.isAbsolute(file)) return file;
  return path.resolve(ROOT, "prisma", file);
}

export function backupsDir() {
  const dir = path.resolve(ROOT, "prisma", "backups");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeName(name: string) {
  const base = path.basename(name);
  if (!/^unitdesk-backup-[\w.-]+\.db$/.test(base)) {
    throw new HttpError(400, "Invalid backup name");
  }
  return base;
}

function backupPath(name: string) {
  const full = path.resolve(backupsDir(), safeName(name));
  if (!full.startsWith(backupsDir())) throw new HttpError(400, "Invalid backup path");
  return full;
}

function todayStamp(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function stampNow(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, "-");
}

export type BackupInfo = {
  id: string;
  name: string;
  sizeBytes: number;
  createdAt: string;
  kind: "daily" | "manual";
};

export function listBackups(): BackupInfo[] {
  const dir = backupsDir();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".db"));
  return files
    .map((name) => {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      const kind: "daily" | "manual" = /unitdesk-backup-\d{4}-\d{2}-\d{2}\.db$/.test(name)
        ? "daily"
        : "manual";
      return {
        id: name,
        name,
        sizeBytes: st.size,
        createdAt: st.mtime.toISOString(),
        kind,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function pruneOldBackups() {
  const all = listBackups();
  for (const extra of all.slice(MAX_BACKUPS)) {
    try {
      fs.unlinkSync(backupPath(extra.name));
    } catch {
      /* ignore */
    }
  }
}

async function vacuumInto(dest: string) {
  const escaped = dest.replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${escaped}'`);
}

export async function createBackup(opts?: { kind?: "daily" | "manual"; actorId?: string; actorName?: string }) {
  return withLock(async () => {
    const kind = opts?.kind ?? "manual";
    const name =
      kind === "daily"
        ? `unitdesk-backup-${todayStamp()}.db`
        : `unitdesk-backup-${stampNow()}.db`;
    const dest = path.join(backupsDir(), name);
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    await vacuumInto(dest);
    pruneOldBackups();
    const st = fs.statSync(dest);
    if (opts?.actorId) {
      await audit({
        actorId: opts.actorId,
        actorName: opts.actorName,
        action: "database.backup.create",
        entityType: "database",
        entityId: name,
        meta: { kind, sizeBytes: st.size },
      });
    }
    return {
      id: name,
      name,
      sizeBytes: st.size,
      createdAt: st.mtime.toISOString(),
      kind,
    } satisfies BackupInfo;
  });
}

/** Create today's daily backup if missing. */
export async function ensureDailyBackup() {
  const name = `unitdesk-backup-${todayStamp()}.db`;
  const dest = path.join(backupsDir(), name);
  if (fs.existsSync(dest)) {
    return { created: false, backup: listBackups().find((b) => b.name === name)! };
  }
  const backup = await createBackup({ kind: "daily" });
  return { created: true, backup };
}

export function getBackupFile(name: string) {
  const full = backupPath(name);
  if (!fs.existsSync(full)) throw new HttpError(404, "Backup not found");
  return full;
}

export async function deleteBackup(name: string, actor?: { id: string; name: string }) {
  const full = getBackupFile(name);
  fs.unlinkSync(full);
  if (actor) {
    await audit({
      actorId: actor.id,
      actorName: actor.name,
      action: "database.backup.delete",
      entityType: "database",
      entityId: name,
    });
  }
  return { ok: true };
}

export async function restoreBackup(name: string, actor: { id: string; name: string }) {
  return withLock(async () => {
    const source = getBackupFile(name);
    const dbPath = resolveDbPath();
    const dir = path.dirname(dbPath);
    const tmp = path.join(dir, `.restore-${Date.now()}.db`);

    fs.copyFileSync(source, tmp);
    await prisma.$disconnect();
    try {
      for (const suffix of ["", "-wal", "-shm", "-journal"]) {
        const p = `${dbPath}${suffix}`;
        if (suffix && fs.existsSync(p)) fs.unlinkSync(p);
      }
      fs.renameSync(tmp, dbPath);
    } catch (err) {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      await prisma.$connect();
      throw err;
    }
    await prisma.$connect();
    await audit({
      actorId: actor.id,
      actorName: actor.name,
      action: "database.backup.restore",
      entityType: "database",
      entityId: name,
    });
    return { ok: true, restored: name };
  });
}

/**
 * Wipe business data, keep Employee / Role / Permission (user credentials & roles).
 * Re-seeds default masters, integrations, and settings so the app stays usable.
 */
export async function clearBusinessData(actor: { id: string; name: string }) {
  return withLock(async () => {
    // Safety snapshot before wipe (already holding lock)
    await createBackupInner(`unitdesk-backup-pre-clear-${stampNow()}.db`);

    await prisma.$transaction(async (tx) => {
      await tx.messageLog.deleteMany();
      await tx.auditLog.deleteMany();
      await tx.notification.deleteMany();
      await tx.approval.deleteMany();
      await tx.invoice.deleteMany();
      await tx.reminder.deleteMany();
      await tx.paymentSchedule.deleteMany();
      await tx.payment.deleteMany();
      await tx.partnerEntitlement.deleteMany();
      await tx.document.deleteMany();
      await tx.customer.deleteMany();
      await tx.bookingFinancial.deleteMany();
      await tx.booking.deleteMany();
      await tx.commissionRule.deleteMany();
      await tx.brokerageMilestone.deleteMany();
      await tx.projectAccess.deleteMany();
      await tx.unit.deleteMany();
      await tx.floor.deleteMany();
      await tx.wing.deleteMany();
      await tx.lead.deleteMany();
      await tx.campaign.deleteMany();
      await tx.channelPartner.deleteMany();
      await tx.project.deleteMany();
      await tx.company.deleteMany();
      await tx.masterOption.deleteMany();
      await tx.integration.deleteMany();
      await tx.appSetting.deleteMany();
    });

    // Defaults so forms / settings still work after wipe
    await bootstrapEssentials();

    await audit({
      actorId: actor.id,
      actorName: actor.name,
      action: "database.clear",
      entityType: "database",
      entityId: "business",
      meta: { kept: ["Employee", "Role", "Permission"] },
    });

    const users = await prisma.employee.count();
    return { ok: true, usersKept: users };
  });
}

/** Internal backup without nested lock (caller already holds lock). */
async function createBackupInner(name: string) {
  const dest = path.join(backupsDir(), name);
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  await vacuumInto(dest);
  pruneOldBackups();
  return dest;
}

export async function databaseStatus() {
  const dbPath = resolveDbPath();
  let sizeBytes = 0;
  let exists = false;
  if (fs.existsSync(dbPath)) {
    exists = true;
    sizeBytes = fs.statSync(dbPath).size;
  }
  const backups = listBackups();
  const today = `unitdesk-backup-${todayStamp()}.db`;
  const todayBackup = backups.find((b) => b.name === today) ?? null;
  const [
    users,
    roles,
    companies,
    projects,
    units,
    bookings,
    partners,
    payments,
  ] = await Promise.all([
    prisma.employee.count(),
    prisma.role.count(),
    prisma.company.count(),
    prisma.project.count(),
    prisma.unit.count(),
    prisma.booking.count(),
    prisma.channelPartner.count(),
    prisma.payment.count(),
  ]);
  return {
    dbPath: path.basename(dbPath),
    exists,
    sizeBytes,
    todayBackup,
    lastBackup: backups[0] ?? null,
    backupCount: backups.length,
    maxBackups: MAX_BACKUPS,
    counts: { users, roles, companies, projects, units, bookings, partners, payments },
  };
}

let schedulerStarted = false;

export function startBackupScheduler(intervalMs = 60 * 60 * 1000) {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const tick = () => {
    ensureDailyBackup().catch((err) => console.error("daily backup", err));
  };
  // Run shortly after boot, then hourly
  setTimeout(tick, 15_000);
  setInterval(tick, intervalMs);
}
