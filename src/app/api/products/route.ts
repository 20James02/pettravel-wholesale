import { NextResponse } from "next/server";
import { getSessionUser, requireAdmin } from "@/server/auth";
import { products, sanitizeProductsForRole, updateDemoProducts } from "@/lib/mock-data";
import type { Product } from "@/lib/domain";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();

  let role: "guest" | "customer" | "admin" = "guest";
  if (user?.isAdmin) {
    role = "admin";
  } else if (user) {
    role = "customer";
  }

  const data = sanitizeProductsForRole(products, role);
  return NextResponse.json({ products: data, role });
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  try {
    const product: Product = await req.json();
    if (!product.id) product.id = `prod_${Date.now()}`;
    const updated = [product, ...products];
    updateDemoProducts(updated);
    return NextResponse.json({ success: true, product });
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdmin();
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  try {
    const product: Product = await req.json();
    const updated = products.map((p) => (p.id === product.id ? product : p));
    updateDemoProducts(updated);
    return NextResponse.json({ success: true, product });
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdmin();
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  try {
    const { url } = req;
    const { searchParams } = new URL(url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Thiếu ID sản phẩm." }, { status: 400 });

    const updated = products.filter((p) => p.id !== id);
    updateDemoProducts(updated);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
}
