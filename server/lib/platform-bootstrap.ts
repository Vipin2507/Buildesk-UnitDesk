import bcrypt from "bcryptjs";
import { platformPrisma } from "./platform-prisma.ts";
import { getTenantPrisma } from "./tenant-prisma.ts";
import { registerWorkspaceEmail } from "./workspace-email.ts";

const DEFAULT_PLANS = [
  { code: "free", name: "Free", maxUsers: 3, maxProjects: 1, maxUnits: 100, sortOrder: 1 },
  { code: "basic", name: "Basic", maxUsers: 15, maxProjects: 5, maxUnits: 2000, sortOrder: 2 },
  { code: "pro", name: "Pro", maxUsers: 100, maxProjects: 50, maxUnits: 50000, sortOrder: 3 },
] as const;

/** Backfill login directory from client admin emails + tenant employee emails. */
async function syncWorkspaceEmailDirectory() {
  const accounts = await platformPrisma.clientAccount.findMany();
  for (const account of accounts) {
    try {
      await registerWorkspaceEmail({
        email: account.adminEmail,
        slug: account.slug,
        accountId: account.id,
      });
    } catch (err) {
      console.warn("workspace email sync admin", account.slug, err);
    }
    try {
      const client = getTenantPrisma(account.slug);
      const employees = await client.employee.findMany({ select: { email: true } });
      for (const emp of employees) {
        try {
          await registerWorkspaceEmail({
            email: emp.email,
            slug: account.slug,
            accountId: account.id,
          });
        } catch {
          /* skip clashes */
        }
      }
    } catch (err) {
      console.warn("workspace email sync tenants", account.slug, err);
    }
  }
}

export async function bootstrapPlatform() {
  for (const plan of DEFAULT_PLANS) {
    await platformPrisma.plan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        maxUsers: plan.maxUsers,
        maxProjects: plan.maxProjects,
        maxUnits: plan.maxUnits,
        sortOrder: plan.sortOrder,
      },
      create: { ...plan },
    });
  }

  const email = (process.env.PLATFORM_ADMIN_EMAIL ?? "platform@buildesk.com").toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD ?? "Platform@123";
  const name = process.env.PLATFORM_ADMIN_NAME ?? "Platform Admin";

  const existing = await platformPrisma.platformUser.findUnique({ where: { email } });
  if (!existing) {
    await platformPrisma.platformUser.create({
      data: {
        email,
        name,
        passwordHash: await bcrypt.hash(password, 10),
        status: "active",
      },
    });
    console.log(`Platform admin seeded: ${email}`);
  }

  await syncWorkspaceEmailDirectory();

  // Demo client with full seed data (companies, projects, bookings, …)
  try {
    const { ensureDemoWorkspace } = await import("./demo-workspace.ts");
    await ensureDemoWorkspace();
  } catch (err) {
    console.error("demo workspace bootstrap", err);
  }
}
