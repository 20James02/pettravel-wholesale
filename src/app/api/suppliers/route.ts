import { NextResponse } from "next/server";
import { requirePermission, requireSameOrigin } from "@/server/auth";
import { deleteSupplier, getSuppliers, saveSupplier } from "@/server/db";
import { getValidationErrorMessage, idSchema, supplierSchema } from "@/lib/validation";
import type { Supplier } from "@/lib/domain";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requirePermission("supplier.read");
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  const list = await getSuppliers();
  return NextResponse.json({ suppliers: list });
}

export async function POST(req: Request) {
  try {
    requireSameOrigin(req);
    await requirePermission("supplier.write");
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  try {
    const parsed = supplierSchema.parse(await req.json());
    const supplier: Supplier = {
      ...parsed,
      id: parsed.id || `sup_${Date.now()}`
    };
    await saveSupplier(supplier);
    return NextResponse.json({ success: true, supplier });
  } catch (error) {
    const msg = getValidationErrorMessage(error, "Dữ liệu nhà cung cấp không hợp lệ.");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    requireSameOrigin(req);
    await requirePermission("supplier.write");
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  try {
    const supplier = supplierSchema.required({ id: true }).parse(await req.json()) as Supplier;
    await saveSupplier(supplier);
    return NextResponse.json({ success: true, supplier });
  } catch (error) {
    const msg = getValidationErrorMessage(error, "Dữ liệu nhà cung cấp không hợp lệ.");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    requireSameOrigin(req);
    await requirePermission("supplier.write");
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = idSchema.parse(searchParams.get("id"));
    await deleteSupplier(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = getValidationErrorMessage(error, "Thiếu hoặc sai ID nhà cung cấp.");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
