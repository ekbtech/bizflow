import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { createPrivateImageUrl } from "@/lib/private-image-storage";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; imageId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const user = await requirePermission("inspections:read");
  if (user instanceof Response) return user;

  const { id, imageId } = await context.params;
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) ||
      !/^[1-9]\d*$/.test(imageId) || !Number.isSafeInteger(Number(imageId))) {
    return Response.json({ error: "Invalid inspection image reference." }, { status: 400 });
  }

  try {
    const image = await prisma.inspectionImage.findFirst({
      where: { id: Number(imageId), inspectionId: Number(id) },
      select: {
        objectKey: true,
        inspection: {
          select: {
            reception: {
              select: {
                appointment: {
                  select: {
                    jobCard: {
                      select: { mechanic: { select: { userId: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!image) return Response.json({ error: "Inspection image was not found." }, { status: 404 });
    if (user.role === "MECHANIC" && image.inspection.reception.appointment?.jobCard?.mechanic.userId !== user.id) {
      return Response.json({ error: "This inspection image is not available to your account." }, { status: 403 });
    }

    const url = await createPrivateImageUrl(image.objectKey);
    return new Response(null, {
      status: 302,
      headers: { Location: url, "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "RECEPTION_STORAGE_NOT_CONFIGURED") {
      return Response.json({ error: "Private inspection image storage is not configured." }, { status: 503 });
    }
    if (error instanceof Error && error.message === "RECEPTION_STORAGE_CREDENTIALS_INCOMPLETE") {
      return Response.json({ error: "Private inspection image storage credentials are incomplete." }, { status: 503 });
    }
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Inspection image URL creation failed.", error);
    return Response.json({ error: "Inspection image could not be opened." }, { status: 500 });
  }
}
