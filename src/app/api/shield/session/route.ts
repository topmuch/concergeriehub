// =============================================================
// /api/shield/session — ROOMSCAN BOUCLIER AUTOMATISÉ (v5.1)
//
// POST : CHECK-IN ou CHECK-OUT en 90 secondes.
//   · 6 photos de zones aux mêmes angles (fantômes de référence) ;
//   · 1 vidéo walkthrough (jusqu'à 60 s — traversée continue des
//     zones, ≤ 22 Mo) dont le hash SHA-256 est calculé SERVEUR
//     (intégrité non falsifiable).
// Un CHECK_OUT est automatiquement LIÉ au dernier CHECK_IN du
// logement (PDF comparatif entrée vs sortie).
//
// Corps JSON :
// {
//   propertyId, type: 'CHECK_IN'|'CHECK_OUT', agentName,
//   guestName?, guestEmail?,              // optionnel — destinataires du PDF
//   shots: [{ zoneId, photo(dataURL), status, comment? } × 6],
//   video: { mimeType, durationSec, dataBase64 }
// }
// Réponse 201 : { ok:true, session:{ id, sessionRef, type,
//   completedAt, videoToken, videoSha256 }, pdfUrl, emailsQueued }
// Effet : le PDF final (bibliothèque + certificat) est envoyé
// AUTOMATIQUEMENT par email (pièce jointe) à l'hôte + à l'invité.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import {
  resolveShieldAccess,
  shieldPropertyOwned,
  decodePhotoDataUrl,
  decodeVideoBase64,
  MAX_VIDEO_BYTES,
} from '@/lib/shield-access';
import { sessionRef, randomPublicToken, SHIELD_ZONE_STATUSES } from '@/lib/shield-refs';
import { sendShieldSessionCertificateEmails } from '@/lib/shield-emails';

function bad(error: string, status = 400, message?: string) {
  return NextResponse.json({ error, message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const access = await resolveShieldAccess();
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error, message: access.message },
        { status: access.status },
      );
    }
    if (!(await rateLimit(`shield-session:${access.userId}`, 12))) {
      return bad('rate_limited', 429, 'Trop de tentatives — réessayez dans une minute.');
    }

    const body = (await req.json().catch(() => null)) as {
      propertyId?: unknown;
      type?: unknown;
      agentName?: unknown;
      guestName?: unknown;
      guestEmail?: unknown;
      shots?: unknown;
      video?: unknown;
    } | null;
    if (!body) return bad('corps_invalide');

    const propertyId = typeof body.propertyId === 'string' ? body.propertyId : '';
    const type = body.type === 'CHECK_OUT' ? 'CHECK_OUT' : body.type === 'CHECK_IN' ? 'CHECK_IN' : '';
    const agentName = typeof body.agentName === 'string' ? body.agentName.trim().slice(0, 80) : '';
    const guestName =
      typeof body.guestName === 'string' && body.guestName.trim()
        ? body.guestName.trim().slice(0, 80)
        : null;
    const guestEmailRaw =
      typeof body.guestEmail === 'string' && body.guestEmail.trim()
        ? body.guestEmail.trim().slice(0, 160)
        : '';
    const guestEmail = guestEmailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmailRaw) ? guestEmailRaw : null;
    if (!propertyId) return bad('logement_manquant');
    if (!type) return bad('type_invalide');
    if (!agentName) return bad('agent_manquant', 400, "Le nom de l'agent est obligatoire (traçabilité).");

    // ── Logement + zones ──
    const property = await shieldPropertyOwned(propertyId, access.subscriptionId);
    if (!property) return bad('not_found', 404);
    // TASK 39 — bien en délégation : bibliothèque pas encore verrouillée
    // → aucune session (les photos fantômes de référence n'existent pas).
    if (property.onboardingStatus === 'PENDING_PHOTOS') {
      return bad(
        'photos_en_attente',
        409,
        'Les photos de référence de ce logement ne sont pas encore reçues (délégation en cours).',
      );
    }

    // ── LECTURE SEULE (v4.120) : document généré = logement verrouillé ──
    // Dès qu'un certificat est généré, on ne peut plus refaire le même
    // contrôle : CHECK-IN bloqué tant que le cycle (entrée→sortie) n'est
    // pas terminé ; CHECK-OUT bloqué dès que la sortie de ce cycle existe.
    // Un nouveau CHECK-IN (nouveau séjour) rouvre un cycle après la sortie.
    const lastCheckIn = await db.shieldSession.findFirst({
      where: { propertyId, type: 'CHECK_IN' },
      orderBy: { completedAt: 'desc' },
      select: { id: true },
    });
    if (lastCheckIn) {
      const outLinked = await db.shieldSession.findFirst({
        where: { propertyId, type: 'CHECK_OUT', linkedSessionId: lastCheckIn.id },
        select: { id: true },
      });
      if (type === 'CHECK_IN' && !outLinked) {
        return bad(
          'lecture_seule',
          409,
          "Le document d'entrée de ce logement a déjà été généré — lecture seule. Un nouveau CHECK-IN sera possible après le CHECK-OUT.",
        );
      }
      if (type === 'CHECK_OUT' && outLinked) {
        return bad(
          'lecture_seule',
          409,
          'Le rapport de sortie a déjà été généré pour ce cycle — lecture seule. Faites un nouveau CHECK-IN pour démarrer un nouveau cycle.',
        );
      }
    }

    const zonesById = new Map(property.zones.map((z) => [z.id, z]));

    // ── Photos des zones : les 6 zones du logement, chacune une fois ──
    const shotsRaw = Array.isArray(body.shots) ? body.shots : [];
    if (shotsRaw.length !== property.zones.length) {
      return bad(
        'zones_manquantes',
        400,
        `Les ${property.zones.length} zones doivent être photographiées (${shotsRaw.length}/${property.zones.length}).`,
      );
    }
    const seenZoneIds = new Set<string>();
    const shots: {
      zoneId: string;
      zoneName: string;
      photo: string;
      status: string;
      comment: string | null;
    }[] = [];
    for (const s of shotsRaw) {
      const st = s as { zoneId?: unknown; photo?: unknown; status?: unknown; comment?: unknown };
      const zoneId = typeof st?.zoneId === 'string' ? st.zoneId : '';
      const zone = zonesById.get(zoneId);
      if (!zone) return bad('zone_inconnue');
      if (seenZoneIds.has(zoneId)) return bad('zone_dupliquee');
      seenZoneIds.add(zoneId);
      const photo = typeof st?.photo === 'string' ? st.photo : '';
      if (!decodePhotoDataUrl(photo)) return bad(`photo_invalide:${zone.name}`);
      const status =
        typeof st?.status === 'string' && (SHIELD_ZONE_STATUSES as readonly string[]).includes(st.status)
          ? st.status
          : 'IMPECCABLE';
      const comment =
        typeof st?.comment === 'string' && st.comment.trim() ? st.comment.trim().slice(0, 500) : null;
      if (status !== 'IMPECCABLE' && !comment) {
        return bad(
          'commentaire_requis',
          400,
          `Zone ${zone.name} : un commentaire est obligatoire si l'état n'est pas impeccable.`,
        );
      }
      shots.push({ zoneId, zoneName: zone.name, photo, status, comment });
    }

    // ── Vidéo walkthrough (preuve reine) ──
    const v = (body.video ?? {}) as { mimeType?: unknown; durationSec?: unknown; dataBase64?: unknown };
    const videoBuf = decodeVideoBase64(v.dataBase64, v.mimeType);
    if (!videoBuf) {
      return bad(
        'video_invalide',
        400,
        `Vidéo obligatoire (jusqu'à 60 s). Formats : webm/mp4 — max ${Math.round(MAX_VIDEO_BYTES / 1_000_000)} Mo.`,
      );
    }
    const durationSec =
      typeof v.durationSec === 'number' && Number.isFinite(v.durationSec)
        ? Math.min(180, Math.max(3, Math.round(v.durationSec)))
        : 60;

    // ── Liaison automatique au dernier CHECK_IN (pour comparatif) ──
    let linkedSessionId: string | null = null;
    if (type === 'CHECK_OUT') {
      const lastCheckIn = await db.shieldSession.findFirst({
        where: { propertyId, type: 'CHECK_IN' },
        orderBy: { completedAt: 'desc' },
        select: { id: true },
      });
      linkedSessionId = lastCheckIn?.id ?? null;
    }

    // ── Référence session (séquence du jour) + création ──
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayCount = await db.shieldSession.count({
      where: { propertyId, createdAt: { gte: dayStart } },
    });

    let created: {
      id: string;
      sessionRef: string;
      type: string;
      completedAt: Date;
    } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const videoToken = randomPublicToken();
      const ref = sessionRef(property.city, now, dayCount + 1 + attempt);
      try {
        created = await db.$transaction(async (tx) => {
          const sess = await tx.shieldSession.create({
            data: {
              propertyId,
              type,
              agentName,
              guestName,
              guestEmail,
              sessionRef: ref,
              linkedSessionId,
            },
          });
          await tx.shieldZoneShot.createMany({
            data: shots.map((s) => ({
              sessionId: sess.id,
              zoneId: s.zoneId,
              zoneName: s.zoneName,
              photo: s.photo,
              status: s.status,
              comment: s.comment,
            })),
          });
          await tx.shieldVideo.create({
            data: {
              sessionId: sess.id,
              publicToken: videoToken,
              mimeType: typeof v.mimeType === 'string' ? v.mimeType : 'video/webm',
              data: new Uint8Array(videoBuf),
              sizeBytes: videoBuf.length,
              durationSec,
              sha256: createHash('sha256').update(videoBuf).digest('hex'),
            },
          });
          return sess;
        });
        break;
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code !== 'P2002' || attempt === 4) throw e;
      }
    }

    const video = await db.shieldVideo.findUnique({
      where: { sessionId: created!.id },
      select: { publicToken: true, sha256: true },
    });

    // Envoi AUTOMATIQUE du PDF final à l'hôte + à l'invité (pièce
    // jointe) — fire-and-forget : ne bloque JAMAIS la réponse et ne
    // lève jamais (lib blindé).
    void sendShieldSessionCertificateEmails(created!.id, access.subscriptionId);

    return NextResponse.json(
      {
        ok: true,
        session: {
          id: created!.id,
          sessionRef: created!.sessionRef,
          type: created!.type,
          completedAt: created!.completedAt.toISOString(),
          videoToken: video?.publicToken ?? null,
          videoSha256: video?.sha256 ?? null,
        },
        pdfUrl: `/api/shield/pdf/session/${created!.id}`,
        emailsQueued: true,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('[shield/session] POST failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
