import { NextResponse } from "next/server";
import { getSessionUser, requirePermission, requireSameOrigin } from "@/server/auth";
import { deleteProduct, getProducts, saveProduct } from "@/server/db";
import { getValidationErrorMessage, idSchema, productSchema } from "@/lib/validation";
import type { Product } from "@/lib/domain";
import {
  catalogResponseCacheControl,
  sanitizeLegacyCatalogImages
} from "@/lib/cache/catalog-access";

export const runtime = "nodejs";

function sanitizeProductsForResponse(products: Product[], role: "guest" | "customer" | "admin") {
  if (role === "admin") return products;

  return products.map((product) => ({
    ...product,
    variants: product.variants.map((variant) => {
      const copy = { ...variant };
      delete copy.supplierId;
      if (role === "guest") {
        delete copy.wholesalePrice;
      }
      return copy;
    })
  }));
}

export async function GET() {
  const user = await getSessionUser();

  let role: "guest" | "customer" | "admin" = "guest";
  if (user?.isAdmin) {
    role = "admin";
  } else if (user) {
    role = "customer";
  }

  const data = sanitizeLegacyCatalogImages(
    sanitizeProductsForResponse(await getProducts(role), role)
  );
  return NextResponse.json(
    { products: data, role },
    {
      headers: {
        "Cache-Control": catalogResponseCacheControl(role),
        Vary: "Cookie"
      }
    }
  );
}

export async function POST(req: Request) {
  try {
    requireSameOrigin(req);
    await requirePermission("catalog.write");
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  try {
    const parsed = productSchema.parse(await req.json());
    const product: Product = {
      ...parsed,
      id: parsed.id || `prod_${Date.now()}`,
      imageUrl: parsed.imageUrl || "/product-food.svg",
      tags: parsed.tags ?? [],
      variants: parsed.variants.map((variant, index) => ({
        ...variant,
        id: variant.id || `var_${Date.now()}_${index}`
      }))
    };
    await saveProduct(product);
    return NextResponse.json({ success: true, product });
  } catch (error) {
    if (error instanceof Response) return error;
    const msg = getValidationErrorMessage(error, "Dữ liệu sản phẩm không hợp lệ.");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    requireSameOrigin(req);
    await requirePermission("catalog.write");
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  try {
    const product = productSchema.required({ id: true }).parse(await req.json()) as Product;
    await saveProduct(product);
    return NextResponse.json({ success: true, product });
  } catch (error) {
    if (error instanceof Response) return error;
    const msg = getValidationErrorMessage(error, "Dữ liệu sản phẩm không hợp lệ.");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    requireSameOrigin(req);
    await requirePermission("catalog.write");
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = idSchema.parse(searchParams.get("id"));
    await deleteProduct(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) return error;
    const msg = getValidationErrorMessage(error, "Thiếu hoặc sai ID sản phẩm.");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
