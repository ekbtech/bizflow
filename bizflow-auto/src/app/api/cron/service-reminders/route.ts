import { timingSafeEqual } from "node:crypto";
import { Prisma, ServiceReminderChannel } from "@prisma/client";
import { isDatabaseUnavailable } from "@/lib/auth";
import { sendAfricaTalkingServiceReminder, validateAfricaTalkingConfiguration } from "@/lib/africas-talking";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppServiceReminder, validateWhatsAppConfiguration, verifyWhatsAppSender } from "@/lib/whatsapp";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!secret || secret.length < 32) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(provided);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

async function claimReminder(
  vehicleId: number,
  serviceCompletedAt: Date,
  dueAt: Date,
  channel: ServiceReminderChannel,
) {
  const unique = { vehicleId_serviceCompletedAt_channel: { vehicleId, serviceCompletedAt, channel } };
  let reminder = await prisma.serviceReminderNotification.findUnique({ where: unique });
  if (!reminder) {
    try {
      reminder = await prisma.serviceReminderNotification.create({
        data: { vehicleId, serviceCompletedAt, dueAt, channel, status: "PROCESSING" },
      });
      return reminder.id;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      reminder = await prisma.serviceReminderNotification.findUnique({ where: unique });
      if (!reminder) throw error;
    }
  }

  if (reminder.status === "SENT") return null;
  const update = await prisma.serviceReminderNotification.updateMany({
    where: {
      id: reminder.id,
      OR: [
        { status: "FAILED" },
        { status: "PROCESSING", updatedAt: { lt: new Date(Date.now() - 15 * 60 * 1000) } },
      ],
    },
    data: { status: "PROCESSING", attempts: { increment: 1 }, lastError: null },
  });
  return update.count === 1 ? reminder.id : null;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 32) {
    return Response.json({ error: "Scheduled reminder authorization is not configured." }, { status: 503 });
  }
  if (!isAuthorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const jobs = await prisma.jobCard.findMany({
      where: {
        status: "DELIVERED",
        deliveredAt: { not: null },
        appointment: { customer: { whatsappOptIn: true } },
      },
      orderBy: { deliveredAt: "desc" },
      include: {
        appointment: {
          include: {
            customer: { select: { name: true, phone: true, whatsappOptIn: true } },
            vehicle: { select: { id: true, registrationNumber: true } },
          },
        },
      },
    });

    const newestServiceByVehicle = new Map<number, (typeof jobs)[number]>();
    for (const job of jobs) {
      const vehicleId = job.appointment.vehicle.id;
      if (!newestServiceByVehicle.has(vehicleId)) newestServiceByVehicle.set(vehicleId, job);
    }

    const now = new Date();
    const latestDueDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const targets = [...newestServiceByVehicle.entries()]
      .map(([vehicleId, job]) => {
        const deliveredAt = job.deliveredAt;
        if (!deliveredAt) return null;
        const dueAt = new Date(deliveredAt.getTime() + 90 * 24 * 60 * 60 * 1000);
        return dueAt <= latestDueDate ? { vehicleId, job, deliveredAt, dueAt } : null;
      })
      .filter((target): target is NonNullable<typeof target> => target !== null);

    const hasTargets = targets.length > 0;
    let whatsappReady = false;
    let smsReady = false;
    let configurationFailures = 0;
    if (hasTargets) {
      try {
        validateWhatsAppConfiguration();
        await verifyWhatsAppSender();
        whatsappReady = true;
      } catch (error) {
        const reason = error instanceof Error ? error.message : "WHATSAPP_CONFIGURATION_INVALID";
        console.error("Scheduled WhatsApp reminders are not configured.", { reason });
        configurationFailures += 1;
      }
      try {
        validateAfricaTalkingConfiguration();
        smsReady = true;
      } catch (error) {
        const reason = error instanceof Error ? error.message : "AFRICASTALKING_CONFIGURATION_INVALID";
        console.error("Scheduled SMS reminders are not configured.", { reason });
        configurationFailures += 1;
      }
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (const { vehicleId, job, deliveredAt, dueAt } of targets) {
      const message = {
        customerName: job.appointment.customer.name,
        phone: job.appointment.customer.phone,
        registrationNumber: job.appointment.vehicle.registrationNumber,
        dueDate: dueAt,
      };
      for (const channel of [ServiceReminderChannel.WHATSAPP, ServiceReminderChannel.SMS]) {
        const ready = channel === ServiceReminderChannel.WHATSAPP ? whatsappReady : smsReady;
        if (!ready) continue;

        const reminderId = await claimReminder(vehicleId, deliveredAt, dueAt, channel);
        if (reminderId === null) {
          skipped += 1;
          continue;
        }

        try {
          const result = channel === ServiceReminderChannel.WHATSAPP
            ? await sendWhatsAppServiceReminder(message)
            : await sendAfricaTalkingServiceReminder(message);
          await prisma.serviceReminderNotification.update({
            where: { id: reminderId },
            data: { status: "SENT", sentAt: new Date(), lastError: null },
          });
          sent += 1;
          console.info(`${channel} service reminder sent.`, { reminderId, providerMessageId: result.messageId });
        } catch (error) {
          const reason = error instanceof Error ? error.message : `${channel}_SEND_FAILED`;
          await prisma.serviceReminderNotification.update({
            where: { id: reminderId },
            data: { status: "FAILED", lastError: reason.slice(0, 500) },
          });
          console.error(`${channel} service reminder failed.`, { reminderId, reason });
          failed += 1;
        }
      }
    }
    const status = configurationFailures > 0 ? 503 : 200;
    return Response.json({ sent, failed, skipped, configurationFailures }, { status });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Scheduled WhatsApp reminder run failed.", error);
    return Response.json({ error: "Service reminders could not be processed." }, { status: 500 });
  }
}
