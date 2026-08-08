import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { getSuppliers, saveSupplier, deleteSupplier } from "@/server/db";
import type { Supplier } from "@/lib/domain";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  const list = await getSuppliers();
  return NextResponse.json({ suppliers: list });
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  try {
    const supplier: Supplier = await req.json();
    if (!supplier.id) supplier.id = `sup_${Date.now()}`;
    await saveSupplier(supplier);
    return NextResponse.json({ success: true, supplier });
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
    const supplier: Supplier = await req.json();
    await saveSupplier(supplier);
    return NextResponse.json({ success: true, supplier });
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
    if (!id) return NextResponse.json({ error: "Thiếu ID nhà cung cấp." }, { status: 400 });

    await deleteSupplier(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Dữ liệu không hợp lệ.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
