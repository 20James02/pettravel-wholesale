import { NextResponse } from "next/server";

export async function GET() {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  
  try {
    const res = await fetch(backendUrl, {
      method: "GET",
      cache: "no-store", // Bắt buộc no-store để tránh Next.js cache tĩnh kết quả fetch
      headers: {
        "User-Agent": "Vercel-KeepAlive-Cron"
      }
    });
    
    if (!res.ok) {
      return NextResponse.json(
        { status: "error", message: `Backend returned status ${res.status}` },
        { status: 502 }
      );
    }
    
    const data = await res.json();
    return NextResponse.json({
      status: "success",
      message: "Backend keep-alive ping successful.",
      backendResponse: data
    });
    
  } catch (err: any) {
    return NextResponse.json(
      { status: "error", message: err.message || "Failed to connect to backend" },
      { status: 500 }
    );
  }
}
