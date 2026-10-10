import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ALL_ACTIONS } from "./permissions.ts";
import { HttpError } from "./http.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tenantsDir = path.resolve(root, "prisma", "tenants");

const clients = new Map<string, PrismaClient>();

export function tenantsDirectory() {
  fs.mkdirSync(tenantsDir, { recursive: true });
  return tenantsDir;
}

export function tenantDbPath(slug: string) {
  const safe = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!safe || safe !== slug.toLowerCase()) {
    throw new HttpError(400, "Invalid tenant slug");
  }
  return path.join(tenantsDirectory(), `${safe}.db`);
}

export function tenantDbUrl(slug: string) {
  return `file:${tenantDbPath(slug)}`;
}

export function getTenantPrisma(slug: string): PrismaClient {
  const key = slug.toLowerCase();
  let client = clients.get(key);
  if (!client) {
    const dbPath = tenantDbPath(key);
    if (!fs.existsSync(dbPath)) {
      throw new HttpError(404, `Tenant database not found for "${key}"`);
    }
    client = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}` } },
    });
    clients.set(key, client);
  }
  return client;
}

export function forgetTenantPrisma(slug: string) {
  const key = slug.toLowerCase();
  const client = clients.get(key);
  if (client) {
    void client.$disconnect();
    clients.delete(key);
  }
}

/** Push main schema onto a new tenant SQLite file. */
export function pushTenantSchema(slug: string) {
  const dbPath = tenantDbPath(slug);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const schemaPath = path.join(root, "prisma", "schema.prisma");
  const result = spawnSync(
    "npx",
    ["prisma", "db", "push", "--schema", schemaPath, "--skip-generate", "--accept-data-loss"],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    console.error(result.stdout, result.stderr);
    throw new HttpError(500, `Failed to provision database for ${slug}`);
  }
}

export async function seedTenantWorkspace(
  slug: string,
  admin: { name: string; email: string; password: string },
) {
  const client = getTenantPrisma(slug);

  let superRole = await client.role.findFirst({ where: { name: "Super Admin" } });
  if (!superRole) {
    superRole = await client.role.create({
      data: {
        name: "Super Admin",
        isSystem: true,
        permissions: { create: ALL_ACTIONS.map((action) => ({ action })) },
      },
    });
  }

  let salesRole = await client.role.findFirst({ where: { name: "Sales Manager" } });
  if (!salesRole) {
    salesRole = await client.role.create({
      data: {
        name: "Sales Manager",
        permissions: {
          create: [
            "view",
            "add",
            "edit",
            "book",
            "hold",
            "payment_view",
            "payment_entry",
            "reports",
          ].map((action) => ({ action })),
        },
      },
    });
  }

  const email = admin.email.toLowerCase();
  const existing = await client.employee.findUnique({ where: { email } });
  const passwordHash = await bcrypt.hash(admin.password, 10);
  if (existing) {
    await client.employee.update({
      where: { id: existing.id },
      data: {
        name: admin.name,
        passwordHash,
        roleId: superRole.id,
        status: "active",
      },
    });
  } else {
    await client.employee.create({
      data: {
        name: admin.name,
        email,
        passwordHash,
        roleId: superRole.id,
        status: "active",
      },
    });
  }

  // Essentials (masters / settings / integrations) — inline to avoid coupling bootstrap demo data
  const masters = [
    ...["1BHK", "2BHK", "3BHK", "4BHK", "Shop", "Office"].map((v, i) => ({
      group: "unitType",
      label: v,
      value: v,
      sortOrder: i,
    })),
    ...["East", "West", "North", "South"].map((v, i) => ({
      group: "facing",
      label: v,
      value: v,
      sortOrder: i,
    })),
    ...["cash", "cheque", "neft", "rtgs", "upi"].map((v, i) => ({
      group: "paymentMode",
      label: v.toUpperCase(),
      value: v,
      sortOrder: i,
    })),
    ...["kyc", "agreement", "floor_plan", "receipt", "invoice", "other"].map((v, i) => ({
      group: "documentCategory",
      label: v.replace("_", " "),
      value: v,
      sortOrder: i,
    })),
  ];
  for (const m of masters) {
    await client.masterOption.upsert({
      where: { group_value: { group: m.group, value: m.value } },
      update: {},
      create: m,
    });
  }

  if ((await client.integration.count()) === 0) {
    await client.integration.createMany({
      data: [
        { provider: "whatsapp", name: "WhatsApp Business", enabled: false, config: "{}" },
        { provider: "sms", name: "SMS gateway", enabled: false, config: "{}" },
        { provider: "email", name: "Transactional email", enabled: false, config: "{}" },
        { provider: "webhook", name: "Outbound webhook", enabled: false, config: "{}" },
      ],
    });
  }

  for (const s of [
    { key: "requireApprovalForCancel", value: "true" },
    { key: "requireApprovalForConfirm", value: "false" },
    { key: "orgName", value: admin.name.split(" ")[0] ? "UnitDesk" : "UnitDesk" },
    { key: "orgEmail", value: email },
  ]) {
    await client.appSetting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }

  return client;
}

export async function provisionTenant(input: {
  slug: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}) {
  const slug = input.slug.toLowerCase();
  const dbPath = tenantDbPath(slug);
  if (fs.existsSync(dbPath)) {
    forgetTenantPrisma(slug);
    fs.unlinkSync(dbPath);
    for (const suffix of ["-wal", "-shm", "-journal"]) {
      const p = `${dbPath}${suffix}`;
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  }
  pushTenantSchema(slug);
  forgetTenantPrisma(slug);
  await seedTenantWorkspace(slug, {
    name: input.adminName,
    email: input.adminEmail,
    password: input.adminPassword,
  });
  return {
    dbFile: path.relative(path.join(root, "prisma"), dbPath).replaceAll("\\", "/"),
    dbPath,
  };
}

export async function resetTenantAdminPassword(
  slug: string,
  email: string,
  password: string,
) {
  const client = getTenantPrisma(slug);
  const employee = await client.employee.findUnique({ where: { email: email.toLowerCase() } });
  if (!employee) throw new HttpError(404, "Admin user not found in tenant database");
  await client.employee.update({
    where: { id: employee.id },
    data: { passwordHash: await bcrypt.hash(password, 10), status: "active" },
  });
}

export async function tenantUsage(slug: string) {
  try {
    const client = getTenantPrisma(slug);
    const [users, projects, units] = await Promise.all([
      client.employee.count(),
      client.project.count(),
      client.unit.count(),
    ]);
    return { users, projects, units };
  } catch {
    return { users: 0, projects: 0, units: 0, unavailable: true as const };
  }
}
