import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { captureError } from '@/lib/error-monitor';
import {
  sendNotificationToMany,
  propertyOwnerAndManagers,
} from '@/lib/notifications';
import { sendSms } from '@/lib/sms';
// v4.53 « PRÊT POUR L'ARRIVÉE » + « RAPPORT DE CHECK-OUT ».
import { notifyNextGuestReadyForArrival } from '@/lib/ready-for-arrival';
import { refreshCheckoutReportForBooking } from '@/lib/checkout-report';
// v4.96 — la validation staff clôture l'intervention de ménage planifiée.
import { completeHousekeepingTaskFromReport } from '@/lib/housekeeping-tasks';

// =============================================================
// v4.41 « MODE MÉNAGE » — /api/public/hub/[slug]/cleaning  (PUBLIC)
//
// POST  body: { pin, staffName?, checklist[], photos[], startedAt? }
//
// La femme de ménage scanne la MÊME plaque en acrylique que les
// invités mais entre via le bouton « 🧹 Mode Ménage » (code staff).
// Elle coche la checklist de nettoyage, uploade les photos de
// l'appartement PROPRE et valide ses heures d'arrivée/départ.
// Effets (never-throw, zod, rate limit 5/min) :
//   1. CleaningReport  → journal des passages (heures, checklist, photos) ;
//   2. GuestComplaint  (CLEANING, RESOLVED, photos) → le rapport est
//      VISIBLE dans Messages côté dashboard (photos de l'appartement
//      propre) sans polluer le badge « Réclamations en attente » ;
//   3. Notification IMMÉDIATE hôte + managers (cloche + email + push
//      selon préférences) : « L'appartement est prêt pour le prochain
//      client » ;
//   4. SMS hôte (fire-and-forget).
// Sécurité : code staff vérifié SERVEUR (jamais cru client) ; mode
// démo = succès sans écriture.
// =============================================================

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

/** Code staff (spécification client) — centralisé ici pour une future
 *  personnalisation par bien sans refonte du contrat d'API. */
const STAFF_PIN = '0000';

const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 500 * 1024;
const ALLOWED_PHOTO_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;
// v4.43 — vocal staff (≤ 90 s, ≈ 1 Mo binaire → plafond base64 aligné
// sur les vocaux hub : 1_400_000 chars). Mimes = MediaRecorder réels.
const MAX_VOICE_B64_CHARS = 1_400_000;
const MAX_VOICE_SEC = 90;
const ALLOWED_VOICE_MIME = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
]);

const cleaningSchema = z.object({
  pin: z.string().trim().regex(/^\d{4}$/, 'Code staff invalide.'),
  staffName: z.string().trim().max(60).optional().nullable(),
  checklist: z
    .array(z.object({ label: z.string().trim().min(1).max(120), done: z.boolean() }))
    .max(20),
  photos: z.array(z.string()).max(MAX_PHOTOS).optional().nullable(),
  startedAt: z.string().datetime({ offset: true }).optional().nullable(),
  // v4.43 — vocal de la femme de ménage (dataURL, optionnel).
  voice: z.string().max(MAX_VOICE_B64_CHARS).optional().nullable(),
  voiceDurationSec: z.number().int().min(0).max(MAX_VOICE_SEC).optional().nullable(),
  // v4.50 « HORODATAGE & GÉOLOCALISATION DU MÉNAGE » — position GPS du
  // téléphone du staff à l'ARRIVÉE (mode ouvert) et à la VALIDATION
  // (départ). L'hôte suit précisément le temps d'intervention entre
  // deux réservations + la preuve de présence sur site.
  startLat: z.number().min(-90).max(90).optional().nullable(),
  startLng: z.number().min(-180).max(180).optional().nullable(),
  endLat: z.number().min(-90).max(90).optional().nullable(),
  endLng: z.number().min(-180).max(180).optional().nullable(),
});

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || 'local';
}

/** Valide un dataURL image : mime autorisé + taille décodée ≤ 500 KB
 *  (même contrat que sos/complaint). */
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

/** v4.43 — Valide un dataURL audio (vocal staff) : mime allowlist
 *  MediaRecorder + taille décodée ≤ ~1 Mo. */
function validateVoice(dataUrl: unknown): { ok: true } | { ok: false; reason: string } {
  if (typeof dataUrl !== 'string') return { ok: false, reason: 'Vocal invalide.' };
  const match = /^data:([a-z]+\/[a-z0-9.+_-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return { ok: false, reason: 'Format de vocal non reconnu.' };
  const [, mime, b64] = match;
  if (!ALLOWED_VOICE_MIME.has(mime.toLowerCase())) {
    return { ok: false, reason: 'Format audio non autorisé.' };
  }
  const bytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  if (bytes > (MAX_VOICE_B64_CHARS * 3) / 4) {
    return { ok: false, reason: 'Vocal trop long (90 secondes maximum).' };
  }
  return { ok: true };
}

/** Résolution du bien : plaque QR (hubSlug) puis repli qrHubSlug —
 *  identique aux autres routes hub (une plaque = un bien). */
async function resolvePropertyId(
  slug: string,
): Promise<{ ok: true; propertyId: string } | { ok: false; status: number; message: string }> {
  const plaque = await db.physicalQrCode.findUnique({
    where: { hubSlug: slug },
    select: { propertyId: true, isClaimed: true, status: true },
  });
  if (plaque && plaque.isClaimed && plaque.propertyId && plaque.status === 'active') {
    return { ok: true, propertyId: plaque.propertyId };
  }
  if (!plaque) {
    const bySlug = await db.property.findUnique({
      where: { qrHubSlug: slug },
      select: { id: true, isActive: true },
    });
    if (bySlug?.isActive) return { ok: true, propertyId: bySlug.id };
  }
  return { ok: false, status: 404, message: 'Ce hub est introuvable ou a été désactivé.' };
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    if (!(await rateLimit(`hubcleaning:${slug}:${clientIp(req)}`, 5))) {
      return NextResponse.json(
        { error: 'Trop de validations rapprochées. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody || typeof rawBody !== 'object') {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }
    const parsed = cleaningSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Requête invalide.' },
        { status: 400 },
      );
    }
    const { pin, staffName, checklist, startedAt } = parsed.data;
    // v4.50 — géolocalisation staff (optionnelle : refus GPS = null,
    // le ménage reste valable sans preuve de position).
    const geo = {
      startLat: typeof parsed.data.startLat === 'number' ? parsed.data.startLat : null,
      startLng: typeof parsed.data.startLng === 'number' ? parsed.data.startLng : null,
      endLat: typeof parsed.data.endLat === 'number' ? parsed.data.endLat : null,
      endLng: typeof parsed.data.endLng === 'number' ? parsed.data.endLng : null,
    };

    // ── Garde-fou serveur : code staff (spécification client : 0000) ──
    if (pin !== STAFF_PIN) {
      return NextResponse.json({ error: 'Code staff incorrect.' }, { status: 403 });
    }

    // Photos : validation dataURL/mime/taille décodée.
    const rawPhotos = parsed.data.photos?.slice(0, MAX_PHOTOS) ?? [];
    const photos: string[] = [];
    for (const p of rawPhotos) {
      const v = validatePhoto(p);
      if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 });
      photos.push(p);
    }

    // v4.43 — vocal de la femme de ménage (optionnel) : mime + taille.
    let staffVoice: string | null = null;
    let staffVoiceMime: string | null = null;
    const staffVoiceSec = parsed.data.voiceDurationSec ?? 0;
    if (parsed.data.voice) {
      const v = validateVoice(parsed.data.voice);
      if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 });
      const m = /^data:([a-z]+\/[a-z0-9.+_-]+);base64,(.+)$/i.exec(parsed.data.voice);
      if (m) {
        staffVoiceMime = m[1].toLowerCase();
        staffVoice = parsed.data.voice;
      }
    }

    const endedAt = new Date();
    const started = startedAt ? new Date(startedAt) : null;
    const hhmm = (d: Date) =>
      d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const timeLabel = hhmm(endedAt);
    const arrivalLabel = started ? hhmm(started) : null;

    // ── DEMO MODE : succès sans écriture ──
    if (isDemo(slug)) {
      return NextResponse.json({
        success: true,
        id: `demo-cleaning-${Date.now()}`,
        timeLabel,
        message: `Ménage validé (mode démo) — l'hôte a été prévenu à ${timeLabel}.`,
      });
    }

    const resolved = await resolvePropertyId(slug);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }

    const property = await db.property.findUnique({
      where: { id: resolved.propertyId },
      select: {
        id: true,
        name: true,
        owner: { select: { id: true, profile: { select: { phone: true } } } },
      },
    });
    if (!property?.owner?.id) {
      return NextResponse.json({ error: 'Ce hub est introuvable.' }, { status: 404 });
    }

    // Résumé checklist (max 20 items) pour la description lisible.
    const doneCount = checklist.filter((c) => c.done).length;
    const checklistSummary = checklist
      .slice(0, 20)
      .map((c) => `${c.done ? '✅' : '⬜'} ${c.label}`)
      .join('\n');

    // 1) Journal structuré du passage (heures, checklist, photos, vocal, GPS).
    const report = await db.cleaningReport.create({
      data: {
        propertyId: property.id,
        staffName: staffName?.trim().slice(0, 60) || null,
        checklistJson: JSON.stringify(checklist.slice(0, 20)),
        photos: JSON.stringify(photos),
        voiceData: staffVoice,
        voiceMime: staffVoiceMime,
        voiceDurationSec: staffVoice ? staffVoiceSec : 0,
        startedAt: started && !Number.isNaN(started.getTime()) ? started : endedAt,
        endedAt,
        startLat: geo.startLat,
        startLng: geo.startLng,
        endLat: geo.endLat,
        endLng: geo.endLng,
      },
      select: { id: true },
    });

    // 1bis) v4.96 — CLÔTURE AUTOMATIQUE de l'intervention de ménage
    // planifiée (HousekeepingTask) : la tâche NON terminée la plus
    // récemment échue du bien passe DONE avec les heures réelles du
    // rapport et Booking.cleaningStatus = 'DONE'. Silencieux : la
    // validation staff ne doit JAMAIS échouer à cause de la clôture.
    try {
      await completeHousekeepingTaskFromReport({
        propertyId: property.id,
        reportId: report.id,
        startedAt: started && !Number.isNaN(started.getTime()) ? started : null,
        endedAt,
      });
    } catch (error) {
      console.error('[hub/cleaning] Clôture housekeeping task échouée:', error);
    }

    // 2) Rapport visible dans Messages (dashboard) — RESOLVED : ne
    //    compte PAS dans « Réclamations en attente » (badge rouge).
    // v4.50 — durée précise d'intervention + GPS horodaté.
    const durationMin = started && !Number.isNaN(started.getTime())
      ? Math.max(0, Math.round((endedAt.getTime() - started.getTime()) / 60_000))
      : null;
    const geoLabel =
      geo.startLat != null && geo.startLng != null
        ? `\n📍 Position enregistrée (${geo.startLat.toFixed(5)}, ${geo.startLng.toFixed(5)})`
        : '';
    const description =
      `🧹 MÉNAGE TERMINÉ${staffName ? ` — ${staffName}` : ''}\n` +
      `${arrivalLabel ? `Arrivée : ${arrivalLabel} · ` : ''}Fin : ${timeLabel}` +
      (durationMin != null ? ` · durée ${durationMin} min` : '') + '\n' +
      `Checklist : ${doneCount}/${checklist.length} validés` +
      (photos.length > 0 ? `\n${photos.length} photo(s) de l'appartement propre` : '') +
      geoLabel +
      `\n\n${checklistSummary}`;
    await db.guestComplaint.create({
      data: {
        propertyId: property.id,
        category: 'CLEANING',
        description,
        photos: JSON.stringify(photos),
        isUrgent: false,
        status: 'RESOLVED',
        isRead: false,
        guestName: staffName?.trim().slice(0, 60) || 'Équipe ménage',
      },
      select: { id: true },
    });

    // 3) Notification IMMÉDIATE unifiée (hôte + managers).
    const audience = await propertyOwnerAndManagers(property.id);
    const notifBody =
      `${arrivalLabel ? `Arrivée ${arrivalLabel} · fin ${timeLabel}. ` : `Validé à ${timeLabel}. `}` +
      (durationMin != null ? `Durée : ${durationMin} min. ` : '') +
      `${doneCount}/${checklist.length} points de contrôle validés.` +
      (geo.startLat != null ? ' Position GPS enregistrée.' : '') +
      (photos.length > 0 ? ' Photos de l\'appartement propre dans Messages.' : '') +
      (staffVoice ? ' Un message vocal de l\'équipe ménage accompagne le rapport.' : '');
    if (audience.length > 0) {
      await sendNotificationToMany(audience, 'cleaning_done', {
        title: `🧹 L'appartement est prêt pour le prochain client — ${property.name}`,
        body: notifBody,
        propertyId: property.id,
        propertyName: property.name,
        url: '/airbnb/messages',
        meta: {
          source: 'hub',
          cleaning: true,
          cleaningReportId: report.id,
          staffName: staffName ?? null,
          arrival: arrivalLabel,
          departure: timeLabel,
          durationMin,
          startLat: geo.startLat,
          startLng: geo.startLng,
          endLat: geo.endLat,
          endLng: geo.endLng,
          checklistDone: doneCount,
          checklistTotal: checklist.length,
          photoCount: photos.length,
          hasVoice: !!staffVoice,
          hubSlug: slug,
        },
      });
    } else {
      // Filet de sécurité : jamais sans trace.
      await db.notification.create({
        data: {
          userId: property.owner.id,
          type: 'cleaning_done',
          title: `🧹 L'appartement est prêt pour le prochain client — ${property.name}`,
          body: notifBody,
          dataJson: JSON.stringify({
            source: 'hub',
            cleaningReportId: report.id,
            hubSlug: slug,
          }),
        },
      });
    }

    // 4) SMS hôte (fire-and-forget, fail-closed).
    const phone = property.owner.profile?.phone?.trim();
    if (phone) {
      void sendSms(
        phone,
        `🧹 MÉNAGE TERMINÉ — ${property.name} : prêt pour le prochain client (${arrivalLabel ? `arrivée ${arrivalLabel}, ` : ''}fin ${timeLabel}${durationMin != null ? `, durée ${durationMin} min` : ''}). RoomScan.`,
      ).catch(() => undefined);
    }

    // 5) v4.53 « NOTIFICATION PRÊT POUR L'ARRIVÉE » — la femme de
    //    ménage a terminé sa session, validé ses preuves et fermé le
    //    hub Clean : le FUTUR VOYAGEUR (arrivée ≤ 72 h) reçoit
    //    automatiquement « Bonne nouvelle ! Votre logement est propre
    //    et prêt à vous accueillir plus tôt que prévu. » (email +
    //    bannière Hub + trace hôte — fire-and-forget, jamais bloquant).
    void notifyNextGuestReadyForArrival(property.id, slug).catch(() => undefined);

    // 6) v4.53 « RAPPORT DE CHECK-OUT » — le ménage de rotation vient
    //    de valider la preuve « appartement propre » : le rapport du
    //    séjour qui vient de se terminer est complété
    //    (« Preuve Ménage : Validée à 14h15 »). Fire-and-forget.
    void (async () => {
      const lastEnded = await db.booking.findFirst({
        where: {
          propertyId: property.id,
          status: { notIn: ['CANCELLED'] },
          checkOut: { lte: endedAt },
        },
        orderBy: { checkOut: 'desc' },
        select: { id: true },
      });
      if (lastEnded) {
        await refreshCheckoutReportForBooking(property.id, lastEnded.id);
      }
    })().catch(() => undefined);

    return NextResponse.json({
      success: true,
      id: report.id,
      timeLabel,
      message: `Ménage validé à ${timeLabel} — l'hôte a été prévenu. Merci !`,
    });
  } catch (error) {
    await captureError('hub.cleaning', error, undefined, req);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}
