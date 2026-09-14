import { prisma } from "./prisma.ts";

export async function notify(input: {
  title: string;
  body: string;
  type: string;
  employeeId?: string | null;
  partnerId?: string | null;
  linkUrl?: string | null;
  channel?: "email" | "sms" | "whatsapp" | "in_app";
  to?: string | null;
}) {
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

export async function dispatchReminder(id: string) {
  const reminder = await prisma.reminder.findUnique({ where: { id } });
  if (!reminder || reminder.status === "sent") return reminder;
  let to: string | null = null;
  let partnerId: string | null = null;
  if (reminder.bookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: reminder.bookingId },
      include: { customers: true, channelPartner: true },
    });
    const primary = booking?.customers.find((c) => c.role === "primary");
    to = primary?.email || primary?.mobile || booking?.channelPartner?.email || null;
    partnerId = booking?.channelPartnerId ?? null;
  }
  await notify({
    title: reminder.title,
    body: reminder.message,
    type: reminder.type,
    partnerId,
    linkUrl: reminder.bookingId ? `/bookings/${reminder.bookingId}` : null,
    channel: reminder.channel as "email" | "sms" | "whatsapp" | "in_app",
    to,
  });
  return prisma.reminder.update({
    where: { id },
    data: { status: "sent", sentAt: new Date() },
  });
}
