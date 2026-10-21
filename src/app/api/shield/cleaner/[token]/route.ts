// =============================================================
// /api/shield/cleaner/[token] — ROOMSCAN BOUCLIER V2 — FLUX A
//
// L'API de l'app cleaner : PAS DE COMPTE, le token magique
// (publicToken de la session planifiée) EST l'autorisation.
//
// GET  → état de la session (ready | done | cancelled) + zones
//        avec fantômes de référence (mode fantôme de l'app).
// POST → CONSOMME la session planifiée : mêmes validations que
//        /api/shield/session (photos une par zone, statut +
//        commentaire obligatoire si ≠ IMPECCABLE ; vidéo ≤ 22 Mo),
//        puis status → TERMINE, completedAt → maintenant,
//        agentName = nom saisi par le cleaner, shots + vidéo
//        scellée (hash SHA-256 SERVEUR), certificat PDF envoyé
//        AUTOMATIQUEMENT par email à l'hôte (+ invité si connu).
//        Un CHECK_OUT non lié est rattaché au dernier CHECK_IN
//        terminé (comparatif entrée/sortie du PDF).
//        Garde anti-course : updateMany conditionnel — une session
//        ne peut être consommée qu'UNE SEULE FOIS.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import {
  decodePhotoDataUrl,
  decodeVideoBase64,
  MAX_VIDEO_BYTES,
} from '@/lib/shield-access';
import { randomPublicToken, SHIELD_ZONE_STATUSES } from '@/lib/shield-refs';
import { loadCleanerSession } from '@/lib/shield-cleaner';
import { sendShieldSessionCertificateEmails } from '@/lib/shield-emails';

function bad(error: string, status = 400, message?: string) {
  return NextResponse.json({ error, message }, { status });
}

// ---------------- GET — état de la session planifiée ----------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const session = await loadCleanerSession(token);
    if (!session) return bad('not_found', 404, 'Lien invalide ou expiré.');

    if (session.status === 'TERMINE' || session.status === 'ANNULE') {
      return NextResponse.json({
        ok: true,
        state: session.status === 'TERMINE' ? 'done' : 'cancelled',
        session: {
          sessionRef: session.sessionRef,
          type: session.type,
          completedAt: session.completedAt,
          scheduledDate: session.scheduledDate,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      state: 'ready',
      session: {
        sessionRef: session.sessionRef,
        type: session.type,
        effectiveStatus: session.effectiveStatus,
        scheduledDate: session.scheduledDate,
        guestName: session.guestName,
        propertyName: session.propertyName,
        propertyAddress: session.propertyAddress,
        agentName: session.agentName,
      },
      zones: session.zones.map((z) => ({
        id: z.id,
        name: z.name,
        referencePhoto: z.referencePhoto,
      })),
    });
  } catch (err) {
    console.error('[shield/cleaner] GET failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

// ---------------- POST — capture complète → consomme ----------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!(await rateLimit(`shield-cleaner:${token}`, 10))) {
      return bad('rate_limited', 429, 'Trop de tentatives — réessayez dans une minute.');
    }

    // ── Session planifiée ? ──
    const planned = await loadCleanerSession(token);
    if (!planned) return bad('not_found', 404, 'Lien invalide ou expiré.');
    if (planned.status === 'TERMINE') {
      return bad('already_done', 409, 'Cette session a déjà été réalisée.');
    }
    if (planned.status === 'ANNULE') {
      return bad('cancelled', 409, 'Cette session a été annulée par l\u2019hôte.');
    }
    if (planned.zones.length === 0) {
      return bad(
        'aucune_zone',
        400,
        'Aucune zone de référence — demandez à votre hôte de finaliser le logement.',
      );
    }

    const body = (await req.json().catch(() => null)) as {
      agentName?: unknown;
      shots?: unknown;
      video?: unknown;
    } | null;
    if (!body) return bad('corps_invalide');

    const agentName = typeof body.agentName === 'string' ? body.agentName.trim().slice(0, 80) : '';
    if (agentName.length < 2) {
      return bad('agent_manquant', 400, 'Votre nom est obligatoire (traçabilité du document).');
    }

    // ── Photos des zones : chaque zone une fois, statut + commentaire ──
    const zonesById = new Map(planned.zones.map((z) => [z.id, z]));
    const shotsRaw = Array.isArray(body.shots) ? body.shots : [];
    if (shotsRaw.length !== planned.zones.length) {
      return bad(
        'zones_manquantes',
        400,
        `Les ${planned.zones.length} zones doivent être photographiées (${shotsRaw.length}/${planned.zones.length}).`,
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

    // ── Vidéo walkthrough (preuve reine, ≤ 120 s côté app) ──
    const v = (body.video ?? {}) as { mimeType?: unknown; durationSec?: unknown; dataBase64?: unknown };
    const videoBuf = decodeVideoBase64(v.dataBase64, v.mimeType);
    if (!videoBuf) {
      return bad(
        'video_invalide',
        400,
        `Vidéo obligatoire (jusqu'à 120 s). Formats : webm/mp4 — max ${Math.round(MAX_VIDEO_BYTES / 1_000_000)} Mo.`,
      );
    }
    const durationSec =
      typeof v.durationSec === 'number' && Number.isFinite(v.durationSec)
        ? Math.min(180, Math.max(3, Math.round(v.durationSec)))
        : 120;

    // ── Consommation atomique (anti double-envoi) ──
    const now = new Date();
    const consumed = await db.shieldSession.updateMany({
      where: { id: planned.id, publicToken: token, status: { notIn: ['TERMINE', 'ANNULE'] } },
      data: { status: 'TERMINE', completedAt: now, agentName },
    });
    if (consumed.count === 0) {
      return bad('already_done', 409, 'Cette session a déjà été réalisée.');
    }

    // ── Rattachement CHECK_OUT au dernier CHECK_IN terminé (comparatif PDF) ──
    let videoSha256 = '';
    try {
      if (planned.type === 'CHECK_OUT' && !planned.linkedSessionId) {
        const lastCheckIn = await db.shieldSession.findFirst({
          where: { propertyId: planned.propertyId, type: 'CHECK_IN', status: 'TERMINE' },
          orderBy: { completedAt: 'desc' },
          select: { id: true },
        });
        if (lastCheckIn) {
          await db.shieldSession.update({
            where: { id: planned.id },
            data: { linkedSessionId: lastCheckIn.id },
          });
        }
      }

      // ── Shots + vidéo scellée (hash SHA-256 SERVEUR) ──
      videoSha256 = createHash('sha256').update(videoBuf).digest('hex');
      await db.$transaction(async (tx) => {
        await tx.shieldZoneShot.createMany({
          data: shots.map((s) => ({
            sessionId: planned.id,
            zoneId: s.zoneId,
            zoneName: s.zoneName,
            photo: s.photo,
            status: s.status,
            comment: s.comment,
          })),
        });
        await tx.shieldVideo.create({
          data: {
            sessionId: planned.id,
            publicToken: randomPublicToken(),
            mimeType: typeof v.mimeType === 'string' ? v.mimeType : 'video/webm',
            data: new Uint8Array(videoBuf),
            sizeBytes: videoBuf.length,
            durationSec,
            sha256: videoSha256,
          },
        });
      });
    } catch (persistErr) {
      // La session est déjà consommée : si la persistance échoue, on
      // remet la session en A_VENIR pour permettre une nouvelle tentative.
      await db.shieldSession
        .updateMany({
          where: { id: planned.id, status: 'TERMINE', completedAt: now },
          data: { status: 'A_VENIR' },
        })
        .catch(() => undefined);
      throw persistErr;
    }

    // ── Email automatique : certificat PDF → hôte (+ invité) ──
    void sendShieldSessionCertificateEmails(planned.id, planned.subscriptionId);

    return NextResponse.json(
      {
        ok: true,
        session: {
          id: planned.id,
          sessionRef: planned.sessionRef,
          type: planned.type,
          completedAt: now.toISOString(),
          videoSha256,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('[shield/cleaner] POST failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
