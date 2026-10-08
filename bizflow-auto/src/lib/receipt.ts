export function formatReceiptNumber(paymentId: number) {
  return `RCT-${String(paymentId).padStart(8, "0")}`;
}
