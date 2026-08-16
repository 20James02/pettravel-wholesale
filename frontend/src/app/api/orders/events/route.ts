import { requireAuth } from "@/server/auth";
import { getOrders } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 20_000;
const STREAM_LIFETIME_MS = 60_000;

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch (response) {
    if (response instanceof Response) return response;
    throw response;
  }

  const encoder = new TextEncoder();
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let polling = false;
  let lastRevision = "";

  const clearTimers = () => {
    if (pollTimer) clearInterval(pollTimer);
    if (closeTimer) clearTimeout(closeTimer);
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const poll = async () => {
        if (closed || polling) return;
        polling = true;
        try {
          const orders = await getOrders(user);
          const revision = orders
            .map((order) => `${order.id}:${order.updatedAt}`)
            .sort()
            .join("|");
          if (revision !== lastRevision) {
            lastRevision = revision;
            controller.enqueue(
              encoder.encode(
                `event: orders.snapshot\ndata: ${JSON.stringify({
                  type: "orders.snapshot",
                  revision
                })}\n\n`
              )
            );
          } else {
            controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
          }
        } catch {
          controller.enqueue(
            encoder.encode(
              `event: orders.error\ndata: ${JSON.stringify({
                type: "orders.error",
                message: "Không thể tải bản cập nhật đơn hàng."
              })}\n\n`
            )
          );
        } finally {
          polling = false;
        }
      };

      await poll();
      pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
      closeTimer = setTimeout(() => {
        if (closed) return;
        closed = true;
        clearTimers();
        controller.close();
      }, STREAM_LIFETIME_MS);
    },
    cancel() {
      closed = true;
      clearTimers();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
