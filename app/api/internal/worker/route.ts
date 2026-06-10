import { NextResponse } from "next/server";
import { claimBatch, markFailed, markSent } from "@/lib/queue/outbox";

export const dynamic = "force-dynamic";
// Allow a generous window — a batch of channel POSTs can take a few seconds.
export const maxDuration = 30;

/**
 * Outbox drainer. Invoked two ways:
 *   1. Vercel Cron (GET, every minute) — see vercel.json.
 *   2. A kick right after POST /campaigns/:id/send (POST) for snappy demos.
 *
 * Shared-secret guarded: accepts `Authorization: Bearer <WORKER_SECRET>`
 * (Vercel Cron form) OR `x-worker-secret: <WORKER_SECRET>` (the internal kick).
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

  const channelUrl = process.env.CHANNEL_URL;
  const baseUrl = process.env.CRM_PUBLIC_URL;
  if (!channelUrl || !baseUrl) {
    return NextResponse.json(
      { error: "CHANNEL_URL and CRM_PUBLIC_URL must be set" },
      { status: 500 },
    );
  }
  const callbackUrl = `${baseUrl.replace(/\/$/, "")}/api/receipts`;

  const claimed = await claimBatch(25);
  let sent = 0;
  let retry = 0;
  let dead = 0;

  for (const c of claimed) {
    try {
      const res = await fetch(`${channelUrl.replace(/\/$/, "")}/send`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-worker-secret": secret },
        body: JSON.stringify({
          comm_id: c.communicationId,
          recipient: c.recipient,
          message: c.message,
          channel: c.channel,
          callback_url: callbackUrl,
        }),
      });
      if (res.status === 202 || res.ok) {
        await markSent(c.outboxId);
        sent++;
      } else {
        throw new Error(`channel responded ${res.status}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const { dead: isDead } = await markFailed(c, msg);
      if (isDead) dead++;
      else retry++;
    }
  }

  return NextResponse.json({ claimed: claimed.length, sent, retry, dead });
}

export const GET = drain;
export const POST = drain;
