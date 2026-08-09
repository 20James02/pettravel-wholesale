import "server-only";

import { serverEnv } from "@/server/env";

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
  const accountName = serverEnv.PAYMENT_QR_ACCOUNT_NAME ?? "PET TRAVEL WHOLESALE";
  const accountNo = serverEnv.PAYMENT_QR_ACCOUNT_NO ?? "CONFIGURE_BANK_ACCOUNT";

  return [
    "PETTRAVEL_WHOLESALE_PAYMENT",
    `account=${accountNo}`,
    `name=${accountName}`,
    `amount=${input.amount}`,
    `reference=${reference}`
  ].join("|");
}
