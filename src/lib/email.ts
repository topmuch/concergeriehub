// =============================================================
// EMAIL OUTBOX — ÉTAPE 22 (V3) — SERVER ONLY
//
// File d'emails transactionnels journalisée en base (EmailOutbox).
//
// Principes (alignés sur le moteur d'automatisations É13) :
//  - FIRE-AND-FORGET : queueEmail() ne lève JAMAIS — un échec email
//    ne doit jamais casser le flux métier (réservation, paiement…).
//  - 1 email = 1 ligne d'audit : QUEUED (en file) → SENT (remis au
//    provider, ou mode démo dev) / FAILED (retentable via Console).
//  - PROVIDERS (aucune dépendance au démarrage) :
//      * RESEND_API_KEY        → API HTTPS Resend (fetch natif)
//      * SMTP_HOST + SMTP_PORT → nodemailer (import dynamique lazy)
//      * sans clés en dev      → mode DÉMO : status SENT + provider
//        'demo' (aucun envoi réel, l'email est consultable dans la
//        Console Superadmin /admin/emails)
//      * sans clés en prod     → FAILED « provider non configuré »
//        (retentez après configuration : bouton Réessayer)
//  - CLÉS : RESEND_API_KEY, SMTP_HOST, SMTP_PORT, SMTP_USER,
//    SMTP_PASS, EMAIL_FROM (défaut noreply@conciergerie-hub.app).
//
// ⚠️ Ne jamais ré-exporter ce module depuis une lib partagée
// client/server (leçon ioredis É21) : imports directs côté API.
// =============================================================
import { db } from '@/lib/db';

export interface QueueEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Clé de template : 'host_notification' | 'guest_receipt' | 'guest_refund' | 'custom'. */
  template: string;
  userId?: string | null;
  propertyId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  meta?: Record<string, unknown>;
}

export interface QueueEmailResult {
  id: string | null;
  status: 'QUEUED' | 'SENT' | 'FAILED' | 'SKIPPED';
  provider: string | null;
  error: string | null;
}

const DEFAULT_FROM = 'Conciergerie Hub <noreply@conciergerie-hub.app>';

function fromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
}

/** Un provider réel est-il configuré ? (sinon démo dev / échec prod) */
export function emailProviderConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() ||
      (process.env.SMTP_HOST?.trim() && process.env.SMTP_PORT?.trim()),
  );
}

function isDev(): boolean {
  return process.env.NODE_ENV !== 'production';
}

// -------------------------------------------------------------
// Envoi réel par provider (lève en cas d'échec → géré par deliver)
// -------------------------------------------------------------

async function sendViaResend(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [params.to],
      subject: params.subject,
      html: params.html,
      ...(params.text ? { text: params.text } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend HTTP ${res.status} : ${body.slice(0, 300)}`);
  }
}

async function sendViaSmtp(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  // Import dynamique lazy : nodemailer ne doit JAMAIS entrer dans un
  // bundle client (même leçon que ioredis, É21).
  const nodemailer = (await import('nodemailer')).default;
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  await transport.sendMail({
    from: fromAddress(),
    to: params.to,
    subject: params.subject,
    html: params.html,
    ...(params.text ? { text: params.text } : {}),
  });
}

// -------------------------------------------------------------
// Délivrance d'une entrée de l'outbox
// -------------------------------------------------------------

export interface DeliverResult {
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  provider: string | null;
  error: string | null;
}

/**
 * Tente la délivrance d'un email de l'outbox (idempotent côté statut :
 * un email SENT n'est jamais renvoyé). Incrémente attempts et trace
 * l'erreur éventuelle. Ne lève jamais.
 */
export async function deliverEmail(outboxId: string): Promise<DeliverResult> {
  try {
    const row = await db.emailOutbox.findUnique({ where: { id: outboxId } });
    if (!row) return { status: 'SKIPPED', provider: null, error: 'introuvable' };
    if (row.status === 'SENT') return { status: 'SKIPPED', provider: row.provider, error: null };

    const attempts = row.attempts + 1;
    const payload = { to: row.to, subject: row.subject, html: row.htmlBody, text: row.textBody ?? undefined };

    // ── Provider réel configuré ? ──
    if (process.env.RESEND_API_KEY?.trim()) {
      try {
        await sendViaResend(payload);
        await db.emailOutbox.update({
          where: { id: outboxId },
          data: { status: 'SENT', provider: 'resend', attempts, sentAt: new Date(), lastError: null },
        });
        return { status: 'SENT', provider: 'resend', error: null };
      } catch (error) {
        return await markFailed(outboxId, attempts, error, 'resend');
      }
    }

    if (process.env.SMTP_HOST?.trim() && process.env.SMTP_PORT?.trim()) {
      try {
        await sendViaSmtp(payload);
        await db.emailOutbox.update({
          where: { id: outboxId },
          data: { status: 'SENT', provider: 'smtp', attempts, sentAt: new Date(), lastError: null },
        });
        return { status: 'SENT', provider: 'smtp', error: null };
      } catch (error) {
        return await markFailed(outboxId, attempts, error, 'smtp');
      }
    }

    // ── Sans clés ──
    if (isDev()) {
      // Mode démo : journalisé comme envoyé (aucun envoi réel),
      // consultable dans la Console Superadmin.
      await db.emailOutbox.update({
        where: { id: outboxId },
        data: { status: 'SENT', provider: 'demo', attempts, sentAt: new Date(), lastError: null },
      });
      return { status: 'SENT', provider: 'demo', error: null };
    }

    // Prod sans provider → échec explicite et retentable.
    return await markFailed(
      outboxId,
      attempts,
      new Error('Aucun provider email configuré (RESEND_API_KEY ou SMTP_HOST/SMTP_PORT)'),
      null,
    );
  } catch (error) {
    console.error('[email] deliverEmail failed:', error);
    return { status: 'FAILED', provider: null, error: error instanceof Error ? error.message : 'erreur inconnue' };
  }
}

async function markFailed(
  outboxId: string,
  attempts: number,
  error: unknown,
  provider: string | null,
): Promise<DeliverResult> {
  const message = error instanceof Error ? error.message : String(error);
  await db.emailOutbox
    .update({
      where: { id: outboxId },
      data: { status: 'FAILED', provider, attempts, lastError: message.slice(0, 900) },
    })
    .catch((e) => console.error('[email] markFailed update failed:', e));
  return { status: 'FAILED', provider, error: message };
}

// -------------------------------------------------------------
// API publique : queue + délivrance inline (fire-and-forget)
// -------------------------------------------------------------

/**
 * Journalise un email dans l'outbox puis tente sa délivrance
 * immédiatement. NE LÈVE JAMAIS (le flux métier appelle sans garde).
 */
export async function queueEmail(params: QueueEmailParams): Promise<QueueEmailResult> {
  // Destinataire invalide → no-op silencieux (jamais bloquant).
  const to = params.to?.trim();
  if (!to || !to.includes('@')) {
    return { id: null, status: 'SKIPPED', provider: null, error: 'destinataire invalide' };
  }
  try {
    const row = await db.emailOutbox.create({
      data: {
        to,
        subject: params.subject,
        htmlBody: params.html,
        textBody: params.text ?? null,
        template: params.template,
        status: 'QUEUED',
        userId: params.userId ?? null,
        propertyId: params.propertyId ?? null,
        referenceType: params.referenceType ?? null,
        referenceId: params.referenceId ?? null,
        metaJson: JSON.stringify(params.meta ?? {}),
      },
      select: { id: true },
    });
    const delivered = await deliverEmail(row.id);
    return { id: row.id, status: delivered.status, provider: delivered.provider, error: delivered.error };
  } catch (error) {
    console.error('[email] queueEmail failed:', error);
    return {
      id: null,
      status: 'FAILED',
      provider: null,
      error: error instanceof Error ? error.message : 'erreur inconnue',
    };
  }
}

export interface RetryEmailResult {
  notFound?: boolean;
  alreadySent?: boolean;
  status?: 'SENT' | 'FAILED' | 'SKIPPED';
  provider?: string | null;
  error?: string | null;
}

/**
 * Réessaie un email FAILED/QUEUED (bouton Console Superadmin).
 * Un email SENT n'est jamais renvoyé (idempotence).
 */
export async function retryEmail(outboxId: string): Promise<RetryEmailResult> {
  const row = await db.emailOutbox.findUnique({ where: { id: outboxId }, select: { status: true } });
  if (!row) return { notFound: true };
  if (row.status === 'SENT') return { alreadySent: true };
  const result = await deliverEmail(outboxId);
  return { status: result.status, provider: result.provider, error: result.error };
}
