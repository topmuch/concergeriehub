// =============================================================
// MODULE STANDALONE « ÉTAT DES LIEUX » — EMAILS (v4.103)
//
// Trois emails transactionnels du module 299 €/an, envoyés via la
// file EmailOutbox (queueEmail — SMTP, fire-and-forget, retry auto) :
//   1. sendInspectionCreatedEmails() — à la CRÉATION :
//        • INVITÉ (si son email est connu) : invitation à compléter
//          l'état des lieux en ligne (lien public /i/<token>) ;
//        • HÔTE : confirmation de création + rappel du lien de partage.
//   2. sendInspectionCompletedEmail() — à la SIGNATURE (submit) :
//        • HÔTE : document signé, lien PDF direct + lien dashboard.
//
// Style strict du produit : sobre, juridique, zéro émoji, palette
// RoomScan (#101b36 / #f7f6f3) — même famille que le rapport Coach.
// Ne lève JAMAIS : un échec email ne casse jamais le flux métier
// (les fonctions sont appelées en fire-and-forget dans les routes).
// =============================================================

import { db } from '@/lib/db';
import { queueEmail } from '@/lib/email';
import { inspectionShareUrl } from '@/lib/inspection-template';
import { siteUrl } from '@/lib/site';

// ---------- Helpers ----------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const frDateTime = (d: Date) =>
  d.toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });

/** Données minimales attendues (inspection telle que renvoyée par Prisma). */
export interface InspectionEmailData {
  propertyName: string;
  propertyAddress: string;
  ownerName: string;
  guestName: string;
  guestEmail: string | null;
  type: string; // 'ENTREE' | 'SORTIE'
  scheduledDate: Date;
  publicToken: string;
  /** Abonnement module — remonte l'email du hôte (signature). */
  subscriptionId?: string;
}

const typeLabel = (type: string) => (type === 'SORTIE' ? 'de sortie' : "d'entrée");

/** Squelette HTML commun (même famille visuelle que le rapport Coach). */
function emailShell(opts: {
  eyebrow: string;
  title: string;
  intro: string;
  bodyHtml: string;
  footerHtml: string;
}): string {
  return `
    <div style="background:#f7f6f3;padding:32px 16px;font-family:Georgia,'Times New Roman',serif">
      <div style="max-width:560px;margin:0 auto">
        <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#8a94ad;text-align:center">${escapeHtml(opts.eyebrow)}</p>
        <h1 style="margin:10px 0 4px;font-size:24px;font-weight:600;color:#101b36;text-align:center">${opts.title}</h1>
        <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#5d6b8a;text-align:center">${opts.intro}</p>
        ${opts.bodyHtml}
        <table style="width:100%;border-collapse:collapse;margin-top:28px">
          <tr>
            <td style="text-align:center;padding:16px;border-top:1px solid #e8edf6">
              ${opts.footerHtml}
              <p style="margin:12px 0 0;font-size:11px;color:#b6bdd0">RoomScan — États des Lieux, module indépendant.</p>
            </td>
          </tr>
        </table>
      </div>
    </div>`;
}

/** Encadré récapitulatif (logement / invité / date). */
function recapBox(inspection: InspectionEmailData): string {
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:7px 16px;font-size:12px;color:#5d6b8a;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td>
      <td style="padding:7px 16px;font-size:13px;font-weight:600;color:#101b36">${escapeHtml(value)}</td>
    </tr>`;
  return `
    <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e8edf6;border-radius:14px;overflow:hidden">
      ${row('Logement', inspection.propertyName)}
      ${row('Adresse', inspection.propertyAddress)}
      ${row('Type', `État des lieux ${typeLabel(inspection.type)}`)}
      ${row('Invité', inspection.guestName)}
      ${row('Date visée', frDateTime(inspection.scheduledDate))}
      ${row('Propriétaire', inspection.ownerName)}
    </table>`;
}

// -------------------------------------------------------------
// 1. CRÉATION — email invité + confirmation hôte
// -------------------------------------------------------------

/**
 * Invité : « vous êtes invité à compléter votre état des lieux ».
 * Envoyé uniquement si l'email de l'invité est connu (sinon no-op).
 */
async function sendGuestInviteEmail(inspection: InspectionEmailData): Promise<void> {
  if (!inspection.guestEmail) return;

  const shareUrl = inspectionShareUrl(inspection.publicToken, siteUrl);
  const subject = `Votre état des lieux ${typeLabel(inspection.type)} — ${inspection.propertyName}`;
  const html = emailShell({
    eyebrow: 'RoomScan · États des Lieux',
    title: `État des lieux ${typeLabel(inspection.type)}`,
    intro: `Bonjour <strong>${escapeHtml(inspection.guestName)}</strong>, ${escapeHtml(inspection.ownerName)} vous invite à compléter l'état des lieux ${typeLabel(inspection.type)} du logement <strong>${escapeHtml(inspection.propertyName)}</strong>, prévu le ${frDateTime(inspection.scheduledDate)}.`,
    bodyHtml: `
      <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e8edf6;border-radius:14px;overflow:hidden">
        <tr><td style="padding:20px 22px">
          <p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#3f4c6b">
            Vous décrivez chaque pièce et équipement depuis votre téléphone, joignez des photos si nécessaire,
            puis signez électroniquement. Deux minutes suffisent — aucune application à installer.
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#5d6b8a">
            Ce document signé a valeur juridique et protège votre dépôt de garantie.
          </p>
        </td></tr>
      </table>
      <div style="text-align:center;margin-top:24px">
        <a href="${shareUrl}"
           style="display:inline-block;padding:12px 26px;border-radius:9999px;background:#101b36;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none">
          Compléter mon état des lieux →
        </a>
        <p style="margin:14px 0 0;font-size:12px;color:#8a94ad;word-break:break-all">${escapeHtml(shareUrl)}</p>
      </div>`,
    footerHtml: `
      <p style="margin:0;font-size:11px;color:#8a94ad">
        Vous recevez cet email parce que votre séjour est concerné par un état des lieux sur roomscan.pro.
      </p>`,
  });

  await queueEmail({
    to: inspection.guestEmail,
    subject,
    html,
    text: [
      `État des lieux ${typeLabel(inspection.type)} — ${inspection.propertyName}`,
      ``,
      `Bonjour ${inspection.guestName},`,
      `${inspection.ownerName} vous invite à compléter l'état des lieux ${typeLabel(inspection.type)} du logement ${inspection.propertyName}, prévu le ${frDateTime(inspection.scheduledDate)}.`,
      `Depuis votre téléphone : pièces, photos si nécessaire, signature électronique — 2 minutes, valeur juridique.`,
      ``,
      `Ouvrir : ${shareUrl}`,
    ].join('\n'),
    template: 'inspection_guest_invite',
    referenceType: 'inspection',
    referenceId: inspection.publicToken,
    meta: { module: 'inspection', kind: 'guest_invite', type: inspection.type },
  });
}

/**
 * Hôte : confirmation de création + rappel du lien de partage et du dashboard.
 * `hostEmail` : email du compte hôte connecté (créateur du document).
 */
async function sendHostCreatedEmail(
  inspection: InspectionEmailData,
  hostEmail: string,
): Promise<void> {
  const shareUrl = inspectionShareUrl(inspection.publicToken, siteUrl);
  const subject = `État des lieux créé — ${inspection.propertyName}`;
  const html = emailShell({
    eyebrow: 'RoomScan · États des Lieux',
    title: 'Document créé',
    intro: `Votre état des lieux ${typeLabel(inspection.type)} pour <strong>${escapeHtml(inspection.propertyName)}</strong> est prêt à être partagé avec votre invité.`,
    bodyHtml: `
      ${recapBox(inspection)}
      <div style="text-align:center;margin-top:24px">
        <a href="${shareUrl}"
           style="display:inline-block;padding:12px 26px;border-radius:9999px;background:#101b36;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none">
          Voir le document partagé →
        </a>
        <p style="margin:14px 0 0;font-size:12px;color:#8a94ad;word-break:break-all">${escapeHtml(shareUrl)}</p>
      </div>`,
    footerHtml: `
      <p style="margin:0;font-size:11px;color:#8a94ad">
        Partagez le lien par WhatsApp ou email depuis votre
        <a href="${siteUrl}/inspection/dashboard" style="color:#5d6b8a">tableau de bord États des Lieux</a>.
      </p>`,
  });

  await queueEmail({
    to: hostEmail,
    subject,
    html,
    text: [
      `État des lieux créé — ${inspection.propertyName}`,
      ``,
      `Votre état des lieux ${typeLabel(inspection.type)} est prêt :`,
      `Logement : ${inspection.propertyAddress}`,
      `Invité : ${inspection.guestName}${inspection.guestEmail ? ` (${inspection.guestEmail})` : ''}`,
      `Date visée : ${frDateTime(inspection.scheduledDate)}`,
      ``,
      `Lien de partage : ${shareUrl}`,
      `Tableau de bord : ${siteUrl}/inspection/dashboard`,
    ].join('\n'),
    template: 'inspection_host_created',
    referenceType: 'inspection',
    referenceId: inspection.publicToken,
    meta: { module: 'inspection', kind: 'host_created', type: inspection.type },
  });
}

/**
 * Point d'entrée création — jamais bloquant, jamais levant.
 * `hostEmail` : email du compte hôte (utilisateur connecté).
 */
export async function sendInspectionCreatedEmails(
  inspection: InspectionEmailData,
  hostEmail: string,
): Promise<void> {
  try {
    await Promise.allSettled([
      sendGuestInviteEmail(inspection),
      hostEmail ? sendHostCreatedEmail(inspection, hostEmail) : Promise.resolve(),
    ]);
  } catch (error) {
    console.error('[inspection-emails] created emails failed:', error);
  }
}

// -------------------------------------------------------------
// 2. SIGNATURE — email hôte (document complété)
// -------------------------------------------------------------

/**
 * Hôte : l'invité a signé — lien PDF direct + lien dashboard.
 * `hostEmail` : email du compte hôte propriétaire de l'abonnement.
 */
async function sendHostCompletedEmail(
  inspection: InspectionEmailData,
  hostEmail: string,
  signedAt: Date,
): Promise<void> {
  const pdfUrl = `${siteUrl}/api/inspection/pdf/${inspection.publicToken}`;
  const subject = `État des lieux signé — ${inspection.propertyName}`;
  const html = emailShell({
    eyebrow: 'RoomScan · États des Lieux',
    title: 'Document signé',
    intro: `<strong>${escapeHtml(inspection.guestName)}</strong> a signé l'état des lieux ${typeLabel(inspection.type)} du logement <strong>${escapeHtml(inspection.propertyName)}</strong> le ${frDateTime(signedAt)}.`,
    bodyHtml: `
      ${recapBox(inspection)}
      <div style="text-align:center;margin-top:24px">
        <a href="${pdfUrl}"
           style="display:inline-block;padding:12px 26px;border-radius:9999px;background:#101b36;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none">
          Télécharger le PDF signé →
        </a>
        <p style="margin:14px 0 0;font-size:12px;color:#8a94ad">
          Le document est consultable en ligne à vie et vérifiable par QR code.
        </p>
      </div>`,
    footerHtml: `
      <p style="margin:0;font-size:11px;color:#8a94ad">
        Tous vos documents : <a href="${siteUrl}/inspection/dashboard" style="color:#5d6b8a">tableau de bord États des Lieux</a>.
      </p>`,
  });

  await queueEmail({
    to: hostEmail,
    subject,
    html,
    text: [
      `État des lieux signé — ${inspection.propertyName}`,
      ``,
      `${inspection.guestName} a signé l'état des lieux ${typeLabel(inspection.type)} le ${frDateTime(signedAt)}.`,
      ``,
      `PDF signé : ${pdfUrl}`,
      `Tableau de bord : ${siteUrl}/inspection/dashboard`,
    ].join('\n'),
    template: 'inspection_host_completed',
    referenceType: 'inspection',
    referenceId: inspection.publicToken,
    meta: { module: 'inspection', kind: 'host_completed', type: inspection.type },
  });
}

/**
 * Point d'entrée signature — jamais bloquant, jamais levant.
 * Remonte l'email du hôte via l'abonnement au module.
 */
export async function sendInspectionCompletedEmail(
  inspection: InspectionEmailData,
  signedAt: Date,
): Promise<void> {
  try {
    if (!inspection.subscriptionId) return;
    const subscription = await db.inspectionSubscription.findUnique({
      where: { id: inspection.subscriptionId },
      select: { user: { select: { email: true } } },
    });
    const hostEmail = subscription?.user.email;
    if (!hostEmail) return;
    await sendHostCompletedEmail(inspection, hostEmail, signedAt);
  } catch (error) {
    console.error('[inspection-emails] completed email failed:', error);
  }
}
