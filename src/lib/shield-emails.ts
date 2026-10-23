// =============================================================
// ROOMSCAN BOUCLIER AUTOMATISÉ — EMAILS (v5.3)
//
// À la fin de chaque session (check-in / check-out), le PDF final
// COMPLET (PAGE 1 bibliothèque de référence + PAGE 2 certificat) est
// envoyé AUTOMATIQUEMENT :
//   · à l'HÔTE (email du compte lié à l'abonnement module) ;
//   · à l'INVITÉ (si son email a été renseigné avant l'envoi) —
//     avec le PDF en PIÈCE JOINTE dans les deux cas.
//
// Style strict du produit : sobre, juridique, zéro émoji, palette
// RoomScan. Ne lève JAMAIS : un échec email ne casse jamais le flux
// métier (appel fire-and-forget depuis POST /api/shield/session).
// =============================================================

import { db } from '@/lib/db';
import { queueEmail } from '@/lib/email';
import { siteUrl } from '@/lib/site';
import { renderShieldSessionPdf, type ShieldSessionPdfData } from '@/lib/shield-pdf';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const frDate = (d: Date) =>
  d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

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

const typeLabel = (type: string) => (type === 'CHECK_OUT' ? 'de sortie' : "d'entrée");

/** Squelette HTML commun — même famille que les emails États des Lieux. */
function emailShell(opts: { eyebrow: string; title: string; intro: string; bodyHtml: string; footerHtml: string }): string {
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
              <p style="margin:12px 0 0;font-size:11px;color:#b6bdd0">RoomScan — Roomscan Inventaire, états des lieux automatisés.</p>
            </td>
          </tr>
        </table>
      </div>
    </div>`;
}

/** Charge la session et assemble les données du PDF (contrat shield-pdf). */
async function buildPdfData(sessionId: string, subscriptionId: string): Promise<{
  data: ShieldSessionPdfData;
  sessionRef: string;
  sessionType: string;
  guestEmail: string | null;
} | null> {
  const session = await db.shieldSession.findFirst({
    where: { id: sessionId, property: { subscriptionId } },
    include: {
      property: { include: { devices: { orderBy: { sortOrder: 'asc' } } } },
      video: true,
      shots: { orderBy: { capturedAt: 'asc' } },
    },
  });
  if (!session) return null;

  let linked: ShieldSessionPdfData['linked'] = null;
  if (session.linkedSessionId) {
    const linkedSession = await db.shieldSession.findFirst({
      where: { id: session.linkedSessionId, propertyId: session.propertyId },
      include: { shots: { orderBy: { capturedAt: 'asc' } } },
    });
    if (linkedSession) {
      linked = {
        sessionRef: linkedSession.sessionRef,
        completedAt: linkedSession.completedAt,
        scheduledDate: linkedSession.scheduledDate, // v5.15 — dates de séjour
        shots: linkedSession.shots.map((s) => ({
          zoneName: s.zoneName,
          photo: s.photo,
          status: s.status,
          comment: s.comment,
          capturedAt: s.capturedAt,
        })),
      };
    }
  }

  return {
    sessionRef: session.sessionRef,
    sessionType: session.type,
    guestEmail: session.guestEmail,
    data: {
      property: {
        propertyName: session.property.propertyName,
        propertyAddress: session.property.propertyAddress,
        city: session.property.city,
        ownerName: session.property.ownerName,
        onboardingRef: session.property.onboardingRef,
        onboardedAt: session.property.onboardedAt,
      },
      devices: session.property.devices.map((d) => ({
        name: d.name,
        kind: d.kind,
        referenceCode: d.referenceCode,
        referenceHash: d.referenceHash,
        referencePhoto: d.referencePhoto,
        referenceDate: d.referenceDate,
      })),
      session: {
        type: session.type as 'CHECK_IN' | 'CHECK_OUT',
        agentName: session.agentName,
        guestName: session.guestName,
        sessionRef: session.sessionRef,
        completedAt: session.completedAt,
        scheduledDate: session.scheduledDate, // v5.15 — date EDL planifiée
      },
      video: session.video
        ? {
            publicToken: session.video.publicToken,
            sha256: session.video.sha256,
            durationSec: session.video.durationSec,
            sizeBytes: session.video.sizeBytes,
            createdAt: session.video.createdAt,
          }
        : null,
      shots: session.shots.map((s) => ({
        zoneName: s.zoneName,
        photo: s.photo,
        status: s.status,
        comment: s.comment,
        capturedAt: s.capturedAt,
      })),
      linked,
    },
  };
}

/**
 * Envoi automatique du certificat PDF final : hôte + invité (PJ PDF).
 * Ne lève jamais — appelé en fire-and-forget après la création.
 */
export async function sendShieldSessionCertificateEmails(
  sessionId: string,
  subscriptionId: string,
): Promise<void> {
  try {
    // Email de l'hôte (compte propriétaire de l'abonnement module).
    const subscription = await db.inspectionSubscription.findUnique({
      where: { id: subscriptionId },
      select: { user: { select: { email: true } } },
    });
    const hostEmail = subscription?.user.email;
    if (!hostEmail) return;

    const ctx = await buildPdfData(sessionId, subscriptionId);
    if (!ctx) return;

    const pdf = await renderShieldSessionPdf(ctx.data);
    const filename = `Roomscan_Inventaire_${ctx.sessionRef}.pdf`;
    // v5.15 — CORRECTIF « Non autorisé » : le lien email passe sur la
    // route PUBLIQUE par token vidéo (la même clé que le QR imprimé
    // dans le PDF) → l'invité comme l'hôte (autre appareil) ouvrent le
    // document SANS session hôte. Repli : route session si aucune vidéo.
    const pdfUrl = ctx.data.video
      ? `${siteUrl}/api/public/shield/pdf/${ctx.data.video.publicToken}`
      : `${siteUrl}/api/shield/pdf/session/${sessionId}`;
    const videoUrl = ctx.data.video ? `${siteUrl}/shield/video/${ctx.data.video.publicToken}` : null;
    const propertyName = ctx.data.property.propertyName;
    const when = frDateTime(ctx.data.session.completedAt);
    const guestName = String(ctx.data.session.guestName || '').trim();

    // v5.15 — dates de séjour (couple check-in / check-out planifié) :
    // même logique que le bloc d'identification du PDF.
    const isOutPair = ctx.sessionType === 'CHECK_OUT';
    const stayStart = isOutPair ? ctx.data.linked?.scheduledDate : ctx.data.session.scheduledDate;
    const stayEnd = isOutPair ? ctx.data.session.scheduledDate : ctx.data.linked?.scheduledDate;
    const stayLabel =
      stayStart && stayEnd ? `du ${frDate(stayStart)} au ${frDate(stayEnd)}` : null;

    const recap = `
      <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e8edf6;border-radius:14px;overflow:hidden">
        ${[
          ['Logement', propertyName],
          ['Propriétaire', String(ctx.data.property.ownerName || '—')],
          ['Adresse', `${String(ctx.data.property.propertyAddress || '—')}, ${String(ctx.data.property.city || '')}`],
          ['Type', `État des lieux ${typeLabel(ctx.sessionType)}`],
          ['Agent', ctx.data.session.agentName],
          ...(guestName ? [['Invité', guestName]] : []),
          ['Référence', ctx.sessionRef],
          ['Date', when],
          ...(stayLabel ? [['Séjour', stayLabel]] : []),
          ['Hash vidéo', ctx.data.video ? `SHA-256 ${String(ctx.data.video.sha256).slice(0, 16).toUpperCase()}…` : '—'],
        ]
          .map(
            ([label, value]) => `
          <tr>
            <td style="padding:7px 16px;font-size:12px;color:#5d6b8a;white-space:nowrap;vertical-align:top">${escapeHtml(String(label))}</td>
            <td style="padding:7px 16px;font-size:13px;font-weight:600;color:#101b36">${escapeHtml(String(value))}</td>
          </tr>`,
          )
          .join('')}
      </table>`;

    const attach = { filename, mime: 'application/pdf', data: pdf };

    const sendTo = (to: string, isHost: boolean): ReturnType<typeof queueEmail> =>
      queueEmail({
        to,
        subject: `Certificat ${typeLabel(ctx.sessionType)} — ${propertyName} (${ctx.sessionRef})`,
        html: emailShell({
          eyebrow: 'RoomScan · Roomscan Inventaire',
          title: isHost ? 'Certificat généré' : 'Votre état des lieux',
          intro: isHost
            ? `Le document ${typeLabel(ctx.sessionType)} certifié du logement <strong>${escapeHtml(propertyName)}</strong> est prêt. Il est joint à cet email (PDF 2 pages : bibliothèque de référence + ${ctx.sessionType === 'CHECK_OUT' ? 'rapport de sortie comparatif' : "attestation d'entrée"}).`
            : `Voici l'état des lieux ${typeLabel(ctx.sessionType)} certifié du logement <strong>${escapeHtml(propertyName)}</strong>, où vous séjournez. Le PDF est joint à cet email.`,
          bodyHtml: `
            ${recap}
            <div style="text-align:center;margin-top:24px">
              <a href="${pdfUrl}"
                 style="display:inline-block;padding:12px 26px;border-radius:9999px;background:#101b36;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none">
                Ouvrir le PDF certifié →
              </a>
              ${videoUrl ? `<p style="margin:14px 0 0;font-size:12px;color:#8a94ad">Vidéo walkthrough (hashée SHA-256) : <a href="${videoUrl}" style="color:#5d6b8a">${videoUrl.replace('https://', '')}</a></p>` : ''}
              <p style="margin:10px 0 0;font-size:12px;color:#8a94ad">
                Document sécurisé avec hash SHA-256, vérifiable par QR code${ctx.sessionType === 'CHECK_OUT' ? ' — toute contestation sous 48 h' : ' — contestation sous 48 h'}.
              </p>
            </div>`,
          footerHtml: isHost
            ? `<p style="margin:0;font-size:11px;color:#8a94ad">Toutes vos sessions : <a href="${siteUrl}/inspection/dashboard" style="color:#5d6b8a">tableau de bord Inventaire</a>.</p>`
            : `<p style="margin:0;font-size:11px;color:#8a94ad">Vous recevez cet email parce que votre séjour est concerné par un état des lieux sur roomscan.pro.</p>`,
        }),
        text: [
          `Certificat ${typeLabel(ctx.sessionType)} — ${propertyName} (${ctx.sessionRef})`,
          ``,
          `${isHost ? 'Le document certifié' : "L'état des lieux certifié"} du logement ${propertyName} est joint à cet email (PDF).`,
          `Agent : ${ctx.data.session.agentName} · Date : ${when}`,
          `Référence : ${ctx.sessionRef}`,
          ctx.data.video ? `Hash SHA-256 de la vidéo : ${ctx.data.video.sha256}` : '',
          `PDF : ${pdfUrl}`,
        ]
          .filter(Boolean)
          .join('\n'),
        template: 'shield_certificate',
        referenceType: 'shield_session',
        referenceId: ctx.sessionRef,
        meta: { module: 'shield', kind: 'certificate', type: ctx.sessionType },
        attachment: attach,
      });

    const jobs: Promise<unknown>[] = [sendTo(hostEmail, true)];
    if (ctx.guestEmail) jobs.push(sendTo(ctx.guestEmail, false));
    await Promise.allSettled(jobs);
  } catch (error) {
    console.error('[shield-emails] certificate emails failed:', error);
  }
}
