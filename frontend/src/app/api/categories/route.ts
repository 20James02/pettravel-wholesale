import { NextResponse } from "next/server";
import { requirePermission, requireSameOrigin } from "@/server/auth";
import { getCategories, saveCategories } from "@/server/db";
import { categoryNameSchema, getValidationErrorMessage } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  const list = await getCategories();
  return NextResponse.json({ categories: list });
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
    const body = await req.json();
    const rawCategory = body.category || body.name;
    const category = categoryNameSchema.parse(rawCategory);
    const currentList = await getCategories();

    if (currentList.some((item) => item.toLowerCase() === category.toLowerCase())) {
      return NextResponse.json({ error: "Danh mục đã tồn tại." }, { status: 400 });
    }

    const updated = [...currentList, category];
    await saveCategories(updated);
    return NextResponse.json({ success: true, categories: updated });
  } catch (error) {
    if (error instanceof Response) return error;
    const msg = getValidationErrorMessage(error, "Tên danh mục không hợp lệ.");
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
    const body = await req.json();
    const rawOld = body.oldCategory || body.oldName;
    const rawNew = body.newCategory || body.newName;
    const oldCategory = categoryNameSchema.parse(rawOld);
    const newCategory = categoryNameSchema.parse(rawNew);
    const currentList = await getCategories();

    if (!currentList.includes(oldCategory)) {
      return NextResponse.json({ error: "Danh mục cần sửa không tồn tại." }, { status: 404 });
    }
    if (oldCategory.toLowerCase() !== newCategory.toLowerCase() && currentList.some((cat) => cat.toLowerCase() === newCategory.toLowerCase())) {
      return NextResponse.json({ error: "Tên danh mục mới đã tồn tại." }, { status: 400 });
    }

    const updated = currentList.map((cat) => (cat === oldCategory ? newCategory : cat));
    await saveCategories(updated);
    return NextResponse.json({ success: true, categories: updated });
  } catch (error) {
    if (error instanceof Response) return error;
    const msg = getValidationErrorMessage(error, "Tên danh mục không hợp lệ.");
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
    const rawCategory = searchParams.get("category") || searchParams.get("name");
    const category = categoryNameSchema.parse(rawCategory);
    const currentList = await getCategories();
    const updated = currentList.filter((cat) => cat !== category);
    await saveCategories(updated);
    return NextResponse.json({ success: true, categories: updated });
  } catch (error) {
    if (error instanceof Response) return error;
    const msg = getValidationErrorMessage(error, "Thiếu hoặc sai tên danh mục.");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
