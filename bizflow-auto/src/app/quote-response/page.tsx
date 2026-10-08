import { QuotationResponse } from "@/components/quotation-response";

export default async function QuoteResponsePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return <QuotationResponse token={typeof token === "string" ? token : ""} />;
}
