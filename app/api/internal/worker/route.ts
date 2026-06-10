import { NextResponse } from "next/server";
import { drainOutbox } from "@/lib/queue/worker";

export const dynamic = "force-dynamic";
// Allow a generous window — a batch of channel POSTs can take a few seconds.
export const maxDuration = 60;

/**
 * Outbox drainer. Invoked two ways:
 *   1. Vercel Cron (GET, daily backstop) — see vercel.json.
 *   2. An authed kick (POST) — fallback path.
 *
 * The primary drain trigger is the campaign send route itself (via waitUntil),
 * so this route is a safety net. Shared-secret guarded: accepts
 * `Authorization: Bearer <WORKER_SECRET>` (Vercel Cron form) OR
 * `x-worker-secret: <WORKER_SECRET>`.
 */
async function drain(req: Request): Promise<Response> {
  const secret = process.env.WORKER_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "WORKER_SECRET not configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const header = req.headers.get("x-worker-secret");
  if (bearer !== secret && header !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await drainOutbox();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = drain;
export const POST = drain;
