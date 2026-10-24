// =============================================================
// SERVICE DE NOTIFICATIONS UNIFIÉ — PREMIUM V5 (ÉTAPE 3.1)
// SERVER ONLY — ne JAMAIS importer côté client.
//
// Point d'entrée unique pour tous les messages sortants du système :
//   ┌─────────────┬──────────────────────────────────────────────┐
//   │ Canal       │ Implémentation                               │
//   ├─────────────┼──────────────────────────────────────────────┤
//   │ In-app      │ table Notification (cloche Dashboard)        │
//   │ Email       │ queueEmail() → outbox (SMTP — v4.95)         │
//   │ Push        │ web-push VAPID (sendPushToUser)              │
//   │ SMS         │ Twilio REST (sendSms — env-gated fail-closed)│
//   │ WhatsApp    │ Twilio REST (prefix « whatsapp: » — gated)   │
//   └─────────────┴──────────────────────────────────────────────┘
//
// sendNotification(userId, type, payload) :
//   1. crée la notification in-app (toujours — journal + cloche) ;
//   2. route email/push selon les PRÉFÉRENCES de l'utilisateur
//      (notificationPrefs JSON + catalogue notification-prefs.ts) ;
//   3. `force: true` (alertes critiques — avis négatif) court-circuite
//      les préférences ;
//   4. email optionnel sur mesure (email{subject,html,text}) sinon
//      template générique host_notification.
//
// v4.58 — EXPÉDITEUR SYSTÈME (clarification client) : l'email de
// notification est TOUJOURS expédié par la boîte système de la
// plateforme (notifications@… par défaut) vers le mail du compte
// concerné — l'hôte n'a jamais à configurer son propre email.
// In-app et push restent inchangés (cloche + push du compte).
//
// GARANTIES (même contrat que automations-server.ts) :
//  - fire-and-forget : sendNotification ne lève JAMAIS — un canal
//    en échec (email down, VAPID absent…) ne casse jamais le flux
//    métier appelant (paiement, feedback, scan…) ;
//  - chaque canal renvoyé dans `channels` est tracé console.
// =============================================================
import { db } from '@/lib/db';
import { queueEmail } from '@/lib/email';
import { renderHostNotificationEmail } from '@/lib/email-template-render';
import { sendPushToUser } from '@/lib/push-sender';
import { sendSms, smsConfigured } from '@/lib/sms';
import {
  effectivePrefs,
  type NotificationPrefsMap,
} from '@/lib/notification-prefs';

// -------------------------------------------------------------
// Types publics
// -------------------------------------------------------------

/** Clé d'événement du catalogue (notification-prefs.ts) ou clé libre. */
export type NotificationEventType =
  | 'guest_feedback_alert' // 🚨 avis négatif privé (critique)
  | 'guest_arrival'        // 👋 premier scan du Hub
  | 'late_checkout_paid'   // ⏱️ départ tardif réglé (Stripe)
  | 'host_review_shield'   // ⭐ récap demande d'avis au départ
  | 'voice_message'        // 🎙️ vocal invité du Hub (WP-BACK v4.61, hub_alert)
  | 'complaint_created'    // 📝 problème signalé (v4.46, hub_alert)
  | 'minibar_order'        // 🍷 commande minibar (v4.46, hub_alert)
  | 'minibar_restock'      // 🧊 recharge minibar demandée (v4.50)
  | 'special_request'      // 🛎️ demande particulière du Hub (lit bébé…)
  | string;                // types legacy (guest_feedback, host_*…)

export interface UnifiedNotificationPayload {
  /** Titre court (cloche + push + objet email si email non fourni). */
  title: string;
  /** Corps du message (cloche + push + texte email générique). */
  body: string;
  /** Deep-link relatif ouvert depuis la cloche / le push. */
  url?: string;
  /** Bien concerné (journalisation + propriété de l'email). */
  propertyId?: string;
  propertyName?: string;
  /** Email transactionnel sur mesure (sinon template générique). */
  email?: { subject: string; html: string; text?: string };
  /** Force email + push SANS lire les préférences (alertes critiques). */
  force?: boolean;
  /**
   * v5.20 — Clé du CATALOGUE de préférences (notification-prefs.ts)
   * utilisée pour filtrer email/push, DISTINCTE du type in-app ci-dessus.
   * Utile quand le type historique (ex. 'host_checkin') ne correspond pas
   * à une clé du catalogue (ex. prefs 'checkin_today') : la cloche garde
   * son icône, l'hôte garde le contrôle de ses canaux.
   * Absent → la clé de prefs = le type lui-même (comportement historique).
   */
  prefKey?: string;
  /** Métadonnées libres persistées dans dataJson. */
  meta?: Record<string, unknown>;
}

export interface UnifiedNotificationResult {
  ok: boolean;
  /** Canaux réellement déclenchés avec succès. */
  channels: Array<'inapp' | 'email' | 'push'>;
  notificationId: string | null;
}

// -------------------------------------------------------------
// Lecture des préférences (jamais bloquant)
// -------------------------------------------------------------

async function userPrefs(userId: string): Promise<NotificationPrefsMap | null> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { notificationPrefs: true },
    });
    if (!user) return null;
    return (user.notificationPrefs ?? null) as NotificationPrefsMap | null;
  } catch {
    return null;
  }
}

function prefsFor(
  prefs: NotificationPrefsMap | null,
  type: string,
): { email: boolean; push: boolean } {
  const effective = effectivePrefs(prefs);
  return effective[type] ?? { email: true, push: true };
}

// -------------------------------------------------------------
// API principale
// -------------------------------------------------------------

/**
 * Envoie une notification à UN utilisateur sur tous les canaux
 * pertinents. Ne lève JAMAIS (fire-and-forget, erreurs loguées).
 *
 * @param userId destinataire (hôte, manager, superadmin…)
 * @param type   clé d'événement (catalogue notification-prefs.ts)
 * @param payload titre / corps / url / email sur mesure / force
 */
export async function sendNotification(
  userId: string,
  type: NotificationEventType,
  payload: UnifiedNotificationPayload,
): Promise<UnifiedNotificationResult> {
  const channels: Array<'inapp' | 'email' | 'push'> = [];
  if (!userId || !payload?.title) {
    return { ok: false, channels, notificationId: null };
  }

  const dataJson = JSON.stringify({
    ...(payload.meta ?? {}),
    url: payload.url,
    propertyId: payload.propertyId,
    propertyName: payload.propertyName,
  });

  // ── 1. In-app (toujours) ──
  let notificationId: string | null = null;
  try {
    const created = await db.notification.create({
      data: {
        userId,
        type,
        title: payload.title,
        body: payload.body,
        dataJson,
      },
      select: { id: true },
    });
    notificationId = created.id;
    channels.push('inapp');
  } catch (error) {
    console.error('[notifications] inapp failed:', error);
  }

  // ── 2. Résolution des canaux selon les préférences ──
  let emailWanted = true;
  let pushWanted = true;
  if (!payload.force) {
    try {
      const prefs = await userPrefs(userId);
      // v5.20 — prefKey (clé catalogue) surcharge le type pour le filtre
      // des canaux ; le type in-app reste inchangé (icônes cloche).
      const p = prefsFor(prefs, payload.prefKey ?? type);
      emailWanted = p.email;
      pushWanted = p.push;
    } catch {
      // défaut : les deux canaux restent autorisés
    }
  }

  // ── 3. Email (sur mesure OU template générique) ──
  // v4.58 — expédié PAR la boîte système (expéditeur global, ex :
  // notifications@roomscan.pro) VERS le mail du compte destinataire,
  // selon ses préférences (`force` court-circuite).
  if (emailWanted) {
    try {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      if (user?.email) {
        if (payload.email) {
          await queueEmail({
            to: user.email,
            subject: payload.email.subject,
            html: payload.email.html,
            text: payload.email.text,
            template: 'custom',
            userId,
            propertyId: payload.propertyId ?? null,
            referenceType: 'notification',
            meta: { notificationType: type },
          });
        } else {
          const tpl = await renderHostNotificationEmail({
            title: payload.title,
            body: payload.body,
            propertyName: payload.propertyName ?? 'Votre bien',
            url: payload.url,
          });
          await queueEmail({
            to: user.email,
            subject: tpl.subject,
            html: tpl.html,
            text: tpl.text,
            template: 'host_notification',
            userId,
            propertyId: payload.propertyId ?? null,
            referenceType: 'notification',
            meta: { notificationType: type },
          });
        }
        channels.push('email');
      }
    } catch (error) {
      console.error('[notifications] email failed:', error);
    }
  }

  // ── 4. Push navigateur/PWA (web-push VAPID) ──
  if (pushWanted) {
    try {
      const res = await sendPushToUser(userId, {
        title: payload.title,
        body: payload.body,
        tag: type,
        data: {
          url: payload.url ?? '/airbnb/dashboard',
          ...(payload.propertyId ? { propertyId: payload.propertyId } : {}),
        },
      });
      if (res.sent > 0) channels.push('push');
    } catch (error) {
      // VAPID non configuré = no-op tracé (env-gated fail-closed)
      console.warn('[notifications] push indisponible:', error instanceof Error ? error.message : error);
    }
  }

  return { ok: channels.length > 0, channels, notificationId };
}

/**
 * Envoie la même notification à PLUSIEURS destinataires (hôte +
 * managers d'un bien). Déduplique les ids. Ne lève jamais.
 */
export async function sendNotificationToMany(
  userIds: string[],
  type: NotificationEventType,
  payload: UnifiedNotificationPayload,
): Promise<{ sent: number; channels: string[] }> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  let sent = 0;
  const allChannels = new Set<string>();
  for (const userId of unique) {
    const res = await sendNotification(userId, type, payload);
    if (res.ok) sent++;
    res.channels.forEach((c) => allChannels.add(c));
  }
  return { sent, channels: Array.from(allChannels) };
}

// -------------------------------------------------------------
// Audience d'un bien (hôte + managers)
// -------------------------------------------------------------

/** OWNER + MANAGER (acceptés) d'un bien — audience des alertes hôte. */
export async function propertyOwnerAndManagers(propertyId: string): Promise<string[]> {
  try {
    const [property, members] = await Promise.all([
      db.property.findUnique({ where: { id: propertyId }, select: { ownerId: true } }),
      db.propertyMember.findMany({
        where: { propertyId, acceptedAt: { not: null }, role: { in: ['OWNER', 'MANAGER', 'owner', 'cohost', 'member'] } },
        select: { userId: true },
      }),
    ]);
    const ids = new Set<string>();
    if (property?.ownerId) ids.add(property.ownerId);
    for (const m of members) ids.add(m.userId);
    return Array.from(ids);
  } catch (error) {
    console.error('[notifications] propertyOwnerAndManagers failed:', error);
    return [];
  }
}

// -------------------------------------------------------------
// v4.46 — SUPERADMIN : relais des alertes du système
// -------------------------------------------------------------

/** IDs des comptes SUPERADMIN actifs (role='superadmin'). */
export async function superadminIds(): Promise<string[]> {
  try {
    const admins = await db.user.findMany({
      where: { role: 'superadmin', isActive: true },
      select: { id: true },
    });
    return admins.map((a) => a.id);
  } catch (error) {
    console.error('[notifications] superadminIds failed:', error);
    return [];
  }
}

/**
 * v4.46 — Relais d'une notification vers TOUS les Superadmins actifs
 * (in-app + email + push, mêmes règles que sendNotification). Ne lève
 * jamais. Utilisé pour les événements invités du Hub (commandes, SOS,
 * problème signalé, avis) que la plateforme doit pouvoir auditer.
 */
export async function notifySuperadmins(
  type: NotificationEventType,
  payload: UnifiedNotificationPayload,
): Promise<{ sent: number; channels: string[] }> {
  const admins = await superadminIds();
  if (admins.length === 0) return { sent: 0, channels: [] };
  return sendNotificationToMany(admins, type, payload);
}

// -------------------------------------------------------------
// SMS / WhatsApp invité (interface prête — Twilio env-gated)
// -------------------------------------------------------------

export interface GuestMessageResult {
  sent: boolean;
  channel: 'sms' | 'whatsapp';
  sid?: string;
  reason?: string;
}

/**
 * SMS transactionnel à un INVITÉ (téléphone E.164). Sans clés
 * Twilio : no-op tracé { sent:false, reason:'SMS_NOT_CONFIGURED' }.
 */
export async function sendGuestSms(phone: string, body: string): Promise<GuestMessageResult> {
  const res = await sendSms(phone, body);
  return { sent: res.sent, channel: 'sms', sid: res.sid, reason: res.reason ?? res.error };
}

/**
 * WhatsApp via Twilio (MÊME API REST, préfixe « whatsapp: »).
 * Env-gated : nécessite les clés Twilio + un expéditeur WhatsApp
 * (TWILIO_WHATSAPP_FROM, ex "whatsapp:+14155238886" — sandbox Twilio
 * en test). Sans configuration : no-op tracé, jamais bloquant.
 * Placeholder MVP assumé — l'interface est déjà celle de la prod.
 */
export async function sendGuestWhatsApp(
  phone: string,
  body: string,
): Promise<GuestMessageResult> {
  const to = phone?.trim() ?? '';
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim() ?? '';
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() ?? '';
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? '';

  if (!to.startsWith('+') || !accountSid || !authToken || !from) {
    return { sent: false, channel: 'whatsapp', reason: 'WHATSAPP_NOT_CONFIGURED' };
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: `whatsapp:${to}`,
          From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
          Body: body.slice(0, 1600),
        }).toString(),
      },
    );
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      console.error('[notifications] WhatsApp HTTP', res.status, detail);
      return { sent: false, channel: 'whatsapp', reason: `HTTP_${res.status}` };
    }
    const data = (await res.json().catch(() => null)) as { sid?: string } | null;
    return { sent: true, channel: 'whatsapp', sid: data?.sid };
  } catch (error) {
    console.error('[notifications] sendGuestWhatsApp failed:', error);
    return { sent: false, channel: 'whatsapp', reason: 'NETWORK_ERROR' };
  }
}

/** Un canal SMS/WhatsApp est-il au moins techniquement disponible ? */
export function messagingConfigured(): boolean {
  return smsConfigured() || Boolean(process.env.TWILIO_WHATSAPP_FROM?.trim());
}
