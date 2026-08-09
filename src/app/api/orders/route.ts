import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, requireSameOrigin } from "@/server/auth";
import { normalizeOrderQuoteFinancials } from "@/server/accounting/order-financials";
import { getAdminPolicy, getOrders, getProducts, saveOrder } from "@/server/db";
import type { CustomerOrder, OrderComment, OrderItem, PaymentProof } from "@/lib/domain";
import {
  getValidationErrorMessage,
  idSchema,
  phoneSchema,
  recipientSchema,
  shortTextSchema,
  vndAmountSchema
} from "@/lib/validation";

export const runtime = "nodejs";

const customerOrderItemSchema = z.object({
  variantSku: z.string().trim().min(1, "Thiếu SKU sản phẩm.").max(120, "SKU sản phẩm quá dài."),
  quantity: z
    .number()
    .int("Số lượng phải là số nguyên.")
    .positive("Số lượng phải lớn hơn 0.")
    .max(10_000, "Số lượng vượt quá giới hạn.")
}).passthrough();

const createCustomerOrderSchema = z.object({
  items: z.array(customerOrderItemSchema).min(1, "Đơn hàng phải có ít nhất 1 sản phẩm.").max(200, "Đơn hàng tối đa 200 dòng sản phẩm."),
  paymentIntent: z.enum(["deposit_cod", "pay_full"]).default("deposit_cod"),
  ...recipientSchema.shape
});

const customerCommentSchema = z.object({
  id: idSchema.optional(),
  message: shortTextSchema("Nội dung ghi chú", 1, 2000)
});

const customerProofSchema = z.object({
  id: idSchema,
  paymentRequestId: idSchema,
  fileName: z.string().trim().min(3, "Tên file quá ngắn.").max(180, "Tên file quá dài."),
  uploadedAt: z.string().optional()
});

const customerOrderUpdateSchema = z.object({
  id: idSchema,
  paymentIntent: z.enum(["deposit_cod", "pay_full"]).optional(),
  invoiceRequested: z.boolean().optional(),
  recipientName: recipientSchema.shape.recipientName.optional(),
  recipientPhone: phoneSchema.optional(),
  recipientAddress: recipientSchema.shape.recipientAddress.optional(),
  comments: z.array(customerCommentSchema).max(20, "Mỗi lần cập nhật tối đa 20 ghi chú.").optional(),
  paymentProofs: z.array(customerProofSchema).max(20, "Mỗi lần cập nhật tối đa 20 minh chứng.").optional()
});

const adminOrderItemSchema = z.object({
  id: idSchema,
  productCode: z.string().trim().min(1, "Thiếu mã sản phẩm.").max(80, "Mã sản phẩm quá dài."),
  productName: shortTextSchema("Tên sản phẩm", 1, 180),
  variantSku: z.string().trim().min(1, "Thiếu SKU phân loại.").max(120, "SKU phân loại quá dài."),
  variantLabel: shortTextSchema("Tên phân loại", 1, 120),
  quantity: z.number().int("Số lượng phải là số nguyên.").positive("Số lượng phải lớn hơn 0.").max(10_000),
  unitPriceSnapshot: vndAmountSchema("Đơn giá"),
  supplierId: idSchema
});

const adminQuoteAdjustmentSchema = z.object({
  id: idSchema,
  type: z.enum(["discount", "free_shipping", "offer", "shipping_fee"]),
  label: shortTextSchema("Tên điều chỉnh", 1, 160),
  amount: z.number().int("Số tiền điều chỉnh phải là số nguyên VND.").min(-10_000_000_000).max(10_000_000_000),
  requiresApproval: z.boolean()
});

const adminQuoteSchema = z.object({
  id: idSchema,
  version: z.number().int().positive(),
  status: z.enum(["draft", "published", "accepted", "superseded"]),
  subtotal: vndAmountSchema("Tạm tính"),
  adjustments: z.array(adminQuoteAdjustmentSchema).max(50, "Tối đa 50 điều chỉnh trên một báo giá."),
  finalTotal: vndAmountSchema("Tổng cuối"),
  depositAmount: vndAmountSchema("Số tiền cọc"),
  codRemaining: vndAmountSchema("COD còn lại"),
  shippingFeeOption: z.enum(["included", "separate_cod"]).optional(),
  expiresAt: z.string().min(1, "Thiếu hạn báo giá.")
});

const adminOrderSchema = z.object({
  id: idSchema,
  number: z.string().trim().min(1, "Thiếu số đơn hàng.").max(80, "Số đơn hàng quá dài."),
  customerName: shortTextSchema("Tên khách hàng", 1, 120),
  customerCompany: shortTextSchema("Tên công ty", 1, 160),
  customerId: idSchema,
  assignedStaffId: idSchema.optional(),
  assignedStaffName: shortTextSchema("Tên nhân viên", 1, 120).optional(),
  commercialStatus: z.enum(["draft", "submitted", "admin_review", "quoted", "customer_accepted", "locked", "cancelled"]),
  paymentStatus: z.enum(["unrequested", "deposit_requested", "deposit_uploaded", "deposit_confirmed", "full_requested", "full_uploaded", "paid", "cod_remaining", "refunded"]),
  fulfillmentStatus: z.enum(["not_started", "supplier_checking", "supplier_confirmed", "packing", "ready_to_ship", "shipped", "delivered"]),
  paymentIntent: z.enum(["deposit_cod", "pay_full"]),
  invoiceRequested: z.boolean(),
  recipientName: recipientSchema.shape.recipientName.optional().or(z.literal("")),
  recipientPhone: phoneSchema.optional().or(z.literal("")),
  recipientAddress: recipientSchema.shape.recipientAddress.optional().or(z.literal("")),
  items: z.array(adminOrderItemSchema).min(1, "Đơn hàng phải có ít nhất 1 sản phẩm.").max(200, "Đơn hàng tối đa 200 dòng sản phẩm."),
  quoteVersions: z.array(adminQuoteSchema).max(50, "Tối đa 50 phiên bản báo giá."),
  paymentRequests: z.array(z.unknown()).max(50),
  paymentProofs: z.array(z.unknown()).max(50),
  fulfillmentGroups: z.array(z.unknown()).max(50),
  comments: z.array(z.unknown()).max(200),
  updatedAt: z.string().min(1)
}).passthrough();

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
      throw new Error(`SKU không hợp lệ hoặc không khả dụng: ${item.variantSku}`);
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

function sanitizeOrderForCustomer(order: CustomerOrder): CustomerOrder {
  return {
    ...order,
    comments: order.comments.filter((c) => c.audience !== "internal")
  };
}

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Vui lòng đăng nhập để xem đơn hàng." }, { status: 401 });
  }

  const orders = await getOrders(user);
  const safeOrders = user.isAdmin ? orders : orders.map(sanitizeOrderForCustomer);
  const hasActiveOrder = orders.some(
    (o) =>
      o.customerId === user.id &&
      o.commercialStatus !== "cancelled" &&
      o.fulfillmentStatus !== "delivered"
  );

  return NextResponse.json({
    orders: safeOrders,
    canCreateOrder: user.isAdmin ? false : !hasActiveOrder,
    total: safeOrders.length
  });
}

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
    const msg = getValidationErrorMessage(error, "Lỗi tạo đơn hàng.");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

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
      ? (adminOrderSchema.parse(rawBody) as CustomerOrder)
      : ({ id: customerOrderUpdateSchema.parse(rawBody).id } as CustomerOrder);

    const orders = await getOrders(user);
    const existing = orders.find((o) => o.id === updatedOrder.id);
    if (!existing) {
      return NextResponse.json({ error: "Đơn hàng không tồn tại." }, { status: 404 });
    }

    if (!user.isAdmin && existing.customerId !== user.id) {
      return NextResponse.json({ error: "Bạn không có quyền chỉnh sửa đơn hàng này." }, { status: 403 });
    }

    let orderToSave = updatedOrder;
    if (user.isAdmin) {
      if (existing.assignedStaffId && existing.assignedStaffId !== user.id && user.role !== "super_admin") {
        return NextResponse.json(
          { error: `Đơn hàng này đang được xử lý bởi nhân viên khác (${existing.assignedStaffName || "Nhân viên vận hành"}). Bạn không có quyền chỉnh sửa.` },
          { status: 403 }
        );
      }

      if (!existing.assignedStaffId) {
        orderToSave = {
          ...updatedOrder,
          assignedStaffId: user.id,
          assignedStaffName: user.name
        };
      }
      orderToSave = normalizeOrderQuoteFinancials(orderToSave, await getAdminPolicy());
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
    const msg = getValidationErrorMessage(error, "Lỗi cập nhật đơn hàng.");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

function cryptoRandomSuffix(): string {
  return crypto.randomUUID().slice(0, 8);
}
