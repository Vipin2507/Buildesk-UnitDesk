import { prisma } from "./prisma.ts";

type NotifyInput = {
  title: string;
  body: string;
  type: string;
  employeeId?: string | null;
  partnerId?: string | null;
  linkUrl?: string | null;
  channel?: "email" | "sms" | "whatsapp" | "in_app";
  to?: string | null;
};

export async function notify(input: NotifyInput) {
  await prisma.notification.create({
    data: {
      title: input.title,
      body: input.body,
      type: input.type,
      employeeId: input.employeeId ?? null,
      partnerId: input.partnerId ?? null,
      linkUrl: input.linkUrl ?? null,
    },
  });

  const channel = input.channel ?? "in_app";
  if (channel === "in_app" || !input.to) return { delivered: true, provider: "in_app" };

  const integration = await prisma.integration.findUnique({ where: { provider: channel } });
  if (!integration?.enabled) {
    await prisma.messageLog.create({
      data: {
        provider: channel,
        toAddress: input.to,
        subject: input.title,
        body: input.body,
        status: "skipped",
        error: "Integration disabled",
      },
    });
    return { delivered: false, provider: channel, reason: "disabled" };
  }

  await prisma.messageLog.create({
    data: {
      provider: channel,
      toAddress: input.to,
      subject: input.title,
      body: input.body,
      status: "sent",
    },
  });
  return { delivered: true, provider: channel };
}

/** Resolve staff who should see project/booking alerts in the bell. */
export async function projectStaffIds(
  projectId: string,
  extras: Array<string | null | undefined> = [],
) {
  const access = await prisma.projectAccess.findMany({
    where: { projectId },
    select: { employeeId: true },
  });
  const ids = new Set<string>(access.map((a) => a.employeeId));
  for (const id of extras) {
    if (id) ids.add(id);
  }
  const admins = await prisma.employee.findMany({
    where: { status: "active", role: { name: { in: ["Super Admin", "Admin"] } } },
    select: { id: true },
  });
  for (const a of admins) ids.add(a.id);
  return [...ids];
}

export async function notifyEmployees(
  employeeIds: string[],
  input: Omit<NotifyInput, "employeeId">,
) {
  const unique = [...new Set(employeeIds.filter(Boolean))];
  await Promise.all(unique.map((employeeId) => notify({ ...input, employeeId })));
  return unique.length;
}

export async function notifyProjectStaff(
  projectId: string,
  input: Omit<NotifyInput, "employeeId">,
  extras: Array<string | null | undefined> = [],
) {
  const ids = await projectStaffIds(projectId, extras);
  return notifyEmployees(ids, input);
}

export async function dispatchReminder(id: string) {
  const reminder = await prisma.reminder.findUnique({ where: { id } });
  if (!reminder || reminder.status === "sent" || reminder.status === "cancelled") {
    return reminder;
  }

  let to: string | null = null;
  let partnerId: string | null = null;
  let salesEmployeeId: string | null = null;
  let projectId = reminder.projectId;

  if (reminder.bookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: reminder.bookingId },
      include: { customers: true, channelPartner: true },
    });
    const primary = booking?.customers.find((c) => c.role === "primary");
    to = primary?.email || primary?.mobile || booking?.channelPartner?.email || null;
    partnerId = booking?.channelPartnerId ?? null;
    salesEmployeeId = booking?.salesEmployeeId ?? null;
    projectId = booking?.projectId ?? projectId;
  }

  const staffIds = projectId
    ? await projectStaffIds(projectId, [salesEmployeeId])
    : salesEmployeeId
      ? [salesEmployeeId]
      : [];

  if (staffIds.length) {
    await notifyEmployees(staffIds, {
      title: reminder.title,
      body: reminder.message,
      type: reminder.type,
      partnerId,
      linkUrl: reminder.bookingId ? `/bookings/${reminder.bookingId}` : null,
      channel: "in_app",
    });
  } else {
    // Fallback so something is recorded even without staff mapping
    await notify({
      title: reminder.title,
      body: reminder.message,
      type: reminder.type,
      partnerId,
      linkUrl: reminder.bookingId ? `/bookings/${reminder.bookingId}` : null,
      channel: "in_app",
    });
  }

  // External channel (email/sms/whatsapp) to customer when configured
  if (reminder.channel !== "in_app") {
    await notify({
      title: reminder.title,
      body: reminder.message,
      type: reminder.type,
      partnerId,
      linkUrl: reminder.bookingId ? `/bookings/${reminder.bookingId}` : null,
      channel: reminder.channel as "email" | "sms" | "whatsapp" | "in_app",
      to,
    });
  }

  return prisma.reminder.update({
    where: { id },
    data: { status: "sent", sentAt: new Date() },
  });
}

/** Fire all scheduled reminders whose due date has arrived. */
export async function processDueReminders() {
  const now = new Date();
  const due = await prisma.reminder.findMany({
    where: { status: "scheduled", dueAt: { lte: now } },
    take: 100,
    orderBy: { dueAt: "asc" },
  });

  let sent = 0;
  for (const row of due) {
    try {
      await dispatchReminder(row.id);
      sent += 1;
    } catch (err) {
      console.error("processDueReminders", row.id, err);
    }
  }

  // Keep overdue schedule rows marked + ensure a reminder exists
  const overdueSchedules = await prisma.paymentSchedule.findMany({
    where: {
      outstanding: { gt: 0 },
      dueDate: { lte: now },
      status: { notIn: ["paid"] },
    },
    take: 100,
  });
  for (const row of overdueSchedules) {
    if (row.status !== "overdue") {
      await prisma.paymentSchedule.update({
        where: { id: row.id },
        data: { status: "overdue" },
      });
    }
    const exists = await prisma.reminder.findFirst({
      where: {
        bookingId: row.bookingId,
        type: "payment_due",
        title: { contains: row.name },
        status: { in: ["scheduled", "sent"] },
      },
    });
    if (!exists) {
      const booking = await prisma.booking.findUnique({ where: { id: row.bookingId } });
      if (!booking) continue;
      const created = await prisma.reminder.create({
        data: {
          bookingId: row.bookingId,
          projectId: booking.projectId,
          type: "payment_due",
          channel: "in_app",
          title: `Overdue — ${row.name}`,
          message: `${row.name} of ₹${row.outstanding.toLocaleString("en-IN")} is overdue for ${booking.bookingNumber}.`,
          dueAt: row.dueDate,
          status: "scheduled",
        },
      });
      try {
        await dispatchReminder(created.id);
        sent += 1;
      } catch (err) {
        console.error("processDueReminders overdue", created.id, err);
      }
    }
  }

  return { processed: due.length, sent };
}

/** Cancel payment_due reminders for installments that are fully paid. */
export async function syncPaymentDueReminderStatuses(bookingId: string) {
  const [schedules, reminders] = await Promise.all([
    prisma.paymentSchedule.findMany({ where: { bookingId } }),
    prisma.reminder.findMany({
      where: {
        bookingId,
        type: "payment_due",
        status: { in: ["scheduled", "sent"] },
      },
    }),
  ]);

  for (const rem of reminders) {
    const match = schedules.find(
      (s) => rem.title.includes(s.name) || rem.message.includes(s.name),
    );
    if (!match) continue;
    if (match.status === "paid" || match.outstanding <= 0.01) {
      await prisma.reminder.update({
        where: { id: rem.id },
        data: { status: "cancelled" },
      });
    }
  }
}

let reminderTimer: ReturnType<typeof setInterval> | null = null;

export function startReminderScheduler(intervalMs = 60_000) {
  if (reminderTimer) return;
  const tick = () => {
    processDueReminders().catch((err) => console.error("reminder scheduler", err));
  };
  // Run shortly after boot, then on interval
  setTimeout(tick, 5_000);
  reminderTimer = setInterval(tick, intervalMs);
  if (typeof reminderTimer.unref === "function") reminderTimer.unref();
}
