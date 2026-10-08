import { createHash } from "node:crypto";
import { z } from "zod";
import { isDatabaseUnavailable } from "@/lib/auth";
import { decideQuotation } from "@/lib/quotation-approval";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const decisionSchema = z.object({
  token: tokenSchema,
  decision: z.enum(["APPROVE", "REJECT"]),
});
const privateHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!tokenSchema.safeParse(token).success) {
    return Response.json({ error: "This quotation response link is invalid or expired." }, { status: 404, headers: privateHeaders });
  }

  try {
    const approvalTokenHash = createHash("sha256").update(token).digest("hex");
    const quotation = await prisma.quotation.findFirst({
      where: { approvalTokenHash, status: "SENT", expiresAt: { gt: new Date() } },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        notes: true,
        expiresAt: true,
        items: { orderBy: { id: "asc" }, select: { itemType: true, description: true, quantity: true, unitPrice: true, discountAmount: true, lineTotal: true } },
        appointment: {
          select: {
            status: true,
            customer: { select: { name: true } },
            vehicle: { select: { registrationNumber: true, make: true, model: true } },
            service: { select: { name: true } },
          },
        },
      },
    });
    if (!quotation) return Response.json({ error: "This quotation response link is invalid or expired." }, { status: 404, headers: privateHeaders });
    if (!["CHECKED_IN", "IN_SERVICE"].includes(quotation.appointment.status)) {
      return Response.json({ error: "This quotation is no longer available for a decision." }, { status: 409, headers: privateHeaders });
    }
    return Response.json({ quotation }, { headers: privateHeaders });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503, headers: privateHeaders });
    console.error("Quotation response link lookup failed.", error);
    return Response.json({ error: "Quotation details could not be loaded." }, { status: 500, headers: privateHeaders });
  }
}

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400, headers: privateHeaders });
  }
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Invalid quotation decision." }, { status: 400, headers: privateHeaders });
  }

  try {
    const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
    const result = await decideQuotation({ decision: parsed.data.decision, tokenHash, request });
    if ("error" in result) {
      const status = result.error === "NOT_FOUND" ? 404 : result.error === "FORBIDDEN" ? 403 : result.error === "EXPIRED" || result.error === "NOT_PENDING" ? 409 : 409;
      const message = result.error === "EXPIRED" ? "This quotation has expired."
        : result.error === "NOT_PENDING" ? "This quotation has already been answered."
          : result.error === "APPOINTMENT_CLOSED" ? "This quotation cannot be answered because the appointment is closed."
            : "This quotation response link is invalid or expired.";
      return Response.json({ error: message }, { status, headers: privateHeaders });
    }
    return Response.json({ quotation: result.quotation }, { headers: privateHeaders });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503, headers: privateHeaders });
    console.error("Quotation link decision failed.", error);
    return Response.json({ error: "Quotation decision could not be recorded." }, { status: 500, headers: privateHeaders });
  }
}
