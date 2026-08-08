import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth";
import { getOrders, saveOrder } from "@/server/db";
import type { CustomerOrder } from "@/lib/domain";

export const runtime = "nodejs";

// Helper to sanitize orders for customers (masking internal notes/fields)
function sanitizeOrderForCustomer(order: CustomerOrder): CustomerOrder {
  return {
    ...order,
    comments: order.comments.filter((c) => c.audience !== "internal")
  };
}

/**
 * GET /api/orders
 * - Admin: returns ALL orders
 * - Customer: returns only their own orders
 */
export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json(
      { error: "Vui lòng đăng nhập để xem đơn hàng." },
      { status: 401 }
    );
  }

  const orders = await getOrders(user);
  const safeOrders = user.isAdmin
    ? orders
    : orders.map(sanitizeOrderForCustomer);

  const hasActiveOrder = orders.some(
    (o) =>
      o.customerId === user.id &&
      o.commercialStatus !== "cancelled" &&
      o.fulfillmentStatus !== "delivered"
  );
  const canCreateOrder = user.isAdmin ? false : !hasActiveOrder;

  return NextResponse.json({
    orders: safeOrders,
    canCreateOrder,
    total: safeOrders.length
  });
}

/**
 * POST /api/orders — Create a new order proposal (Customer only)
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }
  if (user.isAdmin) {
    return NextResponse.json({ error: "Quản trị viên không thể tạo đơn đại lý." }, { status: 403 });
  }

  const orders = await getOrders(user);
  const hasActiveOrder = orders.some(
    (o) =>
      o.customerId === user.id &&
      o.commercialStatus !== "cancelled" &&
      o.fulfillmentStatus !== "delivered"
  );

  if (hasActiveOrder) {
    return NextResponse.json(
      { error: "Bạn đang có đơn hàng sỉ đang hoạt động. Không thể tạo thêm đơn hàng mới cùng lúc." },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { items, paymentIntent, quoteVersions, recipientName, recipientPhone, recipientAddress } = body;

    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    const seq = String(orders.length + 1001);
    const orderNumber = `PTW-${dateStr}-${seq}`;

    const newOrder: CustomerOrder = {
      id: `ord_${Date.now()}`,
      number: orderNumber,
      customerName: user.name,
      customerCompany: user.company,
      customerId: user.id,
      commercialStatus: "submitted",
      paymentStatus: "unrequested",
      fulfillmentStatus: "not_started",
      paymentIntent: paymentIntent ?? "deposit_cod",
      invoiceRequested: false,
      recipientName: recipientName ?? "",
      recipientPhone: recipientPhone ?? "",
      recipientAddress: recipientAddress ?? "",
      items: items ?? [],
      quoteVersions: quoteVersions ?? [],
      paymentRequests: [],
      paymentProofs: [],
      fulfillmentGroups: [],
      comments: [
        {
          id: `c_init_${Date.now()}`,
          author: "Hệ thống",
          audience: "customer_visible",
          message: "Đại lý vừa gửi danh sách đề xuất đơn hàng sỉ mới. Vui lòng chờ nhân viên kiểm kho và thẩm định báo giá.",
          createdAt: new Date().toISOString()
        }
      ],
      updatedAt: new Date().toISOString()
    };

    await saveOrder(newOrder, user.id);

    return NextResponse.json({ order: sanitizeOrderForCustomer(newOrder) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Lỗi tạo đơn hàng.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/**
 * PUT /api/orders — Update an existing order (Customer or Admin)
 */
export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  try {
    const updatedOrder: CustomerOrder = await request.json();
    
    // Find existing order
    const orders = await getOrders(user);
    const existing = orders.find((o) => o.id === updatedOrder.id);
    if (!existing) {
      return NextResponse.json({ error: "Đơn hàng không tồn tại." }, { status: 404 });
    }

    // Security check: Customer can only update their own order
    if (!user.isAdmin && existing.customerId !== user.id) {
      return NextResponse.json({ error: "Bạn không có quyền chỉnh sửa đơn hàng này." }, { status: 403 });
    }

    // If customer updates, sanitize input to prevent tampering with admin fields
    let orderToSave = updatedOrder;
    if (!user.isAdmin) {
      orderToSave = {
        ...updatedOrder,
        customerId: existing.customerId,
        fulfillmentGroups: existing.fulfillmentGroups,
        quoteVersions: existing.quoteVersions,
        paymentRequests: existing.paymentRequests
      };
    }

    await saveOrder(orderToSave, user.id);

    const result = user.isAdmin ? orderToSave : sanitizeOrderForCustomer(orderToSave);
    return NextResponse.json({ order: result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Lỗi cập nhật đơn hàng.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
