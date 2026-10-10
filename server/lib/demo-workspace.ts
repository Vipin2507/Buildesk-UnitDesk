import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { platformPrisma } from "./platform-prisma.ts";
import {
  forgetTenantPrisma,
  getTenantPrisma,
  pushTenantSchema,
  tenantDbPath,
} from "./tenant-prisma.ts";
import { registerWorkspaceEmail } from "./workspace-email.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const DEMO_WORKSPACE = {
  slug: "demo",
  name: "Demo Workspace",
  adminName: "Vipin Sharma",
  adminEmail: "vipin@cravingcode.in",
  adminPassword: "Admin@123",
  /** Extra seed users (passwords from prisma/seed.ts) */
  salesEmail: "rahul@cravingcode.in",
  salesPassword: "Sales@123",
  partnerEmail: "sanjay@cravingcode.in",
  partnerPassword: "Partner@123",
} as const;

function runSeedInto(dbPath: string) {
  const result = spawnSync("npx", ["tsx", "prisma/seed.ts"], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: `file:${dbPath}`,
    },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error("Failed to seed demo workspace database");
  }
  if (result.stdout) console.log(result.stdout.trim());
}

async function indexDemoEmails(accountId: string, slug: string) {
  const client = getTenantPrisma(slug);
  const employees = await client.employee.findMany({ select: { email: true } });
  for (const emp of employees) {
    try {
      await registerWorkspaceEmail({
        email: emp.email,
        slug,
        accountId,
      });
    } catch (err) {
      console.warn("demo email index", emp.email, err);
    }
  }
}

/**
 * Ensures platform client `demo` exists with full UnitDesk seed data.
 * - Missing account → provision DB, seed, register account
 * - Existing account + empty/missing DB → re-push + seed
 * - FORCE_DEMO_SEED=true → wipe and reseed demo DB
 */
export async function ensureDemoWorkspace() {
  const force = ["1", "true", "yes"].includes(
    String(process.env.FORCE_DEMO_SEED ?? "").toLowerCase(),
  );
  const slug = DEMO_WORKSPACE.slug;
  const dbPath = tenantDbPath(slug);
  const plan =
    (await platformPrisma.plan.findUnique({ where: { code: "pro" } })) ??
    (await platformPrisma.plan.findFirst({ orderBy: { sortOrder: "desc" } }));
  if (!plan) throw new Error("No plan found — run platform bootstrap first");

  let account = await platformPrisma.clientAccount.findUnique({ where: { slug } });
  const dbExists = fs.existsSync(dbPath);
  let needsSeed = force || !dbExists;

  if (!needsSeed && dbExists) {
    try {
      const client = getTenantPrisma(slug);
      const companies = await client.company.count();
      needsSeed = companies === 0;
    } catch {
      needsSeed = true;
    }
  }

  if (needsSeed) {
    console.log(`Seeding demo workspace → ${dbPath}${force ? " (forced)" : ""}`);
    forgetTenantPrisma(slug);
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      for (const suffix of ["-wal", "-shm", "-journal"]) {
        const p = `${dbPath}${suffix}`;
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    }
    pushTenantSchema(slug);
    forgetTenantPrisma(slug);
    runSeedInto(dbPath);
    forgetTenantPrisma(slug);
  }

  const dbFile = path.relative(path.join(root, "prisma"), dbPath).replaceAll("\\", "/");

  // Free the demo admin email if another client account still holds it
  await platformPrisma.workspaceEmail.deleteMany({
    where: { email: DEMO_WORKSPACE.adminEmail },
  });
  const emailClash = await platformPrisma.clientAccount.findFirst({
    where: { adminEmail: DEMO_WORKSPACE.adminEmail, NOT: { slug } },
  });
  if (emailClash) {
    await platformPrisma.clientAccount.update({
      where: { id: emailClash.id },
      data: { adminEmail: `relocated-${emailClash.slug}@example.invalid` },
    });
  }

  if (!account) {
    account = await platformPrisma.clientAccount.create({
      data: {
        name: DEMO_WORKSPACE.name,
        slug,
        planId: plan.id,
        status: "active",
        dbFile,
        adminEmail: DEMO_WORKSPACE.adminEmail,
        adminName: DEMO_WORKSPACE.adminName,
        notes: "Full seed dataset for demos and sales walkthroughs",
        maxUsers: 100,
        maxProjects: 50,
        maxUnits: 50000,
      },
    });
    console.log(`Demo client account created (${slug})`);
  } else {
    account = await platformPrisma.clientAccount.update({
      where: { id: account.id },
      data: {
        name: DEMO_WORKSPACE.name,
        status: "active",
        dbFile,
        adminEmail: DEMO_WORKSPACE.adminEmail,
        adminName: DEMO_WORKSPACE.adminName,
        planId: plan.id,
        notes: "Full seed dataset for demos and sales walkthroughs",
      },
    });
  }

  await indexDemoEmails(account.id, slug);
  console.log(
    `Demo login: ${DEMO_WORKSPACE.adminEmail} / ${DEMO_WORKSPACE.adminPassword} (workspace: ${slug})`,
  );
  return account;
}
