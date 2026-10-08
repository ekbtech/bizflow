import { Prisma, QuotationItemType } from "@prisma/client";
import { z } from "zod";

const decimalValue = z.string().regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/);

export const quotationItemsSchema = z.array(z.object({
  itemType: z.nativeEnum(QuotationItemType),
  partId: z.number().int().positive().nullable().optional(),
  description: z.string().trim().min(1).max(500),
  quantity: decimalValue,
  unitPrice: decimalValue,
  discountAmount: decimalValue,
})).min(1).max(100).superRefine((items, context) => {
  items.forEach((item, index) => {
    if (item.itemType === "PART" && !item.partId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "partId"], message: "Select a stock part." });
    }
    if (item.itemType !== "PART" && item.partId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "partId"], message: "Only part quotation lines can reference inventory." });
    }
  });
});

export function calculateQuotation(items: z.infer<typeof quotationItemsSchema>) {
  const prepared = items.map((item) => {
    const quantity = new Prisma.Decimal(item.quantity);
    const unitPrice = new Prisma.Decimal(item.unitPrice);
    const discountAmount = new Prisma.Decimal(item.discountAmount);
    const gross = quantity.mul(unitPrice).toDecimalPlaces(2);
    if (quantity.lte(0) || unitPrice.lt(0) || discountAmount.lt(0) || discountAmount.gt(gross)) {
      throw new Error("INVALID_QUOTATION_LINE");
    }
    const lineTotal = gross.minus(discountAmount);
    if (lineTotal.gt("9999999999.99")) throw new Error("QUOTATION_LINE_TOO_LARGE");
    return { ...item, partId: item.partId ?? null, quantity, unitPrice, discountAmount, lineTotal };
  });
  const totalAmount = prepared.reduce(
    (total, item) => total.plus(item.lineTotal),
    new Prisma.Decimal(0),
  ).toDecimalPlaces(2);
  if (totalAmount.gt("9999999999.99")) throw new Error("QUOTATION_TOTAL_TOO_LARGE");
  return { items: prepared, totalAmount };
}

export function quoteExpiry(date: string) {
  return new Date(`${date}T23:59:59.000Z`);
}
