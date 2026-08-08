import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { suppliers, updateDemoSuppliers } from "@/lib/mock-data";
import type { Supplier } from "@/lib/domain";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  return NextResponse.json({ suppliers });
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
    const updated = [...suppliers, supplier];
    updateDemoSuppliers(updated);
    return NextResponse.json({ success: true, supplier });
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
    const supplier: Supplier = await req.json();
    const updated = suppliers.map((s) => (s.id === supplier.id ? supplier : s));
    updateDemoSuppliers(updated);
    return NextResponse.json({ success: true, supplier });
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
    if (!id) return NextResponse.json({ error: "Thiếu ID nhà cung cấp." }, { status: 400 });

    const updated = suppliers.filter((s) => s.id !== id);
    updateDemoSuppliers(updated);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
}
