import { NextResponse } from "next/server";
import { getSessionUser, requireAdmin } from "@/server/auth";
import { categories, updateDemoCategories } from "@/lib/mock-data";

export const runtime = "nodejs";

export async function GET() {
  // Let both customer and admin read the list of product categories
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  return NextResponse.json({ categories });
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  try {
    const { category } = await req.json();
    if (!category || typeof category !== "string") {
      return NextResponse.json({ error: "Tên danh mục không hợp lệ." }, { status: 400 });
    }
    if (categories.includes(category)) {
      return NextResponse.json({ error: "Danh mục đã tồn tại." }, { status: 400 });
    }
    const updated = [...categories, category];
    updateDemoCategories(updated);
    return NextResponse.json({ success: true, categories: updated });
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
    const { oldCategory, newCategory } = await req.json();
    if (!oldCategory || !newCategory) {
      return NextResponse.json({ error: "Tên danh mục không hợp lệ." }, { status: 400 });
    }
    const updated = categories.map((cat) => (cat === oldCategory ? newCategory : cat));
    updateDemoCategories(updated);
    return NextResponse.json({ success: true, categories: updated });
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
    const category = searchParams.get("category");
    if (!category) return NextResponse.json({ error: "Thiếu tên danh mục." }, { status: 400 });

    const updated = categories.filter((cat) => cat !== category);
    updateDemoCategories(updated);
    return NextResponse.json({ success: true, categories: updated });
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
}
