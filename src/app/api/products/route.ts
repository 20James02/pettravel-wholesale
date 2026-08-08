import { NextResponse } from "next/server";
import { getSessionUser, requireAdmin } from "@/server/auth";
import { getProducts, saveProduct, deleteProduct } from "@/server/db";
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

  const data = await getProducts(role);
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
    await saveProduct(product);
    return NextResponse.json({ success: true, product });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Dữ liệu không hợp lệ.";
    return NextResponse.json({ error: msg }, { status: 400 });
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
    await saveProduct(product);
    return NextResponse.json({ success: true, product });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Dữ liệu không hợp lệ.";
    return NextResponse.json({ error: msg }, { status: 400 });
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

    await deleteProduct(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Dữ liệu không hợp lệ.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
