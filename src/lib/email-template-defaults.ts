// =============================================================
// TEMPLATES EMAIL PAR DÉFAUT (DB) — FIX-12
//
// Source canonique pour le seed des modèles éditables
// (email_templates, /admin/emails → onglet Modèles).
//
// ⚠️ Synchronisation : ces corps reflètent les templates codés en
// dur de lib/email-templates.ts (même charte : fond slate, carte
// 560 px, accent émeraude #059669, styles inline). Le rendu réel
// (lib/email-template-render.ts) lit D'ABORD la ligne DB par key ;
// si elle est absente/désactivée, fallback silencieux sur les
// fonctions codées en dur. Les valeurs sont substituées aux jetons
// {{variable}} (échappement HTML au rendu, hors sujet).
// Client-safe : aucune dépendance DB/env (importable partout).
// =============================================================

export interface EmailTemplateDefault {
  key: string;
  subject: string;
  htmlBody: string;
  description: string;
}

const BRAND = 'Conciergerie Hub';
const ACCENT = '#059669';

/** Miroir fidèle de shell() de lib/email-templates.ts. */
function shell(opts: {
  heading: string;
  intro: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string {
  const button =
    opts.ctaLabel && opts.ctaUrl
      ? `<a href="${opts.ctaUrl}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;">${opts.ctaLabel}</a>`
      : '';
  const note = opts.footerNote
    ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#64748B;">${opts.footerNote}</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E2E8F0;">
        <tr><td style="height:5px;background:${ACCENT};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:28px 28px 0;">
          <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${ACCENT};">${BRAND}</p>
          <h1 style="margin:10px 0 0;font-size:21px;line-height:1.3;font-weight:700;color:#0F172A;">${opts.heading}</h1>
        </td></tr>
        <tr><td style="padding:14px 28px 0;">
          <div style="font-size:15px;line-height:1.6;color:#334155;">${opts.intro}</div>
        </td></tr>
        ${button ? `<tr><td style="padding:22px 28px 0;">${button}</td></tr>` : ''}
        <tr><td style="padding:26px 28px 24px;">
          ${note}
          <p style="margin:8px 0 0;font-size:12px;color:#94A3B8;">Email automatique de ${BRAND} — ne pas répondre.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export const EMAIL_TEMPLATE_DEFAULTS: EmailTemplateDefault[] = [
  // ── 1) Notification hôte (miroir des automatisations) ──
  {
    key: 'host_notification',
    subject: '{{title}} — {{propertyName}}',
    description:
      "Miroir email des notifications d'automatisation envoyées à l'hôte (réservation, message, rappel…). Envoyé à chaque Notification créée par le moteur d'automatisations.",
    htmlBody: shell({
      heading: '{{title}}',
      intro:
        '<p style="margin:0 0 10px;">{{body}}</p><p style="margin:0;color:#64748B;">Bien concerné : <strong style="color:#0F172A;">{{propertyName}}</strong></p>',
      ctaLabel: 'Ouvrir le tableau de bord',
      ctaUrl: '{{url}}',
    }),
  },

  // ── 2) Reçu de paiement invité ──
  {
    key: 'guest_receipt',
    subject: 'Reçu {{amount}} — votre commande Conciergerie Hub',
    description:
      "Reçu de paiement envoyé à l'invité après le règlement d'une commande service (Stripe). {{amount}} est déjà formaté (ex : 36,00 €), {{orderRef}} est la référence courte sur 8 caractères.",
    htmlBody: shell({
      heading: 'Merci pour votre commande !',
      intro: `
    <p style="margin:0 0 12px;">Bonjour {{guestName}}, votre paiement a bien été reçu.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;">
      <tr><td style="padding:14px 16px;font-size:14px;line-height:1.8;color:#334155;">
        <strong style="color:#0F172A;">Commande</strong> {{orderRef}}<br/>
        {{itemsSummary}}<br/>
        Prestataire : {{providerName}} — {{propertyName}}<br/>
        <strong style="color:#0F172A;font-size:16px;">Total réglé : {{amount}}</strong>
      </td></tr>
    </table>`,
      footerNote: 'Conservez cet email comme justificatif de paiement.',
    }),
  },

  // ── 3) Confirmation de remboursement invité ──
  {
    key: 'guest_refund',
    subject: 'Remboursement de {{amount}} — Conciergerie Hub',
    description:
      "Confirmation envoyée à l'invité après remboursement d'une commande service (Stripe refund ou remboursement Superadmin). {{amount}} est déjà formaté (ex : 36,00 €).",
    htmlBody: shell({
      heading: 'Votre remboursement est en route',
      intro: `
    <p style="margin:0 0 12px;">Bonjour {{guestName}}, nous avons remboursé votre commande {{orderRef}} ({{propertyName}}).</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;">
      <tr><td style="padding:14px 16px;font-size:14px;line-height:1.8;color:#334155;">
        <strong style="color:#0F172A;font-size:16px;">Montant remboursé : {{amount}}</strong><br/>
        Le remboursement apparaîtra sur votre moyen de paiement sous 5 à 10 jours ouvrés.
      </td></tr>
    </table>`,
    }),
  },

  // ── 4) Email de bienvenue (inscription) ──
  {
    key: 'welcome',
    subject: 'Bienvenue {{firstName}} — votre Hub est prêt à configurer',
    description:
      "Email de bienvenue envoyé à la création d'un compte hôte (inscription landing). Il annonce les 3 étapes de démarrage.",
    htmlBody: shell({
      heading: 'Bienvenue à bord 👋',
      intro: `
    <p style="margin:0 0 12px;">Bonjour <strong>{{firstName}}</strong> et merci de rejoindre ${BRAND} !</p>
    <p style="margin:0 0 10px;">Votre compte est prêt. Il ne reste que 3 petites étapes (≈ 3 minutes) pour rendre vos invités autonomes :</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;">
      <tr><td style="padding:14px 16px;font-size:14px;line-height:2;color:#334155;">
        🏠 <strong style="color:#0F172A;">Nommez votre logement</strong> + adresse<br/>
        📶 <strong style="color:#0F172A;">Renseignez le Wi-Fi</strong> (connexion en 1 scan)<br/>
        📱 <strong style="color:#0F172A;">Récupérez votre plaque QR</strong> à imprimer
      </td></tr>
    </table>
    <p style="margin:12px 0 0;color:#64748B;">L'assistant de démarrage vous attend sur votre tableau de bord.</p>`,
      ctaLabel: 'Configurer mon logement',
      ctaUrl: '{{dashboardUrl}}',
      footerNote: 'Un souci à une étape ? Répondez simplement à cet email, on vous aide.',
    }),
  },

  // ── 5) Mot de passe réinitialisé par le Superadmin ──
  {
    key: 'admin_password_reset',
    subject: 'Votre mot de passe Conciergerie Hub a été réinitialisé',
    description:
      "Envoyé lorsqu'un Superadmin réinitialise le mot de passe d'un compte (Console → Utilisateurs). Contient le mot de passe temporaire en clair.",
    htmlBody: shell({
      heading: 'Votre mot de passe a été réinitialisé',
      intro: `
    <p style="margin:0 0 12px;">Bonjour,</p>
    <p style="margin:0 0 12px;">Un administrateur de ${BRAND} ({{adminName}}) a réinitialisé le mot de passe de votre compte <strong>{{email}}</strong>.</p>
    <p style="margin:0 0 12px;">Voici votre mot de passe temporaire :</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;">
      <tr><td style="padding:14px 16px;text-align:center;">
        <strong style="font-size:20px;letter-spacing:1px;color:#0F172A;font-family:monospace;">{{tempPassword}}</strong>
      </td></tr>
    </table>
    <p style="margin:12px 0 0;color:#64748B;">Connectez-vous avec ce mot de passe, puis modifiez-le depuis votre compte. Pensez à le conserver en lieu sûr.</p>`,
      ctaLabel: 'Se connecter',
      ctaUrl: '/login',
      footerNote: 'Vous n’êtes pas à l’origine de cette demande ? Contactez immédiatement le support.',
    }),
  },
];

/** Variables réelles d'un template : jetons {{nom}} uniques, ordre d'apparition. */
export function extractTemplateVariables(template: string): string[] {
  const seen = new Set<string>();
  const vars: string[] = [];
  for (const match of template.matchAll(/\{\{(\w+)\}\}/g)) {
    const token = match[1];
    if (!seen.has(token)) {
      seen.add(token);
      vars.push(token);
    }
  }
  return vars;
}
