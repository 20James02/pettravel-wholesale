import { z } from "zod";

const vietnamPhoneRegex = /^(0|\+84)[0-9]{8,10}$/;
const safeCodeRegex = /^[A-Z0-9][A-Z0-9_-]{1,39}$/i;
const safeSkuRegex = /^[A-Z0-9][A-Z0-9_-]{1,79}$/i;
const noControlCharsRegex = /^[^\u0000-\u001F\u007F]+$/;

export const idSchema = z.string().trim().min(1, "Thiếu mã định danh.").max(120, "Mã định danh quá dài.");

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Họ tên phải có ít nhất 2 ký tự.")
  .max(120, "Họ tên không được vượt quá 120 ký tự.")
  .regex(noControlCharsRegex, "Họ tên chứa ký tự không hợp lệ.");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Email đăng nhập không hợp lệ.")
  .max(180, "Email không được vượt quá 180 ký tự.");

export const phoneSchema = z
  .string()
  .trim()
  .regex(vietnamPhoneRegex, "Số điện thoại không hợp lệ. Dùng dạng 0xxxxxxxxx hoặc +84xxxxxxxxx.");

export const passwordSchema = z
  .string()
  .min(12, "Mật khẩu phải có ít nhất 12 ký tự.")
  .max(128, "Mật khẩu không được vượt quá 128 ký tự.")
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), "Mật khẩu nên có cả chữ và số.");

export const loginPasswordSchema = z
  .string()
  .min(8, "Mật khẩu đăng nhập phải có ít nhất 8 ký tự.")
  .max(128, "Mật khẩu đăng nhập không được vượt quá 128 ký tự.");

export const companySchema = z
  .string()
  .trim()
  .min(2, "Tên tổ chức phải có ít nhất 2 ký tự.")
  .max(160, "Tên tổ chức không được vượt quá 160 ký tự.")
  .regex(noControlCharsRegex, "Tên tổ chức chứa ký tự không hợp lệ.");

export const optionalCompanySchema = companySchema.optional().or(z.literal(""));

export const categoryNameSchema = z
  .string()
  .trim()
  .min(2, "Tên danh mục phải có ít nhất 2 ký tự.")
  .max(80, "Tên danh mục không được vượt quá 80 ký tự.")
  .regex(noControlCharsRegex, "Tên danh mục chứa ký tự không hợp lệ.");

export const productCodeSchema = z
  .string()
  .trim()
  .min(2, "Mã sản phẩm phải có ít nhất 2 ký tự.")
  .max(40, "Mã sản phẩm không được vượt quá 40 ký tự.")
  .regex(safeCodeRegex, "Mã sản phẩm chỉ nên gồm chữ, số, gạch ngang hoặc gạch dưới.");

export const skuSchema = z
  .string()
  .trim()
  .min(2, "SKU phải có ít nhất 2 ký tự.")
  .max(80, "SKU không được vượt quá 80 ký tự.")
  .regex(safeSkuRegex, "SKU chỉ nên gồm chữ, số, gạch ngang hoặc gạch dưới.");

export const shortTextSchema = (label: string, min = 1, max = 180) =>
  z
    .string()
    .trim()
    .min(min, `${label} phải có ít nhất ${min} ký tự.`)
    .max(max, `${label} không được vượt quá ${max} ký tự.`)
    .regex(noControlCharsRegex, `${label} chứa ký tự không hợp lệ.`);

export const optionalUrlSchema = z
  .string()
  .trim()
  .max(1000, "Đường dẫn không được vượt quá 1000 ký tự.")
  .refine((value) => {
    if (!value) return true;
    if (value.startsWith("/")) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:";
    } catch {
      return false;
    }
  }, "Đường dẫn phải là URL HTTPS hợp lệ hoặc đường dẫn nội bộ bắt đầu bằng /.");

export const positiveIntegerSchema = (label: string, max = 1_000_000) =>
  z
    .number({ invalid_type_error: `${label} phải là số.` })
    .int(`${label} phải là số nguyên.`)
    .positive(`${label} phải lớn hơn 0.`)
    .max(max, `${label} vượt quá giới hạn cho phép.`);

export const nonNegativeIntegerSchema = (label: string, max = 1_000_000_000) =>
  z
    .number({ invalid_type_error: `${label} phải là số.` })
    .int(`${label} phải là số nguyên.`)
    .nonnegative(`${label} không được âm.`)
    .max(max, `${label} vượt quá giới hạn cho phép.`);

export const vndAmountSchema = (label: string, max = 10_000_000_000) =>
  z
    .number({ invalid_type_error: `${label} phải là số tiền VND.` })
    .int(`${label} phải là số nguyên VND.`)
    .nonnegative(`${label} không được âm.`)
    .max(max, `${label} vượt quá giới hạn cho phép.`);

export const rateSchema = (label: string) =>
  z
    .number({ invalid_type_error: `${label} phải là số.` })
    .min(0, `${label} không được âm.`)
    .max(1, `${label} không được vượt quá 100%.`);

export const supplierSchema = z.object({
  id: idSchema.optional(),
  code: productCodeSchema,
  name: shortTextSchema("Tên nhà cung cấp", 2, 160),
  leadTimeDays: positiveIntegerSchema("Thời gian xử lý", 365),
  adminOnly: z.boolean()
});

export const productVariantSchema = z.object({
  id: idSchema.optional(),
  sku: skuSchema,
  label: shortTextSchema("Tên phân loại", 1, 120),
  barcode: z.string().trim().max(80, "Barcode không được vượt quá 80 ký tự.").optional().or(z.literal("")),
  wholesalePrice: vndAmountSchema("Giá sỉ", 10_000_000_000),
  minOrderQty: positiveIntegerSchema("Số lượng tối thiểu", 100_000),
  stock: nonNegativeIntegerSchema("Tồn kho", 1_000_000),
  supplierId: idSchema
});

export const productSchema = z.object({
  id: idSchema.optional(),
  code: productCodeSchema,
  name: shortTextSchema("Tên sản phẩm", 2, 180),
  category: categoryNameSchema,
  brand: shortTextSchema("Thương hiệu", 1, 120),
  imageUrl: optionalUrlSchema.default(""),
  images: z.array(optionalUrlSchema).max(12, "Mỗi sản phẩm tối đa 12 ảnh.").optional(),
  dimensions: z.string().trim().max(120, "Kích thước không được vượt quá 120 ký tự.").optional().or(z.literal("")),
  weight: z.number().nonnegative("Khối lượng không được âm.").max(100000, "Khối lượng vượt quá giới hạn.").optional(),
  description: z.string().trim().max(2000, "Mô tả không được vượt quá 2000 ký tự.").optional().or(z.literal("")),
  tags: z.array(shortTextSchema("Tag", 1, 40)).max(20, "Tối đa 20 tag."),
  variants: z.array(productVariantSchema).min(1, "Sản phẩm phải có ít nhất 1 phân loại.").max(100, "Tối đa 100 phân loại.")
});

export const promotionsPolicySchema = z.object({
  freeShippingThreshold: vndAmountSchema("Ngưỡng freeship"),
  defaultDepositRate: rateSchema("Tỷ lệ cọc mặc định"),
  maxOperatorDiscountRate: rateSchema("Tỷ lệ chiết khấu tối đa"),
  requireManagerApprovalAbove: vndAmountSchema("Ngưỡng cần duyệt quản lý"),
  giftThreshold: vndAmountSchema("Ngưỡng tặng quà").optional(),
  giftName: z.string().trim().max(160, "Tên quà tặng không được vượt quá 160 ký tự.").optional()
});

export const recipientSchema = z.object({
  recipientName: fullNameSchema,
  recipientPhone: phoneSchema,
  recipientAddress: shortTextSchema("Địa chỉ giao hàng", 6, 500)
});

export const getValidationErrorMessage = (error: unknown, fallback = "Dữ liệu nhập không hợp lệ."): string => {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? fallback;
  }
  if (error instanceof Error && error.message && !error.message.trim().startsWith("[")) {
    return error.message;
  }
  return fallback;
};

export const parseOrThrowMessage = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(getValidationErrorMessage(parsed.error));
  }
  return parsed.data;
};
