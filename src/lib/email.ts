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
//      * SMTP_HOST + SMTP_PORT → nodemailer (import dynamique lazy)
//        — v4.95 : RESEND RETIRÉ (demande client : « je n'utilise pas
//        resend supprime le, j'utilise smtp »). SMTP = seul provider.
//      * sans clés en dev      → mode DÉMO : status SENT + provider
//        'demo' (aucun envoi réel, l'email est consultable dans la
//        Console Superadmin /admin/emails)
//      * sans clés en prod     → FAILED « provider non configuré »
//        (retentez après configuration : bouton Réessayer)
//  - CLÉS : SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM.
//  - v4.55→v4.58 — EXPÉDITEUR SYSTÈME (clarification client) : les
//    notifications partent de la boîte système (notifications@…)
//    vers leurs destinataires normaux (hôtes et invités). L'hôte ne
//    configure JAMAIS son propre email : la plateforme envoie tout.
//    (La v4.55 redirigeait les notifications vers une boîte centrale
//    — mélecture de la demande — supprimée en v4.58 : l'hôte et
//    l'invité REÇOIVENT leurs notifications, expédiées par le système.)
//  - v4.56 — CONFIG ÉDITABLE : l'expéditeur est éditable depuis la
//    Console Superadmin (/admin/emails → Configuration) et persisté
//    en base (table system_settings). Priorité de résolution : BASE
//    DE DONNÉES > variable d'environnement > défaut codé. Valeur
//    vide en base = pas d'override (retour env/défaut).
//  - v4.57 — PROVIDER ÉDITABLE : le provider d'envoi (Resend ou
//    SMTP, clés comprises) est lui aussi éditable depuis la Console
//    (même priorité DB > env). Un email de TEST peut être envoyé
//    depuis la Console pour valider la configuration d'un clic.
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
  /** v5.3 — pièce jointe optionnelle (ex. certificat PDF Bouclier). */
  attachment?: { filename: string; mime: string; data: Buffer } | null;
}

export interface QueueEmailResult {
  id: string | null;
  status: 'QUEUED' | 'SENT' | 'FAILED' | 'SKIPPED';
  provider: string | null;
  error: string | null;
}

// v4.58 — Expéditeur par défaut = boîte SYSTÈME de notifications.
// Tous les emails (notifications hôtes, emails invités, reçus…)
// partent de cette adresse : l'hôte n'a JAMAIS à configurer son
// propre email. Surchargable via EMAIL_FROM ou la config Superadmin.
const DEFAULT_FROM = 'RoomScan <notifications@roomscan.pro>';

// v4.56/4.57 — Clés de configuration en base (table system_settings).
export const EMAIL_SETTING_KEYS = {
  FROM: 'email.from',
  PROVIDER: 'email.provider',
  SMTP_HOST: 'email.smtp_host',
  SMTP_PORT: 'email.smtp_port',
  SMTP_USER: 'email.smtp_user',
  SMTP_PASS: 'email.smtp_pass',
  RESEND_API_KEY: 'email.resend_api_key',
} as const;

const ALL_EMAIL_SETTING_KEYS = Object.values(EMAIL_SETTING_KEYS) as string[];

// v4.106 — Resend RÉINTRODUIT : le serveur SMTP du domaine
// (mail.roomscan.pro) accepte les messages mais ne les livre jamais
// (file sortante bloquée — prouvé par test de remise) ; Resend = API
// HTTPS directe, aucune dépendance au port 25 sortant.
export type EmailProviderType = 'smtp' | 'resend' | 'none';
export type EmailSettingSource = 'database' | 'env' | 'default';

export interface ResolvedEmailProvider {
  type: EmailProviderType;
  smtp: { host: string; port: number; user: string; pass: string };
  resend: { apiKey: string };
  source: EmailSettingSource;
}

// Cache 30 s : évite une lecture SQLite à chaque envoi. Invalidation
// immédiate à la sauvegarde (invalidateEmailConfigCache).
let cfgCache: { value: Map<string, string>; at: number } | null = null;
const CFG_TTL_MS = 30_000;

export function invalidateEmailConfigCache(): void {
  cfgCache = null;
}

async function dbEmailSettings(): Promise<Map<string, string>> {
  if (cfgCache && Date.now() - cfgCache.at < CFG_TTL_MS) return cfgCache.value;
  const map = new Map<string, string>();
  try {
    const rows = await db.systemSetting.findMany({
      where: { key: { in: ALL_EMAIL_SETTING_KEYS } },
      select: { key: true, value: true },
    });
    for (const row of rows) map.set(row.key, row.value);
  } catch (error) {
    // Table absente (démarrage à froid) → fallback env/défaut, jamais bloquant.
    console.error('[email] dbEmailSettings failed (fallback env):', error);
  }
  cfgCache = { value: map, at: Date.now() };
  return map;
}

function dbGet(map: Map<string, string>, key: string): string {
  return (map.get(key) ?? '').trim();
}

async function fromAddress(): Promise<string> {
  const map = await dbEmailSettings();
  return dbGet(map, EMAIL_SETTING_KEYS.FROM) || process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
}

/** Adresse d'expéditeur effective (affichage Console Superadmin). */
export async function emailFromAddress(): Promise<string> {
  return fromAddress();
}

/**
 * v4.57 — Résolution COMPLÈTE du provider d'envoi (DB > env).
 *  - v4.95 : Resend retiré — type : 'smtp' | 'none'. Un ancien choix
 *    DB « resend » est ignoré (fallback détection SMTP env).
 *  - source : d'où vient le CHOIX du provider (database | env | default).
 */
export async function resolveEmailProvider(): Promise<ResolvedEmailProvider> {
  const map = await dbEmailSettings();
  const dbProvider = dbGet(map, EMAIL_SETTING_KEYS.PROVIDER);
  const envResendKey = process.env.RESEND_API_KEY?.trim() || '';
  const envSmtpOk = Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_PORT?.trim());

  // v4.106 — priorité : DB (choix Console) > env (SMTP > Resend) > défaut.
  // Un choix DB explicite ('resend' | 'smtp') GAGNE toujours sur l'env.
  let type: EmailProviderType;
  let source: EmailSettingSource;
  if (dbProvider === 'resend') {
    type = 'resend';
    source = 'database';
  } else if (dbProvider === 'smtp') {
    type = 'smtp';
    source = 'database';
  } else if (envSmtpOk) {
    type = 'smtp';
    source = 'env';
  } else if (envResendKey) {
    type = 'resend';
    source = 'env';
  } else {
    type = 'none';
    source = 'default';
  }

  const host = dbGet(map, EMAIL_SETTING_KEYS.SMTP_HOST) || process.env.SMTP_HOST?.trim() || '';
  const portRaw = dbGet(map, EMAIL_SETTING_KEYS.SMTP_PORT) || process.env.SMTP_PORT?.trim() || '';
  const port = Number(portRaw) > 0 ? Number(portRaw) : 587;
  const user = dbGet(map, EMAIL_SETTING_KEYS.SMTP_USER) || process.env.SMTP_USER?.trim() || '';
  const pass = dbGet(map, EMAIL_SETTING_KEYS.SMTP_PASS) || process.env.SMTP_PASS?.trim() || '';
  const resendApiKey = dbGet(map, EMAIL_SETTING_KEYS.RESEND_API_KEY) || envResendKey;

  return { type, smtp: { host, port, user, pass }, resend: { apiKey: resendApiKey }, source };
}

/**
 * v4.56/4.57 — Sauvegarde d'un réglage e-mail depuis la Console Superadmin.
 * Valeur vide → l'override est SUPPRIMÉ (retour env/défaut).
 * Kinds : 'from' | 'provider' | 'smtp_host' | 'smtp_port' |
 * 'smtp_user' | 'smtp_pass'.
 */
export type EmailSettingKind =
  | 'from'
  | 'provider'
  | 'smtp_host'
  | 'smtp_port'
  | 'smtp_user'
  | 'smtp_pass'
  | 'resend_api_key';

const KIND_TO_KEY: Record<EmailSettingKind, string> = {
  from: EMAIL_SETTING_KEYS.FROM,
  provider: EMAIL_SETTING_KEYS.PROVIDER,
  smtp_host: EMAIL_SETTING_KEYS.SMTP_HOST,
  smtp_port: EMAIL_SETTING_KEYS.SMTP_PORT,
  smtp_user: EMAIL_SETTING_KEYS.SMTP_USER,
  smtp_pass: EMAIL_SETTING_KEYS.SMTP_PASS,
  resend_api_key: EMAIL_SETTING_KEYS.RESEND_API_KEY,
};

export async function saveEmailSetting(
  kind: EmailSettingKind,
  rawValue: string,
): Promise<{ ok: boolean; error?: string }> {
  const value = rawValue.trim();
  const key = KIND_TO_KEY[kind];
  if (!key) return { ok: false, error: 'Réglage inconnu' };
  try {
    if (!value) {
      await db.systemSetting.deleteMany({ where: { key } });
    } else {
      // Validation par kind.
      if (kind === 'from') {
        const emailPart = value.match(/<([^>]+)>/)?.[1] ?? value;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailPart)) {
          return { ok: false, error: 'Adresse email invalide (ex : nom@domaine.fr ou Conciergerie <noreply@domaine.fr>)' };
        }
      }
      // v4.106 — 'resend' accepté de nouveau (clé API stockée via
      // saveEmailSetting('resend_api_key', …)).
      if (kind === 'provider' && value !== 'smtp' && value !== 'resend') {
        return { ok: false, error: 'Provider invalide (smtp ou resend)' };
      }
      if (kind === 'smtp_port' && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535)) {
        return { ok: false, error: 'Port SMTP invalide (1-65535, ex : 587)' };
      }
      await db.systemSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }
    invalidateEmailConfigCache();
    return { ok: true };
  } catch (error) {
    console.error('[email] saveEmailSetting failed:', error);
    return { ok: false, error: 'Sauvegarde impossible (base de données)' };
  }
}

/**
 * Un provider réel est-il configuré ? (sinon démo dev / échec prod)
 * v4.57 : résolution DB > env (async). v4.106 : + Resend.
 */
export async function emailProviderConfigured(): Promise<boolean> {
  const provider = await resolveEmailProvider();
  if (provider.type === 'smtp') return Boolean(provider.smtp.host && provider.smtp.port);
  if (provider.type === 'resend') return Boolean(provider.resend.apiKey);
  return false;
}

// -------------------------------------------------------------
// v4.106 — Envoi réel via l'API Resend (HTTPS, sans SMTP)
// -------------------------------------------------------------

/**
 * POST https://api.resend.com/emails — lève en cas d'échec (message
 * Resend propagé : domaine non vérifié, clé invalide, quota…).
 */
async function sendViaResend(
  apiKey: string,
  params: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text?: string;
    attachment?: { filename: string; mime: string; data: Buffer } | null;
  },
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      ...(params.text ? { text: params.text } : {}),
      ...(params.attachment
        ? {
            attachments: [
              {
                filename: params.attachment.filename,
                content: params.attachment.data.toString('base64'),
                content_type: params.attachment.mime || 'application/octet-stream',
              },
            ],
          }
        : {}),
    }),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { name?: string; message?: string };
      detail = [body?.name, body?.message].filter(Boolean).join(' : ');
    } catch {
      // corps non JSON — on garde le détail vide
    }
    throw new Error(detail || `Resend HTTP ${res.status}`);
  }
}

function isDev(): boolean {
  return process.env.NODE_ENV !== 'production';
}

// -------------------------------------------------------------
// Envoi réel par SMTP (lève en cas d'échec → géré par deliver)
// -------------------------------------------------------------

async function sendViaSmtp(
  provider: ResolvedEmailProvider,
  params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    attachment?: { filename: string; mime: string; data: Buffer } | null;
  },
): Promise<void> {
  // Import dynamique lazy : nodemailer ne doit JAMAIS entrer dans un
  // bundle client (même leçon que ioredis, É21).
  const nodemailer = (await import('nodemailer')).default;
  const port = provider.smtp.port;
  const transport = nodemailer.createTransport({
    host: provider.smtp.host,
    port,
    secure: port === 465,
    auth:
      provider.smtp.user && provider.smtp.pass
        ? { user: provider.smtp.user, pass: provider.smtp.pass }
        : undefined,
  });
  await transport.sendMail({
    from: await fromAddress(),
    to: params.to,
    subject: params.subject,
    html: params.html,
    ...(params.text ? { text: params.text } : {}),
    ...(params.attachment
      ? {
          attachments: [
            {
              filename: params.attachment.filename,
              content: params.attachment.data,
              contentType: params.attachment.mime || 'application/octet-stream',
            },
          ],
        }
      : {}),
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
    const attachment =
      row.attachmentData && row.attachmentName
        ? { filename: row.attachmentName, mime: row.attachmentMime ?? 'application/octet-stream', data: Buffer.from(row.attachmentData) }
        : null;
    const payload = {
      to: row.to,
      subject: row.subject,
      html: row.htmlBody,
      text: row.textBody ?? undefined,
      ...(attachment ? { attachment } : {}),
    };

    // ── Provider résolu (DB > env, v4.57 ; v4.106 : SMTP ou Resend) ──
    const provider = await resolveEmailProvider();

    if (provider.type === 'resend' && provider.resend.apiKey) {
      try {
        await sendViaResend(provider.resend.apiKey, {
          from: await fromAddress(),
          ...payload,
        });
        await db.emailOutbox.update({
          where: { id: outboxId },
          data: { status: 'SENT', provider: 'resend', attempts, sentAt: new Date(), lastError: null },
        });
        return { status: 'SENT', provider: 'resend', error: null };
      } catch (error) {
        return await markFailed(outboxId, attempts, error, 'resend');
      }
    }

    if (provider.type === 'smtp' && provider.smtp.host && provider.smtp.port) {
      try {
        await sendViaSmtp(provider, payload);
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
      new Error('Aucun provider email configuré (Console Superadmin → Emails → Configuration, ou variables SMTP)'),
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
        ...(params.attachment
          ? {
              attachmentData: new Uint8Array(params.attachment.data),
              attachmentName: params.attachment.filename.slice(0, 200),
              attachmentMime: params.attachment.mime || 'application/octet-stream',
            }
          : {}),
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

/**
 * v4.57 — Email de TEST depuis la Console Superadmin. Passe par la
 * même outbox / le même provider que les vrais emails (fire-and-forget).
 */
export async function sendTestEmail(to: string): Promise<QueueEmailResult> {
  const from = await emailFromAddress();
  const provider = await resolveEmailProvider();
  const providerLabel =
    provider.type === 'smtp'
      ? `SMTP (${provider.smtp.host})`
      : provider.type === 'resend'
        ? 'Resend (API)'
        : 'aucun';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="color:#0f172a">✅ Email de test — RoomScan</h2>
      <p>Si vous lisez cet email, votre configuration d'envoi fonctionne.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Expéditeur</td><td><strong>${from}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Provider</td><td><strong>${providerLabel}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Date</td><td>${new Date().toLocaleString('fr-FR')}</td></tr>
      </table>
      <p style="color:#94a3b8;font-size:12px">Envoyé depuis la Console Superadmin → Emails → Configuration.</p>
    </div>`;
  return queueEmail({
    to,
    subject: '✅ Email de test — RoomScan',
    html,
    text: `Email de test RoomScan — expéditeur ${from}, provider ${providerLabel}.`,
    template: 'custom',
    meta: { test: true, providerType: provider.type },
  });
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

// -------------------------------------------------------------
// v4.98 — SELF-HEALING : retry automatique de la file en échec
// -------------------------------------------------------------

/**
 * Retente les emails FAILED de l'outbox, appelé par le tick de la
 * Tour de Contrôle (scheduler interne) : une fois la configuration
 * SMTP réparée (ou une panne provider passée), les emails en échec
 * repartent TOUT SEULS — y compris les alertes de monitoring ratées.
 *
 * Garde-fous :
 *  • attempts < maxAttempts (3 par défaut) — même garde que l'UI ;
 *  • fenêtre glissante 24 h (on ne réveille pas un vieux spam) ;
 *  • limite par passage (8 par défaut) — jamais de rafale ;
 *  • ordre chronologique (les plus anciens partent en premier) ;
 *  • ne lève JAMAIS (le tick ne doit pas être bloqué par un email).
 */
export async function retryFailedOutboxEmails(options?: {
  maxAttempts?: number;
  windowHours?: number;
  limit?: number;
}): Promise<number> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const windowHours = options?.windowHours ?? 24;
  const limit = options?.limit ?? 8;
  try {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const failed = await db.emailOutbox.findMany({
      where: {
        status: 'FAILED',
        attempts: { lt: maxAttempts },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
      take: limit,
    });
    let sent = 0;
    for (const row of failed) {
      const result = await deliverEmail(row.id);
      if (result.status === 'SENT') sent += 1;
    }
    return sent;
  } catch (error) {
    console.error('[email] retryFailedOutboxEmails failed:', error);
    return 0;
  }
}
