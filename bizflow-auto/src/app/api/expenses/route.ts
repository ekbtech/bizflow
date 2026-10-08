import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const expenseSchema = z.object({
  category: z.string().trim().min(2).max(100),
  description: z.string().trim().min(3).max(500),
  payee: z.string().trim().max(255).nullable().optional(),
  amount: z.number().positive().max(9_999_999_999.99),
  paymentMethod: z.enum(["CASH", "M_PESA", "CARD", "BANK"]),
  reference: z.string().trim().max(255).nullable().optional(),
  expenseDate: z.string().date(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

export async function GET() {
  const user = await requirePermission("expenses:manage");
  if (user instanceof Response) return user;
  try {
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const [expenses, total, monthly] = await Promise.all([
      prisma.expense.findMany({
        orderBy: [{ expenseDate: "desc" }, { id: "desc" }],
        take: 1000,
        include: { createdBy: { select: { name: true } } },
      }),
      prisma.expense.aggregate({ _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { expenseDate: { gte: monthStart } }, _sum: { amount: true } }),
    ]);
    return Response.json({
      expenses,
      summary: { total: total._sum.amount ?? 0, monthly: monthly._sum.amount ?? 0 },
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Expense list query failed.", error);
    return Response.json({ error: "Expenses could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requirePermission("expenses:manage");
  if (user instanceof Response) return user;
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Invalid expense details.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const expense = await prisma.$transaction(async (transaction) => {
      const created = await transaction.expense.create({
        data: {
          ...parsed.data,
          amount: new Prisma.Decimal(parsed.data.amount.toFixed(2)),
          expenseDate: new Date(`${parsed.data.expenseDate}T00:00:00.000Z`),
          payee: parsed.data.payee?.trim() || null,
          reference: parsed.data.reference?.trim() || null,
          notes: parsed.data.notes?.trim() || null,
          createdByUserId: user.id,
        },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "EXPENSE_RECORDED",
          entityType: "Expense",
          entityId: created.id,
          request,
          details: {
            category: created.category,
            amount: created.amount.toFixed(2),
            paymentMethod: created.paymentMethod,
          },
        }),
      });
      return created;
    });
    return Response.json({ expense }, { status: 201 });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Expense creation failed.", error);
    return Response.json({ error: "Expense could not be recorded." }, { status: 500 });
  }
}
