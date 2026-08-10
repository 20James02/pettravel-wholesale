import "server-only";

import type { UserAccount } from "@/lib/domain";

export type StockReservationAction =
  | "reserve_order"
  | "release_order"
  | "expire_order"
  | "consume_order"
  | "cancel_order";

export interface StockReservationCommand {
  action: StockReservationAction;
  orderId: string;
  expiresAt?: string;
  reason?: string;
}

export interface StockReservationCommandResult {
  status: string;
  reservedQty?: number;
  releasedQty?: number;
  lineCount: number;
  documentId?: string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function backendFetch(path: string, options: RequestInit = {}) {
  const url = `${BACKEND_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend error: ${response.status} - ${text}`);
  }
  return response.json();
}

export async function runStockReservationCommand(
  input: StockReservationCommand,
  user: UserAccount
): Promise<StockReservationCommandResult> {
  const res = await backendFetch(`/api/v1/operations/reservation`, {
    method: "POST",
    body: JSON.stringify({
      ...input,
      actorId: user.id
    })
  });
  
  const result = res.result || {};
  return {
    status: String(result.status || res.status || "unknown"),
    reservedQty: result.reservedQty === undefined ? undefined : Number(result.reservedQty),
    releasedQty: result.releasedQty === undefined ? undefined : Number(result.releasedQty),
    lineCount: Number(result.lineCount || 0),
    documentId: result.documentId === undefined || result.documentId === null ? undefined : String(result.documentId)
  };
}
