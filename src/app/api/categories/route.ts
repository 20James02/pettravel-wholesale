import { NextResponse } from "next/server";
import { getSessionUser, requireAdmin } from "@/server/auth";
import { getCategories, saveCategories } from "@/server/db";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const list = await getCategories();
  return NextResponse.json({ categories: list });
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
    const currentList = await getCategories();
    if (currentList.includes(category)) {
      return NextResponse.json({ error: "Danh mục đã tồn tại." }, { status: 400 });
    }
    const updated = [...currentList, category];
    await saveCategories(updated);
    return NextResponse.json({ success: true, categories: updated });
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
    const { oldCategory, newCategory } = await req.json();
    if (!oldCategory || !newCategory) {
      return NextResponse.json({ error: "Tên danh mục không hợp lệ." }, { status: 400 });
    }
    const currentList = await getCategories();
    const updated = currentList.map((cat) => (cat === oldCategory ? newCategory : cat));
    await saveCategories(updated);
    return NextResponse.json({ success: true, categories: updated });
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
    const category = searchParams.get("category");
    if (!category) return NextResponse.json({ error: "Thiếu tên danh mục." }, { status: 400 });

    const currentList = await getCategories();
    const updated = currentList.filter((cat) => cat !== category);
    await saveCategories(updated);
    return NextResponse.json({ success: true, categories: updated });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Dữ liệu không hợp lệ.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
