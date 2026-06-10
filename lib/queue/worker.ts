import { claimBatch, markFailed, markSent } from "./outbox";

export interface DrainResult {
  claimed: number;
  sent: number;
  retry: number;
  dead: number;
}

/**
 * Drain due outbox rows: claim a batch, POST each to the channel /send, then
 * markSent / markFailed. Shared by the /api/internal/worker route (cron + the
 * authed kick) and the campaign send route (via waitUntil), so the drain logic
 * lives in one place and never relies on a self-HTTP hop.
 */
export async function drainOutbox(): Promise<DrainResult> {
  const channelUrl = process.env.CHANNEL_URL;
  const baseUrl = process.env.CRM_PUBLIC_URL;
  const secret = process.env.WORKER_SECRET;
  if (!channelUrl || !baseUrl || !secret) {
    throw new Error("CHANNEL_URL, CRM_PUBLIC_URL and WORKER_SECRET must be set");
  }
  const callbackUrl = `${baseUrl.replace(/\/$/, "")}/api/receipts`;
  const sendUrl = `${channelUrl.replace(/\/$/, "")}/send`;

  const claimed = await claimBatch(25);
  let sent = 0;
  let retry = 0;
  let dead = 0;

  for (const c of claimed) {
    try {
      const res = await fetch(sendUrl, {
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

  return { claimed: claimed.length, sent, retry, dead };
}
