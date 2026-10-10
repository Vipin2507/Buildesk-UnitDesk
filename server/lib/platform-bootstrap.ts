import bcrypt from "bcryptjs";
import { platformPrisma } from "./platform-prisma.ts";

const DEFAULT_PLANS = [
  { code: "free", name: "Free", maxUsers: 3, maxProjects: 1, maxUnits: 100, sortOrder: 1 },
  { code: "basic", name: "Basic", maxUsers: 15, maxProjects: 5, maxUnits: 2000, sortOrder: 2 },
  { code: "pro", name: "Pro", maxUsers: 100, maxProjects: 50, maxUnits: 50000, sortOrder: 3 },
] as const;

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
}
