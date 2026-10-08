import { z } from "zod";
import { getSessionUser, isDatabaseUnavailable } from "@/lib/auth";
import { decideQuotation } from "@/lib/quotation-approval";

export const runtime = "nodejs";

const decisionSchema = z.object({ decision: z.enum(["APPROVE", "REJECT"]) });
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "CUSTOMER") return Response.json({ error: "Customer access required." }, { status: 403 });
  const { id: rawId } = await context.params;
  if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) {
    return Response.json({ error: "Invalid quotation ID." }, { status: 400 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: "Invalid quotation decision." }, { status: 400 });

  try {
    const result = await decideQuotation({
      quotationId: Number(rawId),
      decision: parsed.data.decision,
      request,
      userId: user.id,
    });
    if ("error" in result) {
      const status = result.error === "NOT_FOUND" ? 404 : result.error === "FORBIDDEN" ? 403 : 409;
      const message = result.error === "EXPIRED" ? "This quotation has expired."
        : result.error === "NOT_PENDING" ? "This quotation has already been answered."
          : result.error === "APPOINTMENT_CLOSED" ? "This quotation cannot be answered because the appointment is closed."
            : result.error === "FORBIDDEN" ? "This quotation does not belong to your account."
              : "Quotation was not found.";
      return Response.json({ error: message }, { status });
    }
    return Response.json({ quotation: result.quotation });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Customer quotation decision failed.", error);
    return Response.json({ error: "Quotation decision could not be recorded." }, { status: 500 });
  }
}
