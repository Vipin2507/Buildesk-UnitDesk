import bcrypt from "bcryptjs";
import { prisma } from "./prisma.ts";
import { generateSchedules } from "./schedule.ts";
import { issueDocument } from "./invoice.ts";
import { audit } from "./audit.ts";

const INTEGRATIONS = [
  { provider: "whatsapp", name: "WhatsApp Business", enabled: false, config: JSON.stringify({ from: "", apiKey: "" }) },
  { provider: "sms", name: "SMS gateway", enabled: false, config: JSON.stringify({ from: "UNITDESK", apiKey: "" }) },
  { provider: "email", name: "Transactional email", enabled: false, config: JSON.stringify({ from: "hello@cravingcode.in", apiKey: "" }) },
  { provider: "webhook", name: "Outbound webhook", enabled: false, config: JSON.stringify({ url: "" }) },
];

const MASTERS: { group: string; label: string; value: string; sortOrder: number }[] = [
  ...["2BHK", "3BHK", "4BHK", "Shop", "Office"].map((v, i) => ({ group: "unitType", label: v, value: v, sortOrder: i })),
  ...["East", "West", "North", "South", "NE", "NW"].map((v, i) => ({ group: "facing", label: v, value: v, sortOrder: i })),
  ...["cash", "cheque", "neft", "rtgs", "upi"].map((v, i) => ({ group: "paymentMode", label: v.toUpperCase(), value: v, sortOrder: i })),
  ...["kyc", "agreement", "floor_plan", "receipt", "invoice", "other"].map((v, i) => ({
    group: "documentCategory",
    label: v.replace("_", " "),
    value: v,
    sortOrder: i,
  })),
];

export async function bootstrapPhase2() {
  if ((await prisma.integration.count()) === 0) {
    await prisma.integration.createMany({ data: INTEGRATIONS });
  }
  if ((await prisma.masterOption.count()) === 0) {
    await prisma.masterOption.createMany({ data: MASTERS });
  }
  const settings = [
    { key: "requireApprovalForCancel", value: "true" },
    { key: "requireApprovalForConfirm", value: "false" },
    { key: "orgName", value: "Craving Code" },
    { key: "orgEmail", value: "hello@cravingcode.in" },
  ];
  for (const s of settings) {
    await prisma.appSetting.upsert({
      where: { key: s.key },
      update: s.key === "orgEmail" || s.key === "orgName" ? { value: s.value } : {},
      create: s,
    });
  }

  const emailInt = await prisma.integration.findUnique({ where: { provider: "email" } });
  if (emailInt) {
    const cfg = JSON.parse(emailInt.config || "{}") as Record<string, string>;
    if (!cfg.from || cfg.from.includes("example.net") || cfg.from.includes("unitdesk")) {
      await prisma.integration.update({
        where: { id: emailInt.id },
        data: { config: JSON.stringify({ ...cfg, from: "hello@cravingcode.in" }) },
      });
    }
  }

  const hash = await bcrypt.hash("Partner@123", 10);
  await prisma.channelPartner.updateMany({
    where: { OR: [{ passwordHash: null }, { passwordHash: "" }] },
    data: { passwordHash: hash },
  });
  if (!(await prisma.employee.findUnique({ where: { email: "vipin@cravingcode.in" } }))) {
    await prisma.employee.updateMany({
      where: { email: { in: ["ivan.p@example.net", "admin@unitdesk.local"] } },
      data: { email: "vipin@cravingcode.in", name: "Vipin Sharma" },
    });
  }
  if (!(await prisma.channelPartner.findFirst({ where: { email: "sanjay@cravingcode.in" } }))) {
    await prisma.channelPartner.updateMany({
      where: { email: { in: ["alice.j@example.com", "partner@unitdesk.local"] } },
      data: { email: "sanjay@cravingcode.in" },
    });
  }

  const bookings = await prisma.booking.findMany({
    where: { status: { not: "cancelled" }, schedules: { none: {} } },
    include: { financials: true, customers: true },
  });
  for (const booking of bookings) {
    await generateSchedules(prisma, booking);
    const existingInv = await prisma.invoice.findFirst({
      where: { bookingId: booking.id, kind: "invoice" },
    });
    if (!existingInv && booking.financials) {
      await issueDocument(prisma, {
        bookingId: booking.id,
        kind: "invoice",
        amount: booking.financials.totalDealValue,
        tax: booking.financials.gst,
        notes: `Agreement invoice for ${booking.bookingNumber}`,
      });
    }
    const primary = booking.customers.find((c) => c.role === "primary");
    const existingRem = await prisma.reminder.findFirst({
      where: { bookingId: booking.id, type: "kyc_pending" },
    });
    if (!existingRem) {
      await prisma.reminder.create({
        data: {
          bookingId: booking.id,
          projectId: booking.projectId,
          type: "kyc_pending",
          channel: "email",
          title: `KYC pending — ${booking.bookingNumber}`,
          message: `Collect KYC documents from ${primary?.name ?? "customer"} for ${booking.bookingNumber}.`,
          dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          status: "scheduled",
        },
      });
    }
  }

  if ((await prisma.lead.count()) === 0) {
    const project = await prisma.project.findFirst({ orderBy: { createdAt: "asc" } });
    if (project) {
      await prisma.lead.createMany({
        data: [
          { projectId: project.id, name: "Ananya Shah", phone: "9811122233", email: "ananya.shah@cravingcode.in", source: "website", status: "new" },
          { projectId: project.id, name: "Vikram Rao", phone: "9811144455", source: "walkin", status: "site_visit" },
          { projectId: project.id, name: "Leela Menon", phone: "9811166677", email: "leela.menon@cravingcode.in", source: "partner", status: "contacted" },
        ],
      });
      await prisma.campaign.create({
        data: {
          projectId: project.id,
          name: "Baner launch follow-up",
          channel: "whatsapp",
          audience: "leads",
          message: "Visit The Grand Residences this weekend. Inventory still open in Wing A.",
          status: "draft",
        },
      });
    }
  }

  const overdue = await prisma.paymentSchedule.findMany({
    where: { outstanding: { gt: 0 }, dueDate: { lt: new Date() }, status: { not: "paid" } },
  });
  for (const row of overdue) {
    if (row.status !== "overdue") {
      await prisma.paymentSchedule.update({ where: { id: row.id }, data: { status: "overdue" } });
    }
    const exists = await prisma.reminder.findFirst({
      where: { bookingId: row.bookingId, type: "payment_due", title: { contains: row.name } },
    });
    if (!exists) {
      const booking = await prisma.booking.findUnique({ where: { id: row.bookingId } });
      await prisma.reminder.create({
        data: {
          bookingId: row.bookingId,
          projectId: booking?.projectId,
          type: "payment_due",
          channel: "sms",
          title: `Overdue — ${row.name}`,
          message: `${row.name} of ₹${row.outstanding.toLocaleString("en-IN")} is overdue.`,
          dueAt: row.dueDate,
          status: "scheduled",
        },
      });
    }
  }

  if ((await prisma.auditLog.count()) === 0) {
    await audit({
      actorName: "system",
      action: "bootstrap",
      entityType: "workspace",
      entityId: "unitdesk",
      meta: { phase: 2 },
    });
  }
}
