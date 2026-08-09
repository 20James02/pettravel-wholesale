import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, requireSameOrigin } from "@/server/auth";
import { getOrders, getProducts, saveOrder } from "@/server/db";
import type { CustomerOrder, OrderComment, OrderItem, PaymentProof } from "@/lib/domain";

export const runtime = "nodejs";

const customerOrderItemSchema = z.object({
  variantSku: z.string().min(1).max(120),
  quantity: z.number().int().positive().max(10_000)
}).passthrough();

const createCustomerOrderSchema = z.object({
  items: z.array(customerOrderItemSchema).min(1).max(200),
  paymentIntent: z.enum(["deposit_cod", "pay_full"]).default("deposit_cod"),
  recipientName: z.string().trim().min(2).max(120),
  recipientPhone: z.string().trim().min(8).max(30),
  recipientAddress: z.string().trim().min(6).max(500)
});

const customerCommentSchema = z.object({
  id: z.string().min(1).max(120).optional(),
  message: z.string().trim().min(1).max(2000)
});

const customerProofSchema = z.object({
  id: z.string().min(1).max(120),
  paymentRequestId: z.string().min(1).max(120),
  fileName: z.string().min(3).max(180),
  uploadedAt: z.string().optional()
});

const customerOrderUpdateSchema = z.object({
  id: z.string().min(1).max(120),
  paymentIntent: z.enum(["deposit_cod", "pay_full"]).optional(),
  invoiceRequested: z.boolean().optional(),
  recipientName: z.string().trim().min(2).max(120).optional(),
  recipientPhone: z.string().trim().min(8).max(30).optional(),
  recipientAddress: z.string().trim().min(6).max(500).optional(),
  comments: z.array(customerCommentSchema).max(20).optional(),
  paymentProofs: z.array(customerProofSchema).max(20).optional()
});

async function buildCustomerItems(
  rawItems: Array<z.infer<typeof customerOrderItemSchema>>
): Promise<OrderItem[]> {
  const catalog = await getProducts("customer");

  return rawItems.map((item, index) => {
    const product = catalog.find((candidate) =>
      candidate.variants.some((variant) => variant.sku === item.variantSku)
    );
    const variant = product?.variants.find((candidate) => candidate.sku === item.variantSku);

    if (!product || !variant) {
      throw new Error(`SKU khong hop le hoac khong kha dung: ${item.variantSku}`);
    }

    return {
      id: `oi_${Date.now()}_${index}`,
      productCode: product.code,
      productName: product.name,
      variantSku: variant.sku,
      variantLabel: variant.label,
      quantity: item.quantity,
      unitPriceSnapshot: variant.wholesalePrice,
      supplierId: variant.supplierId
    };
  });
}

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
  try {
    requireSameOrigin(request);
  } catch (resp) {
    if (resp instanceof Response) return resp;
  }

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
    const body = createCustomerOrderSchema.parse(await request.json());
    const items = await buildCustomerItems(body.items);

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
      paymentIntent: body.paymentIntent,
      invoiceRequested: false,
      recipientName: body.recipientName,
      recipientPhone: body.recipientPhone,
      recipientAddress: body.recipientAddress,
      items,
      quoteVersions: [],
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
  try {
    requireSameOrigin(request);
  } catch (resp) {
    if (resp instanceof Response) return resp;
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  try {
    const rawBody = await request.json();
    const updatedOrder: CustomerOrder = user.isAdmin
      ? rawBody
      : ({ id: customerOrderUpdateSchema.parse(rawBody).id } as CustomerOrder);
    
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
    if (user.isAdmin) {
      // 1. Staff lock check
      if (existing.assignedStaffId && existing.assignedStaffId !== user.id) {
        if (user.role !== "super_admin") {
          return NextResponse.json(
            { error: `Đơn hàng này đang được xử lý bởi nhân viên khác (${existing.assignedStaffName || "Nhân viên vận hành"}). Bạn không có quyền chỉnh sửa.` },
            { status: 403 }
          );
        }
      }
      // 2. Auto-assign staff if not already assigned
      if (!existing.assignedStaffId) {
        orderToSave = {
          ...updatedOrder,
          assignedStaffId: user.id,
          assignedStaffName: user.name
        };
      }
    } else {
      const customerPayload = customerOrderUpdateSchema.parse(rawBody);
      const existingPaymentRequestIds = new Set(existing.paymentRequests.map((request) => request.id));
      const safeComments: OrderComment[] = [
        ...existing.comments,
        ...(customerPayload.comments ?? []).map((comment) => ({
          id: comment.id ?? `c_${Date.now()}_${cryptoRandomSuffix()}`,
          author: user.name,
          audience: "customer_visible" as const,
          message: comment.message,
          createdAt: new Date().toISOString()
        }))
      ];
      const safeProofs: PaymentProof[] = [
        ...existing.paymentProofs,
        ...(customerPayload.paymentProofs ?? [])
          .filter((proof) => existingPaymentRequestIds.has(proof.paymentRequestId))
          .map((proof) => ({
            id: proof.id,
            paymentRequestId: proof.paymentRequestId,
            fileName: proof.fileName,
            uploadedAt: proof.uploadedAt ?? new Date().toISOString(),
            status: "pending_admin_confirmation" as const
          }))
      ];

      orderToSave = {
        ...existing,
        paymentIntent: customerPayload.paymentIntent ?? existing.paymentIntent,
        invoiceRequested: customerPayload.invoiceRequested ?? existing.invoiceRequested,
        recipientName: customerPayload.recipientName ?? existing.recipientName,
        recipientPhone: customerPayload.recipientPhone ?? existing.recipientPhone,
        recipientAddress: customerPayload.recipientAddress ?? existing.recipientAddress,
        customerId: existing.customerId,
        customerName: existing.customerName,
        customerCompany: existing.customerCompany,
        commercialStatus: existing.commercialStatus,
        paymentStatus: existing.paymentStatus,
        fulfillmentStatus: existing.fulfillmentStatus,
        items: existing.items,
        fulfillmentGroups: existing.fulfillmentGroups,
        quoteVersions: existing.quoteVersions,
        paymentRequests: existing.paymentRequests,
        paymentProofs: safeProofs,
        comments: safeComments,
        assignedStaffId: existing.assignedStaffId,
        assignedStaffName: existing.assignedStaffName
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

function cryptoRandomSuffix(): string {
  return crypto.randomUUID().slice(0, 8);
}
