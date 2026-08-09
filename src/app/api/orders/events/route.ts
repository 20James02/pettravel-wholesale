import { requireAuth } from "@/server/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAuth();
  } catch (resp) {
    if (resp instanceof Response) return resp;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const event = {
        type: "order.updated",
        orderNumber: "PTW-260808-001",
        message: "Don hang dang o phong Admin, san sang nhan cap nhat realtime."
      };

      controller.enqueue(encoder.encode(`event: order.updated\ndata: ${JSON.stringify(event)}\n\n`));
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
