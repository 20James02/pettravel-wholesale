import "server-only";

interface PaymentQrInput {
  orderNumber: string;
  quoteVersion: number;
  amount: number;
  purpose: "deposit" | "full" | "remaining";
  reference?: string;
  timestamp?: number;
}

export function buildPaymentReference(input: PaymentQrInput): string {
  if (input.reference) return input.reference.toUpperCase();
  const ts = input.timestamp ?? Date.now();
  const timeStr = new Date(ts).toISOString().replace(/[^0-9]/g, "").slice(8, 14);
  return `PTW-${input.orderNumber}-Q${input.quoteVersion}-${input.purpose}-${timeStr}`.toUpperCase();
}

export function buildQrPayload(input: PaymentQrInput): string {
  const reference = buildPaymentReference(input);
  const accountName = process.env.PAYMENT_QR_ACCOUNT_NAME?.trim() || "PET TRAVEL WHOLESALE";
  const accountNo = process.env.PAYMENT_QR_ACCOUNT_NO?.trim();
  if (!accountNo) {
    throw new Error("PAYMENT_QR_ACCOUNT_NO is not configured.");
  }

  return [
    "PETTRAVEL_WHOLESALE_PAYMENT",
    `account=${accountNo}`,
    `name=${accountName}`,
    `amount=${input.amount}`,
    `reference=${reference}`
  ].join("|");
}
