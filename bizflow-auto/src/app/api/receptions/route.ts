import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { deletePrivateImages, type PrivateImageUpload, uploadPrivateImage } from "@/lib/private-image-storage";
import { preparePrivateImages, PrivateImageValidationError } from "@/lib/private-image-upload";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const optionalId = z.preprocess(
  (value) => value === "" || value === null || value === undefined ? null : Number(value),
  z.number().int().positive().nullable(),
);

const receptionSchema = z.object({
  appointmentId: optionalId,
  customerId: z.coerce.number().int().positive(),
  vehicleId: z.coerce.number().int().positive(),
  serviceId: optionalId,
  mileage: z.coerce.number().int().min(0).max(2_000_000),
  fuelLevelPercent: z.coerce.number().int().min(0).max(100),
  exteriorCondition: z.string().trim().max(2000).optional(),
  interiorCondition: z.string().trim().max(2000).optional(),
  tyres: z.string().trim().max(2000).optional(),
  lights: z.string().trim().max(2000).optional(),
  windows: z.string().trim().max(2000).optional(),
  mirrors: z.string().trim().max(2000).optional(),
  bodyDamage: z.string().trim().max(2000).optional(),
  existingScratches: z.string().trim().max(2000).optional(),
  accessories: z.string().trim().max(2000).optional(),
  complaint: z.string().trim().min(1).max(5000),
});

export async function GET() {
  const user = await requirePermission("receptions:read");
  if (user instanceof Response) return user;

  try {
    const receptions = await prisma.reception.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
        appointment: { select: { id: true, service: { select: { name: true } } } },
        receivedBy: { select: { name: true } },
        images: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
      },
    });
    return Response.json({
      receptions: receptions.map((reception) => ({
        ...reception,
        receptionNumber: `REC-${String(reception.id).padStart(6, "0")}`,
      })),
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Vehicle reception list query failed.", error);
    return Response.json({ error: "Reception records could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requirePermission("receptions:write");
  if (user instanceof Response) return user;

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number.isFinite(Number(contentLength)) && Number(contentLength) > 16 * 1024 * 1024) {
    return Response.json({ error: "Reception submissions cannot exceed 16 MB." }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Reception details must be submitted as multipart form data." }, { status: 400 });
  }

  const fields = Object.fromEntries(
    ["appointmentId", "customerId", "vehicleId", "serviceId", "mileage", "fuelLevelPercent", "exteriorCondition", "interiorCondition", "tyres", "lights", "windows", "mirrors", "bodyDamage", "existingScratches", "accessories", "complaint"]
      .map((key) => [key, formData.get(key)]),
  );
  const parsed = receptionSchema.safeParse(fields);
  if (!parsed.success) {
    return Response.json({ error: "Invalid vehicle reception details.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  let uploads: PrivateImageUpload[];
  try {
    uploads = await preparePrivateImages(formData.getAll("photos"), `receptions/${parsed.data.vehicleId}`);
  } catch (error) {
    if (error instanceof PrivateImageValidationError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Reception photo validation failed.", error);
    return Response.json({ error: "Reception photos could not be processed." }, { status: 500 });
  }

  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: parsed.data.vehicleId },
      select: { id: true, customerId: true, mileage: true },
    });
    if (!vehicle || vehicle.customerId !== parsed.data.customerId) {
      return Response.json({ error: "Selected vehicle does not belong to that customer." }, { status: 400 });
    }
    if (parsed.data.mileage < vehicle.mileage) {
      return Response.json({ error: "Reception mileage cannot be less than the vehicle's recorded mileage." }, { status: 400 });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: parsed.data.customerId },
      select: { id: true },
    });
    if (!customer) return Response.json({ error: "Customer was not found." }, { status: 404 });

    if (parsed.data.appointmentId === null) {
      if (parsed.data.serviceId === null) return Response.json({ error: "Select a service for a walk-in reception." }, { status: 400 });
      const service = await prisma.service.findUnique({ where: { id: parsed.data.serviceId }, select: { id: true } });
      if (!service) return Response.json({ error: "Selected service was not found." }, { status: 404 });
    } else {
      const appointment = await prisma.appointment.findUnique({
        where: { id: parsed.data.appointmentId },
        select: { customerId: true, vehicleId: true, status: true, reception: { select: { id: true } } },
      });
      if (!appointment) return Response.json({ error: "Appointment was not found." }, { status: 404 });
      if (appointment.customerId !== parsed.data.customerId || appointment.vehicleId !== parsed.data.vehicleId) {
        return Response.json({ error: "Appointment does not match the selected customer and vehicle." }, { status: 400 });
      }
      if (appointment.status !== "REQUESTED" && appointment.status !== "CONFIRMED") {
        return Response.json({ error: "Only requested or confirmed appointments can be received." }, { status: 409 });
      }
      if (appointment.reception) return Response.json({ error: "A reception record already exists for this appointment." }, { status: 409 });
    }

    for (const upload of uploads) await uploadPrivateImage(upload);

    const reception = await prisma.$transaction(async (transaction) => {
      let appointmentId = parsed.data.appointmentId;
      if (appointmentId !== null) {
        const appointment = await transaction.appointment.findUnique({
          where: { id: appointmentId },
          select: { customerId: true, vehicleId: true, status: true, reception: { select: { id: true } } },
        });
        if (!appointment) throw new Error("APPOINTMENT_NOT_FOUND");
        if (appointment.customerId !== parsed.data.customerId || appointment.vehicleId !== parsed.data.vehicleId) {
          throw new Error("APPOINTMENT_VEHICLE_MISMATCH");
        }
        if ((appointment.status !== "REQUESTED" && appointment.status !== "CONFIRMED") || appointment.reception) {
          throw new Error("APPOINTMENT_NOT_RECEIVABLE");
        }
        await transaction.appointment.update({ where: { id: appointmentId }, data: { status: "CHECKED_IN" } });
      } else {
        const serviceId = parsed.data.serviceId;
        if (serviceId === null) throw new Error("WALK_IN_SERVICE_REQUIRED");
        const now = new Date();
        const appointment = await transaction.appointment.create({
          data: {
            customerId: parsed.data.customerId,
            vehicleId: parsed.data.vehicleId,
            serviceId,
            advisorUserId: user.id,
            appointmentDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
            appointmentTime: new Date(Date.UTC(1970, 0, 1, now.getUTCHours(), now.getUTCMinutes())),
            description: parsed.data.complaint,
            status: "CHECKED_IN",
          },
        });
        appointmentId = appointment.id;
      }

      const created = await transaction.reception.create({
        data: {
          appointmentId,
          customerId: parsed.data.customerId,
          vehicleId: parsed.data.vehicleId,
          receivedByUserId: user.id,
          mileage: parsed.data.mileage,
          fuelLevelPercent: parsed.data.fuelLevelPercent,
          exteriorCondition: parsed.data.exteriorCondition || null,
          interiorCondition: parsed.data.interiorCondition || null,
          tyres: parsed.data.tyres || null,
          lights: parsed.data.lights || null,
          windows: parsed.data.windows || null,
          mirrors: parsed.data.mirrors || null,
          bodyDamage: parsed.data.bodyDamage || null,
          existingScratches: parsed.data.existingScratches || null,
          accessories: parsed.data.accessories || null,
          complaint: parsed.data.complaint,
          images: {
            create: uploads.map(({ objectKey, fileName, mimeType, sizeBytes }) => ({
              objectKey,
              fileName,
              mimeType,
              sizeBytes,
            })),
          },
        },
        include: {
          customer: { select: { id: true, name: true } },
          vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
          images: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
        },
      });
      const mileageUpdate = await transaction.vehicle.updateMany({
        where: { id: vehicle.id, mileage: { lte: parsed.data.mileage } },
        data: { mileage: parsed.data.mileage },
      });
      if (!mileageUpdate.count) throw new Error("VEHICLE_MILEAGE_CHANGED");
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "VEHICLE_RECEIVED",
          entityType: "Reception",
          entityId: created.id,
          request,
          details: {
            appointmentId,
            vehicleId: created.vehicle.id,
            mileage: created.mileage,
            photoCount: uploads.length,
          },
        }),
      });
      return created;
    });

    return Response.json({
      reception: { ...reception, receptionNumber: `REC-${String(reception.id).padStart(6, "0")}` },
    }, { status: 201 });
  } catch (error) {
    if (uploads.length) {
      try {
        await deletePrivateImages(uploads.map((upload) => upload.objectKey));
      } catch (cleanupError) {
        console.error("Reception photo cleanup failed after an unsuccessful reception.", cleanupError);
      }
    }
    if (error instanceof Error) {
      if (error.message === "RECEPTION_STORAGE_NOT_CONFIGURED") {
        return Response.json({ error: "Private reception image storage is not configured." }, { status: 503 });
      }
      if (error.message === "RECEPTION_STORAGE_CREDENTIALS_INCOMPLETE") {
        return Response.json({ error: "Private reception image storage credentials are incomplete." }, { status: 503 });
      }
      if (error.message === "APPOINTMENT_NOT_FOUND") return Response.json({ error: "Appointment was not found." }, { status: 404 });
      if (error.message === "APPOINTMENT_VEHICLE_MISMATCH") return Response.json({ error: "Appointment does not match the selected customer and vehicle." }, { status: 400 });
      if (error.message === "APPOINTMENT_NOT_RECEIVABLE") return Response.json({ error: "This appointment has already been received or cannot be checked in." }, { status: 409 });
      if (error.message === "WALK_IN_SERVICE_REQUIRED") return Response.json({ error: "Select a service for a walk-in reception." }, { status: 400 });
      if (error.message === "VEHICLE_MILEAGE_CHANGED") return Response.json({ error: "The vehicle mileage changed while this reception was being recorded. Reload and try again." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "A reception record already exists for this appointment." }, { status: 409 });
    }
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Vehicle reception creation failed.", error);
    return Response.json({ error: "Vehicle reception could not be completed." }, { status: 500 });
  }
}
