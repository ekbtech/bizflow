import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { inspectionChecklist, inspectionStatuses } from "@/lib/inspection-checklist";
import { deletePrivateImages, type PrivateImageUpload, uploadPrivateImage } from "@/lib/private-image-storage";
import { preparePrivateImages, PrivateImageValidationError } from "@/lib/private-image-upload";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const checklistItems = new Set(inspectionChecklist.flatMap(({ category, items }) => items.map((name) => `${category}\u0000${name}`)));

const inspectionSchema = z.object({
  receptionId: z.number().int().positive(),
  mileage: z.number().int().min(0).max(2_000_000),
  notes: z.string().trim().max(5000).optional(),
  items: z.array(z.object({
    category: z.string().max(80),
    name: z.string().max(120),
    status: z.enum(inspectionStatuses),
    notes: z.string().trim().max(2000).optional(),
  })).length(checklistItems.size),
});

function canInspectReception(
  role: string,
  userId: number,
  reception: { appointment: { status: string; jobCard: { mechanic: { userId: number | null } } | null } | null },
) {
  if (!reception.appointment) return role !== "MECHANIC";
  if (!["CHECKED_IN", "IN_SERVICE"].includes(reception.appointment.status)) return false;
  if (role !== "MECHANIC") return true;
  return reception.appointment.jobCard?.mechanic.userId === userId;
}

export async function GET() {
  const user = await requirePermission("inspections:read");
  if (user instanceof Response) return user;

  const receptionFilter: Prisma.ReceptionWhereInput = user.role === "MECHANIC"
    ? {
        appointment: {
          is: {
            status: { in: ["CHECKED_IN", "IN_SERVICE"] },
            jobCard: { is: { mechanic: { is: { userId: user.id } } } },
          },
        },
      }
    : {
        OR: [
          { appointment: { is: null } },
          { appointment: { is: { status: { in: ["CHECKED_IN", "IN_SERVICE"] } } } },
        ],
      };
  const inspectionFilter: Prisma.VehicleInspectionWhereInput = user.role === "MECHANIC"
    ? {
        reception: {
          is: {
            appointment: {
              is: {
                jobCard: {
                  is: { mechanic: { is: { userId: user.id } } },
                },
              },
            },
          },
        },
      }
    : {};

  try {
    const [inspections, receptions] = await Promise.all([
      prisma.vehicleInspection.findMany({
        where: inspectionFilter,
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          reception: {
            include: {
              customer: { select: { name: true } },
              vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
              appointment: { select: { id: true, status: true, service: { select: { name: true } }, jobCard: { select: { id: true } } } },
            },
          },
          inspectedBy: { select: { name: true } },
          items: { orderBy: [{ category: "asc" }, { name: "asc" }] },
          images: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
        },
      }),
      prisma.reception.findMany({
        where: {
          ...receptionFilter,
          inspection: null,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          customer: { select: { name: true } },
          vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
          appointment: { select: { id: true, status: true, service: { select: { name: true } } } },
        },
      }),
    ]);
    return Response.json({
      inspections: inspections.map((inspection) => ({
        ...inspection,
        inspectionNumber: `INSP-${String(inspection.id).padStart(6, "0")}`,
      })),
      eligibleReceptions: receptions.map((reception) => ({
        ...reception,
        receptionNumber: `REC-${String(reception.id).padStart(6, "0")}`,
      })),
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Vehicle inspections could not be loaded.", error);
    return Response.json({ error: "Vehicle inspections could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requirePermission("inspections:write");
  if (user instanceof Response) return user;

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number.isFinite(Number(contentLength)) && Number(contentLength) > 16 * 1024 * 1024) {
    return Response.json({ error: "Inspection submissions cannot exceed 16 MB." }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Inspection details must be submitted as multipart form data." }, { status: 400 });
  }
  const rawRecord = formData.get("inspection");
  if (typeof rawRecord !== "string") return Response.json({ error: "Inspection details are required." }, { status: 400 });

  let input: unknown;
  try {
    input = JSON.parse(rawRecord);
  } catch {
    return Response.json({ error: "Inspection details must contain valid JSON." }, { status: 400 });
  }
  const parsed = inspectionSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Invalid inspection details.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const seenItems = new Set<string>();
  for (const item of parsed.data.items) {
    const key = `${item.category}\u0000${item.name}`;
    if (!checklistItems.has(key) || seenItems.has(key)) {
      return Response.json({ error: "Inspection items must match the complete standard checklist." }, { status: 400 });
    }
    seenItems.add(key);
  }
  if (seenItems.size !== checklistItems.size) {
    return Response.json({ error: "The inspection checklist is incomplete." }, { status: 400 });
  }

  let uploads: PrivateImageUpload[];
  try {
    uploads = await preparePrivateImages(formData.getAll("photos"), `inspections/${parsed.data.receptionId}`);
  } catch (error) {
    if (error instanceof PrivateImageValidationError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Inspection photo validation failed.", error);
    return Response.json({ error: "Inspection photos could not be processed." }, { status: 500 });
  }

  try {
    const reception = await prisma.reception.findUnique({
      where: { id: parsed.data.receptionId },
      select: {
        id: true,
        mileage: true,
        vehicleId: true,
        appointment: {
          select: {
            id: true,
            status: true,
            jobCard: { select: { id: true, status: true, mechanic: { select: { userId: true } } } },
          },
        },
      },
    });
    if (!reception) return Response.json({ error: "Reception record was not found." }, { status: 404 });
    if (!canInspectReception(user.role, user.id, reception)) {
      return Response.json({ error: "This reception is not available for inspection by your account." }, { status: 403 });
    }
    if (parsed.data.mileage < reception.mileage) {
      return Response.json({ error: "Inspection mileage cannot be less than the recorded reception mileage." }, { status: 400 });
    }
    for (const upload of uploads) await uploadPrivateImage(upload);

    const inspection = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.vehicleInspection.findUnique({
        where: { receptionId: reception.id },
        select: { id: true },
      });
      let inspectionId: number;
      if (existing) {
        const updated = await transaction.vehicleInspection.update({
          where: { id: existing.id },
          data: {
            jobCardId: reception.appointment?.jobCard?.id ?? null,
            inspectedByUserId: user.id,
            mileage: parsed.data.mileage,
            notes: parsed.data.notes || null,
          },
          select: { id: true },
        });
        inspectionId = updated.id;
        await transaction.inspectionItem.deleteMany({ where: { inspectionId } });
        await transaction.inspectionItem.createMany({
          data: parsed.data.items.map((item) => ({
            inspectionId,
            category: item.category,
            name: item.name,
            status: item.status,
            notes: item.notes || null,
          })),
        });
        if (uploads.length) {
          await transaction.inspectionImage.createMany({
            data: uploads.map(({ objectKey, fileName, mimeType, sizeBytes }) => ({
              inspectionId,
              objectKey,
              fileName,
              mimeType,
              sizeBytes,
            })),
          });
        }
      } else {
        const created = await transaction.vehicleInspection.create({
          data: {
            receptionId: reception.id,
            jobCardId: reception.appointment?.jobCard?.id ?? null,
            inspectedByUserId: user.id,
            mileage: parsed.data.mileage,
            notes: parsed.data.notes || null,
            items: {
              create: parsed.data.items.map((item) => ({
                category: item.category,
                name: item.name,
                status: item.status,
                notes: item.notes || null,
              })),
            },
            images: {
              create: uploads.map(({ objectKey, fileName, mimeType, sizeBytes }) => ({
                objectKey,
                fileName,
                mimeType,
                sizeBytes,
              })),
            },
          },
          select: { id: true },
        });
        inspectionId = created.id;
      }

      if (reception.appointment?.jobCard && ["WAITING", "INSPECTION"].includes(reception.appointment.jobCard.status)) {
        await transaction.jobCard.updateMany({
          where: { id: reception.appointment.jobCard.id, status: { in: ["WAITING", "INSPECTION"] } },
          data: { status: "INSPECTION" },
        });
      }
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: existing ? "VEHICLE_INSPECTION_UPDATED" : "VEHICLE_INSPECTION_CREATED",
          entityType: "VehicleInspection",
          entityId: inspectionId,
          request,
          details: {
            receptionId: reception.id,
            mileage: parsed.data.mileage,
            criticalItems: parsed.data.items.filter((item) => item.status === "CRITICAL").length,
            attentionItems: parsed.data.items.filter((item) => item.status === "ATTENTION_REQUIRED").length,
            photoCount: uploads.length,
          },
        }),
      });
      return transaction.vehicleInspection.findUniqueOrThrow({
        where: { id: inspectionId },
        include: {
          reception: {
            include: {
              customer: { select: { name: true } },
              vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
              appointment: { select: { id: true, status: true, service: { select: { name: true } }, jobCard: { select: { id: true } } } },
            },
          },
          inspectedBy: { select: { name: true } },
          items: { orderBy: [{ category: "asc" }, { name: "asc" }] },
          images: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
        },
      });
    });

    return Response.json({
      inspection: { ...inspection, inspectionNumber: `INSP-${String(inspection.id).padStart(6, "0")}` },
    }, { status: 201 });
  } catch (error) {
    if (uploads.length) {
      try {
        await deletePrivateImages(uploads.map((upload) => upload.objectKey));
      } catch (cleanupError) {
        console.error("Inspection photo cleanup failed after an unsuccessful inspection.", cleanupError);
      }
    }
    if (error instanceof Error && error.message === "RECEPTION_STORAGE_NOT_CONFIGURED") {
      return Response.json({ error: "Private inspection image storage is not configured." }, { status: 503 });
    }
    if (error instanceof Error && error.message === "RECEPTION_STORAGE_CREDENTIALS_INCOMPLETE") {
      return Response.json({ error: "Private inspection image storage credentials are incomplete." }, { status: 503 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "This reception already has an inspection record." }, { status: 409 });
    }
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Vehicle inspection could not be saved.", error);
    return Response.json({ error: "Vehicle inspection could not be saved." }, { status: 500 });
  }
}
