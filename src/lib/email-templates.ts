// =============================================================
// TEMPLATES EMAIL — ÉTAPE 22 (V3)
//
// Fonctions pures (client-safe : aucune dépendance DB/env).
// Chaque template retourne { subject, html, text } en français,
// prêt à être passé à queueEmail() (lib/email.ts, server-only).
//
// Charte : fond slate clair, carte blanche 560 px, accent émeraude
// (#059669 — pas de violet/indigo), boutons CTA pleine largeur,
// styles inline (compatibilité clients mail), textes courts.
// =============================================================

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

const BRAND = 'Conciergerie Hub';
const ACCENT = '#059669';

/** Échappe les caractères sensibles du HTML. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Montant formaté "36,00 €". */
function eur(amount: number): string {
  return `${amount.toFixed(2).replace('.', ',')} €`;
}

interface ShellOptions {
  heading: string;
  intro: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}

function shell({ heading, intro, ctaLabel, ctaUrl, footerNote }: ShellOptions): string {
  const button =
    ctaLabel && ctaUrl
      ? `<a href="${esc(ctaUrl)}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;">${esc(ctaLabel)}</a>`
      : '';
  const note = footerNote
    ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#64748B;">${esc(footerNote)}</p>`
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
          <h1 style="margin:10px 0 0;font-size:21px;line-height:1.3;font-weight:700;color:#0F172A;">${heading}</h1>
        </td></tr>
        <tr><td style="padding:14px 28px 0;">
          <div style="font-size:15px;line-height:1.6;color:#334155;">${intro}</div>
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

function toText(heading: string, paragraphs: string[], ctaLabel?: string, ctaUrl?: string): string {
  return [heading, '', ...paragraphs, ctaLabel && ctaUrl ? `\n${ctaLabel} : ${ctaUrl}` : '', `— ${BRAND}`]
    .filter((s) => s !== undefined)
    .join('\n');
}

// -------------------------------------------------------------
// 1) Notification hôte (miroir email des automatisations É13)
// -------------------------------------------------------------

export function hostNotificationEmail(params: {
  title: string;
  body: string;
  propertyName: string;
  url?: string;
}): EmailTemplate {
  const heading = params.title;
  const intro = `<p style="margin:0 0 10px;">${esc(params.body)}</p><p style="margin:0;color:#64748B;">Bien concerné : <strong style="color:#0F172A;">${esc(params.propertyName)}</strong></p>`;
  return {
    subject: `${params.title} — ${params.propertyName}`,
    html: shell({
      heading: esc(heading),
      intro,
      ctaLabel: 'Ouvrir le tableau de bord',
      ctaUrl: params.url ?? '/airbnb/dashboard',
    }),
    text: toText(heading, [params.body, `Bien concerné : ${params.propertyName}`], 'Tableau de bord', params.url ?? '/airbnb/dashboard'),
  };
}

// -------------------------------------------------------------
// 2) Reçu de paiement invité (commande service payée — É17.6/20)
// -------------------------------------------------------------

export function guestReceiptEmail(params: {
  guestName: string;
  orderRef: string;
  itemsSummary: string;
  amount: number;
  providerName: string;
  propertyName: string;
}): EmailTemplate {
  const heading = 'Merci pour votre commande !';
  const intro = `
    <p style="margin:0 0 12px;">Bonjour ${esc(params.guestName)}, votre paiement a bien été reçu.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;">
      <tr><td style="padding:14px 16px;font-size:14px;line-height:1.8;color:#334155;">
        <strong style="color:#0F172A;">Commande</strong> ${esc(params.orderRef.slice(0, 8).toUpperCase())}<br/>
        ${esc(params.itemsSummary)}<br/>
        Prestataire : ${esc(params.providerName)} — ${esc(params.propertyName)}<br/>
        <strong style="color:#0F172A;font-size:16px;">Total réglé : ${eur(params.amount)}</strong>
      </td></tr>
    </table>`;
  return {
    subject: `Reçu ${eur(params.amount)} — votre commande ${BRAND}`,
    html: shell({
      heading,
      intro,
      footerNote: 'Conservez cet email comme justificatif de paiement.',
    }),
    text: toText(heading, [
      `Bonjour ${params.guestName}, votre paiement a bien été reçu.`,
      `Commande ${params.orderRef.slice(0, 8).toUpperCase()} : ${params.itemsSummary}`,
      `Prestataire : ${params.providerName} — ${params.propertyName}`,
      `Total réglé : ${eur(params.amount)}`,
    ]),
  };
}

// -------------------------------------------------------------
// 3) Confirmation de remboursement invité (É21)
// -------------------------------------------------------------

export function guestRefundEmail(params: {
  guestName: string;
  orderRef: string;
  amount: number;
  propertyName: string;
}): EmailTemplate {
  const heading = 'Votre remboursement est en route';
  const intro = `
    <p style="margin:0 0 12px;">Bonjour ${esc(params.guestName)}, nous avons remboursé votre commande ${esc(params.orderRef.slice(0, 8).toUpperCase())} (${esc(params.propertyName)}).</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;">
      <tr><td style="padding:14px 16px;font-size:14px;line-height:1.8;color:#334155;">
        <strong style="color:#0F172A;font-size:16px;">Montant remboursé : ${eur(params.amount)}</strong><br/>
        Le remboursement apparaîtra sur votre moyen de paiement sous 5 à 10 jours ouvrés.
      </td></tr>
    </table>`;
  return {
    subject: `Remboursement de ${eur(params.amount)} — ${BRAND}`,
    html: shell({ heading, intro }),
    text: toText(heading, [
      `Bonjour ${params.guestName}, nous avons remboursé votre commande ${params.orderRef.slice(0, 8).toUpperCase()} (${params.propertyName}).`,
      `Montant remboursé : ${eur(params.amount)} — visible sous 5 à 10 jours ouvrés.`,
    ]),
  };
}

// -------------------------------------------------------------
// 4) Email de bienvenue (inscription landing — chantier ONBOARD)
// -------------------------------------------------------------

export function welcomeEmail(params: {
  firstName: string;
  dashboardUrl?: string;
}): EmailTemplate {
  const heading = 'Bienvenue à bord 👋';
  const dashboardUrl = params.dashboardUrl ?? '/airbnb/dashboard';
  const intro = `
    <p style="margin:0 0 12px;">Bonjour <strong>${esc(params.firstName)}</strong> et merci de rejoindre ${BRAND} !</p>
    <p style="margin:0 0 10px;">Votre compte est prêt. Il ne reste que 3 petites étapes (≈ 3 minutes) pour rendre vos invités autonomes :</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;">
      <tr><td style="padding:14px 16px;font-size:14px;line-height:2;color:#334155;">
        🏠 <strong style="color:#0F172A;">Nommez votre logement</strong> + adresse<br/>
        📶 <strong style="color:#0F172A;">Renseignez le Wi-Fi</strong> (connexion en 1 scan)<br/>
        📱 <strong style="color:#0F172A;">Récupérez votre plaque QR</strong> à imprimer
      </td></tr>
    </table>
    <p style="margin:12px 0 0;color:#64748B;">L'assistant de démarrage vous attend sur votre tableau de bord.</p>`;
  return {
    subject: `Bienvenue ${params.firstName} — votre Hub est prêt à configurer`,
    html: shell({
      heading,
      intro,
      ctaLabel: 'Configurer mon logement',
      ctaUrl: dashboardUrl,
      footerNote: 'Un souci à une étape ? Répondez simplement à cet email, on vous aide.',
    }),
    text: toText(
      heading,
      [
        `Bonjour ${params.firstName} et merci de rejoindre ${BRAND} !`,
        'Configurez votre logement en 3 minutes : nom + adresse, Wi-Fi, puis votre plaque QR à imprimer.',
      ],
      'Configurer mon logement',
      dashboardUrl,
    ),
  };
}

/** Module 2 — Mot de passe réinitialisé par le Superadmin. */
export function adminPasswordResetEmail(
  to: string,
  tempPassword: string,
  adminName: string,
): EmailTemplate {
  const heading = 'Votre mot de passe a été réinitialisé';
  const intro = `
    <p style="margin:0 0 12px;">Bonjour,</p>
    <p style="margin:0 0 12px;">Un administrateur de ${BRAND} (${esc(adminName)}) a réinitialisé le mot de passe de votre compte <strong>${esc(to)}</strong>.</p>
    <p style="margin:0 0 12px;">Voici votre mot de passe temporaire :</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;">
      <tr><td style="padding:14px 16px;text-align:center;">
        <strong style="font-size:20px;letter-spacing:1px;color:#0F172A;font-family:monospace;">${esc(tempPassword)}</strong>
      </td></tr>
    </table>
    <p style="margin:12px 0 0;color:#64748B;">Connectez-vous avec ce mot de passe, puis modifiez-le depuis votre compte. Pensez à le conserver en lieu sûr.</p>`;
  return {
    subject: 'Votre mot de passe Conciergerie Hub a été réinitialisé',
    html: shell({
      heading,
      intro,
      ctaLabel: 'Se connecter',
      ctaUrl: '/login',
      footerNote: 'Vous n\u2019êtes pas à l\u2019origine de cette demande ? Contactez immédiatement le support.',
    }),
    text: toText(
      heading,
      [
        `Un administrateur (${adminName}) a réinitialisé le mot de passe de votre compte ${to}.`,
        `Mot de passe temporaire : ${tempPassword}`,
        'Connectez-vous puis changez-le depuis votre compte.',
      ],
      'Se connecter',
      '/login',
    ),
  };
}
