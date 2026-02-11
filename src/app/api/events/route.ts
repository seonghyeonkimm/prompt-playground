import { ensureInitialized } from "@/lib/init";
import { addEventListener } from "@/lib/watcher";

export const dynamic = "force-dynamic";

// GET /api/events — Server-Sent Events for real-time updates
export async function GET() {
  ensureInitialized();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat
      controller.enqueue(encoder.encode("event: connected\ndata: {}\n\n"));

      // Listen for sync events
      const removeListener = addEventListener((event) => {
        const data = JSON.stringify(event);
        controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${data}\n\n`));
      });

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
          removeListener();
        }
      }, 30000);

      // Cleanup when client disconnects
      const cleanup = () => {
        clearInterval(heartbeat);
        removeListener();
      };

      // The stream will be cancelled when the client disconnects
      controller.enqueue(encoder.encode(""));
      void new Promise<void>((resolve) => {
        const checkClosed = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(""));
          } catch {
            clearInterval(checkClosed);
            cleanup();
            resolve();
          }
        }, 5000);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
