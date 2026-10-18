import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { resolveHubPropertyId } from '@/lib/hub-resolve';
import { rateLimit } from '@/lib/rate-limit';
import { captureError } from '@/lib/error-monitor';
import { dispatchWebhooks } from '@/lib/webhook-dispatcher';
import { sendSms } from '@/lib/sms';
import {
  sendNotificationToMany,
  notifySuperadmins,
  propertyOwnerAndManagers,
} from '@/lib/notifications';
// v4.46 — email structuré hôte (hub_alert) + URL absolue du CTA.
import { renderHubAlertEmail } from '@/lib/email-template-render';
import { siteUrl } from '@/lib/site';

// =============================================================
// v4.33 « SOS LOGEMENT » — POST /api/public/hub/[slug]/sos
//
// Demande client : « Un bouton qui permet au voyageur de signaler un
// problème urgent (fuite d'eau, panne de chauffage, clé bloquée) en
// un clic. L'application envoie une notification immédiate à l'hôte
// avec l'heure et le numéro de l'appartement. »
//
// POST   (invité, libre) : { problem, note? }
//   - problem : 'water' | 'heating' | 'key' | 'power' | 'other'
//   Effets :
//   1. GuestComplaint (isUrgent: true) → visible « Réclamations en
//      attente » (mode hôte du hub + dashboard /airbnb/messages) ;
//   2. Notification IMMÉDIATE à l'hôte + managers (cloche + email +
//      push selon préférences) avec l'HEURE du signalement et le
//      nom/adresse de l'appartement ;
//   3. SMS hôte (fire-and-forget) ;
//   4. Webhook sortant 'sos'.
// Sécurité : rate limit 3/min par slug+IP ; zod ; never-throw ;
// mode démo = succès sans écriture.
// =============================================================

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

const PROBLEMS = ['water', 'heating', 'key', 'power', 'other', 'breakage'] as const;
type Problem = (typeof PROBLEMS)[number];

const PROBLEM_LABELS: Record<Problem, string> = {
  water: 'Fuite d’eau',
  heating: 'Panne de chauffage',
  key: 'Clé bloquée ou perdue',
  power: 'Panne d’électricité',
  other: 'Autre urgence',
  // v4.41 « SIGNALEMENT DE CASSE EN 1 CLIC » — l'invité casse un objet
  // (ex. machine à café) : il clique, prend une photo et valide. L'hôte
  // est prévenu et peut recommander le même modèle en 1 clic (lien
  // breakageShopUrl configuré dans Conciergerie → SOS).
  breakage: 'Casse / objet abîmé',
};

/** Category GuestComplaint (enum documenté : PLUMBING|ELECTRICAL|CLEANING|BREAKAGE|OTHER).
 *  v4.53 — la casse a SA catégorie 'BREAKAGE' : l'hôte filtre les
 *  dégâts invités en un clic et génère la fiche assurance pré-remplie. */
const PROBLEM_CATEGORY: Record<Problem, string> = {
  water: 'PLUMBING',
  heating: 'OTHER',
  key: 'OTHER',
  power: 'ELECTRICAL',
  other: 'OTHER',
  breakage: 'BREAKAGE',
};

const sosSchema = z.object({
  problem: z.enum(PROBLEMS, { message: 'Type d’urgence invalide.' }),
  note: z.string().trim().max(300).optional().nullable(),
  guestName: z.string().trim().max(80).optional().nullable(),
  // v4.41 — photos de la casse (≤ 2, dataURL, validées manuellement).
  photos: z.array(z.string()).max(2).optional().nullable(),
});

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || 'local';
}

/** v4.41 — Valide un dataURL image : mime autorisé + taille décodée ≤ 500 KB
 *  (même contrat que la route complaint ; non exprimable proprement en zod). */
const ALLOWED_PHOTO_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;
const MAX_PHOTO_BYTES = 500 * 1024;

function validatePhoto(dataUrl: unknown): { ok: true } | { ok: false; reason: string } {
  if (typeof dataUrl !== 'string') return { ok: false, reason: 'Photo invalide.' };
  const match = /^data:([a-z]+\/[a-z0-9.+_-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return { ok: false, reason: 'Format de photo non reconnu.' };
  const [, mime, b64] = match;
  if (!(ALLOWED_PHOTO_MIME as readonly string[]).includes(mime.toLowerCase())) {
    return { ok: false, reason: 'Type de fichier non autorisé (PNG, JPEG ou WebP uniquement).' };
  }
  const bytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  if (bytes > MAX_PHOTO_BYTES) {
    return { ok: false, reason: 'Photo trop volumineuse (max 500 Ko).' };
  }
  return { ok: true };
}

/** v4.42 — résolution unifiée : plaque V1 OU Property.qrHubSlug.
 *  Avant : seul qrHubSlug était consulté → « Ce hub est introuvable »
 *  sur tous les hubs créés via plaque physique. */

/** SMS hôte (fire-and-forget, fail-closed) — heure + appartement inclus. */
async function notifyHostBySms(
  propertyId: string,
  data: { label: string; timeLabel: string; place: string },
): Promise<void> {
  try {
    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: { owner: { select: { profile: { select: { phone: true } } } } },
    });
    const phone = property?.owner?.profile?.phone?.trim();
    if (!phone) return;
    const body =
      `🚨 SOS LOGEMENT — ${data.place} : ${data.label} signalé à ${data.timeLabel}. ` +
      `Merci d’agir immédiatement (RoomScan).`;
    const result = await sendSms(phone, body);
    if (!result.sent) {
      console.warn(`[sos] SMS hôte non envoyé (${propertyId}) :`, result.reason ?? result.error);
    }
  } catch (error) {
    console.error('[sos] notification SMS hôte failed:', error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    // Anti-spam : 3 alertes / minute / slug+IP
    if (!(await rateLimit(`hubsos:${slug}:${clientIp(req)}`, 3))) {
      return NextResponse.json(
        { error: 'Trop d’alertes rapprochées. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody || typeof rawBody !== 'object') {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }
    const parsed = sosSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Requête invalide.' },
        { status: 400 },
      );
    }

    const { problem, note, guestName } = parsed.data;

    // v4.41 — photos de la casse : validation dataURL/mime/taille décodée.
    const rawPhotos = parsed.data.photos?.slice(0, 2) ?? [];
    const photos: string[] = [];
    for (const p of rawPhotos) {
      const v = validatePhoto(p);
      if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 });
      photos.push(p);
    }
    if (problem === 'breakage' && photos.length === 0) {
      return NextResponse.json(
        { error: 'Ajoutez une photo de l’objet cassé pour que l’hôte puisse commander le remplacement.' },
        { status: 400 },
      );
    }

    // Heure du signalement (locale serveur = heure du bien en pratique)
    const now = new Date();
    const timeLabel = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    // ── DEMO MODE : succès sans écriture ──
    if (isDemo(slug)) {
      return NextResponse.json({
        success: true,
        id: `demo-sos-${Date.now()}`,
        timeLabel,
        message: `Alerte envoyée (mode démo) — l’hôte a été prévenu à ${timeLabel}.`,
      });
    }

    const resolved = await resolveHubPropertyId(slug);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }

    const property = await db.property.findUnique({
      where: { id: resolved.propertyId },
      select: {
        id: true,
        name: true,
        address: true,
        owner: { select: { id: true } },
      },
    });
    if (!property?.owner?.id) {
      return NextResponse.json({ error: 'Ce hub est introuvable.' }, { status: 404 });
    }

    const label = PROBLEM_LABELS[problem];
    // « heure + numéro de l'appartement » : nom du bien + adresse si renseignée.
    const place = property.address ? `${property.name} (${property.address})` : property.name;
    const isBreakage = problem === 'breakage';
    const description = isBreakage
      ? `🫖 CASSE — ${label}${note ? ` — ${note}` : ''}${photos.length > 0 ? ` — ${photos.length} photo${photos.length > 1 ? 's' : ''}` : ''} (signalé à ${timeLabel})`
      : `🚨 SOS LOGEMENT — ${label}${note ? ` — ${note}` : ''} (signalé à ${timeLabel})`;

    // 1) Réclamation → files « Réclamations en attente » (casse = non urgente)
    const complaint = await db.guestComplaint.create({
      data: {
        propertyId: property.id,
        category: PROBLEM_CATEGORY[problem],
        description,
        photos: JSON.stringify(photos),
        isUrgent: !isBreakage,
        guestName: guestName ?? null,
      },
      select: { id: true },
    });

    // 2) Notification IMMÉDIATE unifiée (hôte + managers) :
    //    cloche in-app TOUJOURS + email + push selon préférences.
    //    v4.46 — email STRUCTURÉ (hub_alert) + relais SUPERADMIN.
    const audience = await propertyOwnerAndManagers(property.id);
    const body = isBreakage
      ? `${label} — signalé à ${timeLabel} — ${place}.${photos.length > 0 ? ' Photo(s) jointe(s) dans Messages.' : ''} Vous pouvez recommander le même modèle via votre lien fournisseur.`
      : `${label} — signalé à ${timeLabel} — ${place}. Agissez immédiatement.`;
    const hubEmail = await renderHubAlertEmail({
      heading: isBreakage ? '🫖 Casse signalée' : '🚨 SOS Logement',
      propertyName: property.name,
      guestName,
      rows: [
        { label: 'Problème', value: label },
        { label: 'Heure', value: timeLabel },
        { label: 'Lieu', value: place },
        ...(photos.length > 0 ? [{ label: 'Photos', value: `${photos.length} jointure(s) dans Messages` }] : []),
      ],
      introNote: isBreakage
        ? 'Vous pouvez recommander le même modèle via votre lien fournisseur et prévenir l’invité.'
        : 'Urgence : contactez immédiatement l’invité ou l’intervenant adapté.',
      ctaLabel: 'Voir dans le Mode Hôte',
      ctaUrl: `${siteUrl}/hub/${slug}`,
      footerNote: 'Email envoyé automatiquement depuis le Hub invité.',
    }).catch(() => null);
    const customEmail = hubEmail
      ? { subject: hubEmail.subject, html: hubEmail.html, text: hubEmail.text }
      : undefined;
    if (audience.length > 0) {
      await sendNotificationToMany(audience, 'sos_logement', {
        title: isBreakage ? `🫖 Casse signalée — ${property.name}` : `🚨 SOS Logement — ${property.name}`,
        body,
        propertyId: property.id,
        propertyName: property.name,
        url: '/airbnb/messages',
        ...(customEmail ? { email: customEmail } : {}),
        meta: {
          source: 'hub',
          sos: true,
          problem,
          problemLabel: label,
          timeLabel,
          place,
          complaintId: complaint.id,
          hubSlug: slug,
          guestName: guestName ?? null,
        },
      });
    } else {
      // Filet de sécurité : jamais sans trace.
      await db.notification.create({
        data: {
          userId: property.owner.id,
          type: 'guest_sos',
          title: `🚨 SOS Logement — ${property.name}`,
          body,
          dataJson: JSON.stringify({
            source: 'hub',
            problem,
            problemLabel: label,
            timeLabel,
            place,
            complaintId: complaint.id,
            hubSlug: slug,
          }),
        },
      });
    }

    // v4.46 — relais SUPERADMIN (audit plateforme, fire-and-forget).
    if (customEmail) {
      void notifySuperadmins('sos_logement', {
        title: `🚨 [Plateforme] SOS Logement — ${property.name}`,
        body,
        propertyId: property.id,
        propertyName: property.name,
        url: '/airbnb/messages',
        email: customEmail,
        meta: { source: 'hub', relay: 'superadmin', complaintId: complaint.id, hubSlug: slug },
      }).catch(() => undefined);
    }

    // 3) SMS hôte (fire-and-forget) — la casse n'est PAS une urgence :
    //    pas de SMS de nuit pour un objet cassé, la cloche suffit.
    if (!isBreakage) {
      void notifyHostBySms(property.id, { label, timeLabel, place }).catch(() => undefined);
    }

    // 4) Webhook sortant (audit pré-prod, HMAC)
    void dispatchWebhooks(property.id, 'complaint', {
      event: 'sos.created',
      complaintId: complaint.id,
      problem,
      problemLabel: label,
      timeLabel,
      place,
    });

    return NextResponse.json({
      success: true,
      id: complaint.id,
      timeLabel,
      message: `L’hôte a été alerté à ${timeLabel}.`,
    });
  } catch (error) {
    await captureError('hub.sos', error, undefined, req);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}
