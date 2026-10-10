import { platformPrisma } from "./platform-prisma.ts";
import { HttpError } from "./http.ts";

function norm(email: string) {
  return email.trim().toLowerCase();
}

export async function assertEmailAvailable(email: string, opts?: { allowSlug?: string }) {
  const e = norm(email);
  const row = await platformPrisma.workspaceEmail.findUnique({ where: { email: e } });
  if (row && row.slug !== opts?.allowSlug) {
    throw new HttpError(409, "This email is already used by another workspace");
  }
  const account = await platformPrisma.clientAccount.findUnique({ where: { adminEmail: e } });
  if (account && account.slug !== opts?.allowSlug) {
    throw new HttpError(409, "This email is already used by another workspace");
  }
}

export async function resolveSlugByEmail(email: string): Promise<string | null> {
  const row = await platformPrisma.workspaceEmail.findUnique({
    where: { email: norm(email) },
    include: { account: true },
  });
  if (!row) return null;
  if (row.account.status === "suspended" || row.account.status === "expired") {
    throw new HttpError(403, "This workspace is not active");
  }
  if (row.account.expiresAt && row.account.expiresAt.getTime() < Date.now()) {
    throw new HttpError(403, "This workspace has expired");
  }
  return row.slug;
}

export async function registerWorkspaceEmail(input: {
  email: string;
  slug: string;
  accountId: string;
}) {
  const email = norm(input.email);
  await assertEmailAvailable(email, { allowSlug: input.slug });
  await platformPrisma.workspaceEmail.upsert({
    where: { email },
    create: { email, slug: input.slug, accountId: input.accountId },
    update: { slug: input.slug, accountId: input.accountId },
  });
}

export async function moveWorkspaceEmail(input: {
  fromEmail: string;
  toEmail: string;
  slug: string;
  accountId: string;
}) {
  const from = norm(input.fromEmail);
  const to = norm(input.toEmail);
  if (from === to) return;
  await assertEmailAvailable(to, { allowSlug: input.slug });
  await platformPrisma.workspaceEmail.deleteMany({ where: { email: from, slug: input.slug } });
  await registerWorkspaceEmail({ email: to, slug: input.slug, accountId: input.accountId });
}

export async function unregisterWorkspaceEmail(email: string, slug?: string) {
  const e = norm(email);
  await platformPrisma.workspaceEmail.deleteMany({
    where: { email: e, ...(slug ? { slug } : {}) },
  });
}
