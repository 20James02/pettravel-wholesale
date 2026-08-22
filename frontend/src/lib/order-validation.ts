import { z } from "zod";

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(0|\+84)[0-9]{9,10}$/, "Số điện thoại không hợp lệ (cần 10-11 chữ số).");

export const idSchema = z.string().trim().min(1, "ID không được để trống.");

export const recipientSchema = z.object({
  recipientName: z.string().trim().min(2, "Tên người nhận cần ít nhất 2 ký tự.").max(100),
  recipientPhone: phoneSchema,
  recipientAddress: z.string().trim().min(5, "Địa chỉ giao hàng cần ít nhất 5 ký tự.").max(255)
});

export const customerCommentSchema = z.object({
  id: z.string().optional(),
  authorId: z.string().optional(),
  authorName: z.string().optional(),
  audience: z.literal("customer_visible").default("customer_visible"),
  message: z.string().trim().min(1, "Nội dung phản hồi không được để trống.").max(1000),
  createdAt: z.string().optional()
});

export const customerProofSchema = z.object({
  id: idSchema.optional(),
  paymentRequestId: idSchema,
  fileName: z.string().trim().min(1, "Tên file quá ngắn.").max(180, "Tên file quá dài."),
  storageKey: z.string().trim().min(10).max(500).regex(/^orders\/[a-z0-9_-]+\/(payment-proof|invoice)\/[a-z0-9]+\.(jpg|png|webp|avif|pdf)$/),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif", "application/pdf"]),
  fileSizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
  uploadedAt: z.string().optional()
}).strict();

export const customerPaymentRequestSchema = z.object({
  id: z.string().trim().min(1),
  quoteVersion: z.number().int().nonnegative(),
  amount: z.number().int().nonnegative(),
  purpose: z.enum(["deposit", "full", "remaining"]),
  reference: z.string().trim().min(1),
  qrPayload: z.string().trim().min(1),
  expiresAt: z.string().min(1),
  status: z.enum(["active", "uploaded", "confirmed", "expired", "superseded"])
});

export const FORBIDDEN_CUSTOMER_FIELDS = [
  "items",
  "quoteVersions",
  "fulfillmentGroups",
  "fulfillmentStatus",
  "shipment",
  "paymentRequests",
  "assignedStaffId",
  "assignedStaffName",
  "paymentStatus"
] as const;

export const customerOrderUpdateSchema = z.object({
  id: idSchema,
  expectedUpdatedAt: z.string().optional(),
  paymentIntent: z.enum(["deposit_cod", "pay_full"]).optional(),
  invoiceRequested: z.boolean().optional(),
  recipientName: recipientSchema.shape.recipientName.optional().or(z.literal("")),
  recipientPhone: phoneSchema.optional().or(z.literal("")),
  recipientAddress: recipientSchema.shape.recipientAddress.optional().or(z.literal("")),
  customerTaxCode: z.string().trim().max(50).optional().or(z.literal("")),
  customerNote: z.string().trim().max(1000).optional().or(z.literal("")),
  commercialStatus: z.enum(["draft", "submitted", "admin_review", "customer_accepted"]).optional(),
  acceptedQuoteId: z.string().trim().min(1).optional(),
  acceptedQuoteVersion: z.number().int().positive().optional(),
  comments: z.array(customerCommentSchema).max(20, "Mỗi lần cập nhật tối đa 20 ghi chú.").optional(),
  paymentProofs: z.array(customerProofSchema).max(20, "Mỗi lần cập nhật tối đa 20 minh chứng.").optional()
}).strict().superRefine((data, ctx) => {
  if (data.commercialStatus === "customer_accepted") {
    if (!data.acceptedQuoteId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["acceptedQuoteId"],
        message: "acceptedQuoteId là bắt buộc khi khách hàng xác nhận báo giá."
      });
    }
    if (!data.acceptedQuoteVersion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["acceptedQuoteVersion"],
        message: "acceptedQuoteVersion là bắt buộc khi khách hàng xác nhận báo giá."
      });
    }
  }
});

export function validateCustomerMutation(payload: unknown): {
  success: boolean;
  data?: z.infer<typeof customerOrderUpdateSchema>;
  error?: string;
} {
  if (!payload || typeof payload !== "object") {
    return { success: false, error: "CUSTOMER_PAYLOAD_INVALID" };
  }
  for (const forbidden of FORBIDDEN_CUSTOMER_FIELDS) {
    if (forbidden in (payload as Record<string, unknown>)) {
      return { success: false, error: `CUSTOMER_OVERPOSTING_REJECTED: Field '${forbidden}' is forbidden.` };
    }
  }
  const result = customerOrderUpdateSchema.safeParse(payload);
  if (!result.success) {
    return { success: false, error: result.error.errors[0]?.message || "VALIDATION_FAILED" };
  }
  return { success: true, data: result.data };
}
