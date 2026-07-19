/**
 * GET /api/beeper-crm/events
 *
 * Server-Sent Events stream: emits `data: update` whenever the Beeper CRM
 * database changes, so the dashboard can refetch instead of polling on a
 * fixed timer. Backed by dba's subscribeToBeeperChanges(), which uses a
 * MongoDB change stream when available and falls back to a 5s poll on a
 * standalone (non-replica-set) MongoDB — see documentation/beeper/architecture.md.
 */
import { subscribeToBeeperChanges, runWithRepoContext } from "dba";
import { getCurrentUserFromCookies } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return new Response("NOT_AUTHENTICATED", { status: 401 });
  }

  let unsubscribe: (() => void) | null = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  // ReadableStream's start() runs synchronously during construction, so
  // constructing it inside runWithRepoContext(...) is what lets
  // subscribeToBeeperChanges() (called from within start(), before its
  // first await) resolve getCurrentRepoGuid() correctly — it only needs
  // the repo context once, at this setup call, to pick which user's
  // database to watch.
  const stream = await runWithRepoContext(user, async () => {
    return new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = () => {
          try {
            controller.enqueue(encoder.encode("data: update\n\n"));
          } catch {
            // stream already closed
          }
        };

        unsubscribe = await subscribeToBeeperChanges(send);
        keepAlive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(":\n\n"));
          } catch {
            // stream already closed
          }
        }, 15000);
      },
      cancel() {
        unsubscribe?.();
        if (keepAlive) clearInterval(keepAlive);
      },
    });
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
