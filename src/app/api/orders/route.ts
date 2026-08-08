import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth";
import {
  getOrdersForUser,
  sanitizeOrderForCustomer,
  hasActiveOrder
} from "@/lib/mock-data";

export const runtime = "nodejs";

/**
 * GET /api/orders
 * - Admin: returns ALL orders (for multi-order management view)
 * - Customer: returns only their own orders
 * - Guest: returns 401
 */
export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json(
      { error: "Vui lòng đăng nhập để xem đơn hàng." },
      { status: 401 }
    );
  }

  const orders = getOrdersForUser(user);

  // For customers: sanitize each order (strip internal data)
  const safeOrders = user.isAdmin
    ? orders
    : orders.map(sanitizeOrderForCustomer);

  // For customers: also include whether they can create a new order
  const canCreateOrder = user.isAdmin ? false : !hasActiveOrder(user.id);

  return NextResponse.json({
    orders: safeOrders,
    canCreateOrder,
    total: safeOrders.length
  });
}
