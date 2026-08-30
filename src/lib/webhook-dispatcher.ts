import { db } from '@/lib/db';
import { createHmac } from 'crypto';

interface WebhookPayload {
  event: string;
  timestamp: string;
  homeId: string;
  data: Record<string, unknown>;
}

/**
 * Dispatch webhooks for a given home and event.
 * Fetches all active webhooks for the home, filters by event match,
 * signs payloads with HMAC-SHA256, and sends POST to each URL.
 * Updates success/fail counts and lastTriggerAt.
 *
 * This is a fire-and-forget utility — errors are logged but not thrown.
 */
export async function dispatchWebhooks(
  homeId: string,
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const webhooks = await db.webhook.findMany({
      where: { homeId, isActive: true },
    });

    if (webhooks.length === 0) return;

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      homeId,
      data,
    };

    const payloadStr = JSON.stringify(payload);

    // Dispatch each webhook in parallel
    const promises = webhooks.map(async (webhook) => {
      // Check if this webhook listens for this event
      let subscribedEvents: string[];
      try {
        subscribedEvents = JSON.parse(webhook.events || '[]');
      } catch {
        subscribedEvents = [];
      }

      if (!subscribedEvents.includes(event)) return;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-QRDomotik-Event': event,
      };

      // Sign with HMAC-SHA256 if secret is set
      if (webhook.secret) {
        const signature = createHmac('sha256', webhook.secret)
          .update(payloadStr)
          .digest('hex');
        headers['X-QRDomotik-Signature'] = `sha256=${signature}`;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: payloadStr,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.ok) {
          await db.webhook.update({
            where: { id: webhook.id },
            data: {
              successCount: { increment: 1 },
              lastTriggerAt: new Date(),
            },
          });
        } else {
          await db.webhook.update({
            where: { id: webhook.id },
            data: {
              failCount: { increment: 1 },
              lastTriggerAt: new Date(),
            },
          });
        }
      } catch {
        await db.webhook.update({
          where: { id: webhook.id },
          data: {
            failCount: { increment: 1 },
            lastTriggerAt: new Date(),
          },
        });
      }
    });

    await Promise.allSettled(promises);
  } catch (error) {
    console.error('[webhook-dispatcher] Error:', error);
  }
}
