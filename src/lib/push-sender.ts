import webpush from 'web-push';
import { db } from '@/lib/db';

// Configure VAPID
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@qrdomotik.roomscan.pro';

let configured = false;

function ensureConfigured() {
  if (configured) return;
  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error('VAPID keys not configured');
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, string>;
  actions?: Array<{ action: string; title: string }>; 
}

/**
 * Send a push notification to all active subscriptions of a user.
 * Returns the number of successful sends.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number; cleaned: number }> {
  ensureConfigured();

  const subscriptions = await db.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, cleaned: 0 };
  }

  let sent = 0;
  let failed = 0;
  let cleaned = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dhKey,
            auth: sub.authKey,
          },
        },
        JSON.stringify(payload),
        {
          vapidDetails: {
            subject: vapidSubject,
            publicKey: vapidPublicKey!,
            privateKey: vapidPrivateKey!,
          },
          TTL: 60,
        }
      );
      sent++;
    } catch (err: unknown) {
      const error = err as { statusCode?: number };
      // 404 or 410 = subscription expired/deleted, clean it up
      if (error.statusCode === 404 || error.statusCode === 410) {
        await db.pushSubscription.delete({ where: { id: sub.id } });
        cleaned++;
      }
      failed++;
    }
  }

  return { sent, failed, cleaned };
}

/**
 * Send a push notification to all owners/members of a home.
 */
export async function sendPushToHome(
  homeId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number; cleaned: number }> {
  const members = await db.homeMember.findMany({
    where: { homeId },
    select: { userId: true },
  });

  // Also get the owner
  const home = await db.home.findUnique({
    where: { id: homeId },
    select: { ownerId: true },
  });

  const userIds = new Set(members.map(m => m.userId));
  if (home) userIds.add(home.ownerId);

  let totalSent = 0;
  let totalFailed = 0;
  let totalCleaned = 0;

  for (const userId of userIds) {
    const result = await sendPushToUser(userId, payload);
    totalSent += result.sent;
    totalFailed += result.failed;
    totalCleaned += result.cleaned;
  }

  return { sent: totalSent, failed: totalFailed, cleaned: totalCleaned };
}
