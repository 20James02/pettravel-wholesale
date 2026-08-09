import "server-only";

import type { UserAccount } from "@/lib/domain";
import { createSupabaseServiceClient } from "@/server/supabase";

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

function normalizeRpcResult(value: unknown): StockReservationCommandResult {
  const result = (value ?? {}) as Record<string, unknown>;
  return {
    status: String(result.status ?? "unknown"),
    reservedQty: result.reservedQty === undefined ? undefined : Number(result.reservedQty),
    releasedQty: result.releasedQty === undefined ? undefined : Number(result.releasedQty),
    lineCount: Number(result.lineCount ?? 0),
    documentId: result.documentId === undefined || result.documentId === null ? undefined : String(result.documentId)
  };
}

export async function runStockReservationCommand(
  input: StockReservationCommand,
  user: UserAccount
): Promise<StockReservationCommandResult> {
  const supabase = createSupabaseServiceClient();

  if (input.action === "reserve_order") {
    const { data, error } = await supabase.rpc("pt_reserve_order_stock", {
      p_order_id: input.orderId,
      p_actor_id: user.id,
      p_expires_at: input.expiresAt ?? null
    });

    if (error) {
      throw new Error(error.message);
    }
    return normalizeRpcResult(data);
  }

  const { data, error } = await supabase.rpc("pt_transition_order_stock_reservations", {
    p_order_id: input.orderId,
    p_actor_id: user.id,
    p_action: input.action,
    p_reason: input.reason || input.action
  });

  if (error) {
    throw new Error(error.message);
  }
  return normalizeRpcResult(data);
}
