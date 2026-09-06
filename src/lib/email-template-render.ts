// =============================================================
// RENDU DES TEMPLATES EMAIL — FIX-12 — SERVER ONLY
//
// Les chemins d'envoi réels (automatisations, paiements, inscription,
// reset Superadmin) passent ici : on lit D'ABORD le modèle DB
// (email_templates, isActive=true) par clé, on substitue les jetons
// {{variable}}, et on retombe SILENCIEUSEMENT sur le template codé
// en dur (lib/email-templates.ts) si :
//   - la ligne n'existe pas (seed pas encore exécuté),
//   - isActive=false (désactivé par le Superadmin),
//   - la lecture DB échoue (l'email part quand même — jamais
//     bloquant, même contrat fire-and-forget que lib/email.ts).
//
// Rendu des variables :
//   - sujet   : substitution brute (texte plein, \r\n neutralisés
//     contre l'injection d'en-tête) ;
//   - corps   : valeurs ÉCHAPPÉES HTML (même comportement que esc()
//     des templates codés en dur) ;
//   - texte   : le modèle DB ne stocke pas de version texte → dérivation
//     du HTML rendu (dégrossissage des balises + entités).
// =============================================================
import { db } from '@/lib/db';
import type { EmailTemplate } from '@/lib/email-templates';
import {
  hostNotificationEmail,
  guestReceiptEmail,
  guestRefundEmail,
  welcomeEmail,
  adminPasswordResetEmail,
} from '@/lib/email-templates';

/** Échappement HTML identique à esc() de lib/email-templates.ts. */
function escHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Substitue les jetons {{nom}} ; un jeton sans variable reste tel quel. */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (token, name: string) => {
    const value = vars[name];
    return value === undefined ? token : value;
  });
}

/** Version texte dérivée du HTML rendu (le modèle DB n'a pas de colonne texte). */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h1|td|table|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map((line) => line.trim())
    .filter((line, i, arr) => line !== '' || (i > 0 && arr[i - 1] !== ''))
    .join('\n')
    .trim();
}

export interface RenderedEmail extends EmailTemplate {
  /** Origine du rendu : 'db' (modèle éditable) ou 'code' (fallback dur). */
  source: 'db' | 'code';
}

async function renderFromDbOrFallback(params: {
  key: string;
  fallback: () => EmailTemplate;
  vars: Record<string, string>;
}): Promise<RenderedEmail> {
  const fb = params.fallback();
  try {
    const row = await db.emailTemplate.findUnique({ where: { key: params.key } });
    if (row && row.isActive) {
      // Corps : valeurs échappées HTML (le sujet reste du texte brut).
      const htmlVars = Object.fromEntries(
        Object.entries(params.vars).map(([name, value]) => [name, escHtml(String(value))]),
      );
      const subject = interpolate(row.subject, params.vars)
        .replace(/[\r\n]+/g, ' ')
        .trim();
      const html = interpolate(row.htmlBody, htmlVars);
      return { subject, html, text: htmlToText(html), source: 'db' };
    }
  } catch (error) {
    // Fallback silencieux : un souci de lecture du modèle ne doit
    // jamais empêcher l'envoi (l'erreur est tracée, pas levée).
    console.error(`[email-template] rendu DB « ${params.key} » impossible, fallback code:`, error);
  }
  return { subject: fb.subject, html: fb.html, text: fb.text, source: 'code' };
}

// -------------------------------------------------------------
// Helpers par clé — mêmes signatures que lib/email-templates.ts,
// les call sites remplacent simplement l'import et await.
// -------------------------------------------------------------

/** key 'host_notification' — miroir email des automatisations. */
export async function renderHostNotificationEmail(params: {
  title: string;
  body: string;
  propertyName: string;
  url?: string;
}): Promise<RenderedEmail> {
  return renderFromDbOrFallback({
    key: 'host_notification',
    fallback: () => hostNotificationEmail(params),
    vars: {
      title: params.title,
      body: params.body,
      propertyName: params.propertyName,
      url: params.url ?? '/airbnb/dashboard',
    },
  });
}

/** key 'guest_receipt' — reçu de paiement invité. */
export async function renderGuestReceiptEmail(params: {
  guestName: string;
  orderRef: string;
  itemsSummary: string;
  amount: number;
  providerName: string;
  propertyName: string;
}): Promise<RenderedEmail> {
  const amount = `${params.amount.toFixed(2).replace('.', ',')} €`;
  return renderFromDbOrFallback({
    key: 'guest_receipt',
    fallback: () => guestReceiptEmail(params),
    vars: {
      guestName: params.guestName,
      // Référence courte sur 8 caractères (identique au template dur).
      orderRef: params.orderRef.slice(0, 8).toUpperCase(),
      itemsSummary: params.itemsSummary,
      amount,
      providerName: params.providerName,
      propertyName: params.propertyName,
    },
  });
}

/** key 'guest_refund' — confirmation de remboursement invité. */
export async function renderGuestRefundEmail(params: {
  guestName: string;
  orderRef: string;
  amount: number;
  propertyName: string;
}): Promise<RenderedEmail> {
  const amount = `${params.amount.toFixed(2).replace('.', ',')} €`;
  return renderFromDbOrFallback({
    key: 'guest_refund',
    fallback: () => guestRefundEmail(params),
    vars: {
      guestName: params.guestName,
      orderRef: params.orderRef.slice(0, 8).toUpperCase(),
      amount,
      propertyName: params.propertyName,
    },
  });
}

/** key 'welcome' — email de bienvenue à l'inscription. */
export async function renderWelcomeEmail(params: {
  firstName: string;
  dashboardUrl?: string;
}): Promise<RenderedEmail> {
  return renderFromDbOrFallback({
    key: 'welcome',
    fallback: () => welcomeEmail(params),
    vars: {
      firstName: params.firstName,
      dashboardUrl: params.dashboardUrl ?? '/airbnb/dashboard',
    },
  });
}

/** key 'admin_password_reset' — mot de passe réinitialisé par le Superadmin. */
export async function renderAdminPasswordResetEmail(params: {
  to: string;
  tempPassword: string;
  adminName: string;
}): Promise<RenderedEmail> {
  return renderFromDbOrFallback({
    key: 'admin_password_reset',
    fallback: () => adminPasswordResetEmail(params.to, params.tempPassword, params.adminName),
    vars: {
      email: params.to,
      tempPassword: params.tempPassword,
      adminName: params.adminName,
    },
  });
}
