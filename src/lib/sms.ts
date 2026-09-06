// =============================================================
// SMS TWILIO — FIX-12 — SERVER ONLY
//
// Envoi SMS réel via l'API REST Twilio (fetch natif — AUCUN SDK).
//
// Comportement ENV-GATED, fail-closed :
//  - TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER
//    présents → POST réel https://api.twilio.com/2010-04-01/Accounts/
//    {SID}/Messages.json (Basic auth, corps form-encodé).
//  - Variables absentes → { sent:false, reason:'SMS_NOT_CONFIGURED' }
//    + console.warn UNE SEULE FOIS (comportement tracé, PAS un mock :
//    dès que les env vars existent, l'appel REST part pour de vrai).
//  - Numéro destinataire invalidé au format E.164 (fail-closed).
//
// Le flux métier qui appelle sendSms() ne doit JAMAIS être bloqué :
// les appelants catchent et journalisent (cf. /api/public/hub/[slug]/
// complaint → notification SMS hôte).
// =============================================================

export interface SmsResult {
  sent: boolean;
  /** SID Twilio du message si envoyé. */
  sid?: string;
  /** Raison d'échec normalisée. */
  reason?: 'SMS_NOT_CONFIGURED' | 'INVALID_NUMBER';
  /** Détail d'erreur (HTTP, réseau…). */
  error?: string;
}

const E164_RE = /^\+[1-9]\d{6,14}$/;

let warnedNotConfigured = false;

/** Les trois variables d'environnement Twilio sont-elles présentes ? */
export function smsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_FROM_NUMBER?.trim(),
  );
}

/**
 * Envoie un SMS via l'API REST Twilio. Ne lève JAMAIS.
 * @param to numéro destinataire au format E.164 (ex : +33612345678)
 * @param body contenu du message (tronqué à 1600 chars, limite Twilio)
 */
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const toE164 = to?.trim() ?? '';

  // Fail-closed : format E.164 basique obligatoire.
  if (!E164_RE.test(toE164)) {
    return {
      sent: false,
      reason: 'INVALID_NUMBER',
      error: `Numéro E.164 invalide (ex : +33612345678) : « ${toE164.slice(0, 24)} »`,
    };
  }

  // Env-gated : sans clés Twilio, no-op tracé (UNE seule alerte par process).
  if (!smsConfigured()) {
    if (!warnedNotConfigured) {
      warnedNotConfigured = true;
      console.warn(
        '[sms] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER non configurés — ' +
          'les envois SMS sont désactivés (fail-closed). Renseignez ces variables pour activer l\'API REST Twilio.',
      );
    }
    return { sent: false, reason: 'SMS_NOT_CONFIGURED' };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID!.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN!.trim();
  const from = process.env.TWILIO_FROM_NUMBER!.trim();

  try {
    // Appel REST Twilio RÉEL (pas de SDK) : form-encoded, Basic auth.
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: toE164,
          From: from,
          Body: body.slice(0, 1600),
        }).toString(),
      },
    );

    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      console.error(`[sms] Twilio HTTP ${res.status} : ${detail}`);
      return { sent: false, error: `Twilio HTTP ${res.status}` };
    }

    const data = (await res.json().catch(() => null)) as { sid?: string } | null;
    return { sent: true, sid: data?.sid };
  } catch (error) {
    console.error('[sms] sendSms failed:', error);
    return { sent: false, error: error instanceof Error ? error.message : 'erreur inconnue' };
  }
}
