// =============================================================
// /api/delegation/submit — DÉLÉGATION ONBOARDING (TASK 39, v4.154)
//
// POST PUBLIC (aucune auth — l'équipe n'a que le lien magique).
// Corps JSON :
// {
//   token:        string (delegationToken du lien /upload/[token]),
//   zonePhotos:   { [zoneId]: dataURL } — TOUTES les zones,
//   devicePhotos: { [deviceId]: dataURL } — TOUS les appareils
// }
//
// Traitements (transaction) :
//   1. vérifie token + statut PENDING_PHOTOS + expiration 7 jours ;
//   2. valide chaque photo (decodePhotoDataUrl, ≤ 1,6 Mo) ;
//   3. stocke chaque photo + hash SHA-256 (zones ET appareils) ;
//   4. passe le bien en onboardingStatus = 'COMPLETED'
//      (bibliothèque verrouillée — le PDF ONB /api/shield/pdf/
//      onboarding/[id] est disponible immédiatement) ;
//   5. email de confirmation au propriétaire (template « Photos de
//      référence reçues et certifiées » + CTA dashboard Bouclier),
//      via queueEmail (fire-and-forget, jamais bloquant).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { decodePhotoDataUrl } from '@/lib/shield-access';
import { queueEmail } from '@/lib/email';
import { siteUrl } from '@/lib/site';

function bad(error: string, status = 400, message?: string) {
  return NextResponse.json({ error, message }, { status });
}

/** IP client (derrrière proxy Coolify/Caddy → x-forwarded-for). */
function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    'local'
  );
}

export async function POST(req: NextRequest) {
  try {
    // Endpoint public → rate limit par IP (10/min, fenêtre 60 s).
    if (!(await rateLimit(`delegation-submit:${clientIp(req)}`, 10))) {
      return bad('rate_limited', 429, 'Trop de tentatives — réessayez dans une minute.');
    }

    const body = (await req.json().catch(() => null)) as {
      token?: unknown;
      zonePhotos?: unknown;
      devicePhotos?: unknown;
    } | null;
    if (!body) return bad('corps_invalide');

    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token || token.length > 128) return bad('token_invalide');

    // ── 1. Bien + expiration + statut ──
    const property = await db.shieldProperty.findUnique({
      where: { delegationToken: token },
      include: {
        zones: { orderBy: { sortOrder: 'asc' } },
        devices: { orderBy: { sortOrder: 'asc' } },
        subscription: { include: { user: { select: { id: true, email: true, fullName: true } } } },
      },
    });
    if (!property) return bad('token_invalide', 404, 'Lien invalide.');
    if (property.onboardingStatus !== 'PENDING_PHOTOS') {
      return bad('deja_traite', 409, 'Les photos ont déjà été envoyées pour ce logement.');
    }
    if (property.delegationTokenExpiresAt && property.delegationTokenExpiresAt.getTime() < Date.now()) {
      return bad('lien_expire', 410, 'Ce lien a expiré — demandez un nouveau lien au propriétaire.');
    }

    // ── 2. Validation des photos (TOUTES les zones + TOUS les appareils) ──
    const zonePhotosRaw = (body.zonePhotos ?? {}) as Record<string, unknown>;
    const devicePhotosRaw = (body.devicePhotos ?? {}) as Record<string, unknown>;
    const zonePhotos: { id: string; dataUrl: string }[] = [];
    for (const z of property.zones) {
      const p = zonePhotosRaw[z.id];
      if (typeof p !== 'string' || !decodePhotoDataUrl(p)) {
        return bad('photo_manquante', 400, `Photo manquante ou invalide pour la zone « ${z.name} ».`);
      }
      zonePhotos.push({ id: z.id, dataUrl: p });
    }
    const devicePhotos: { id: string; dataUrl: string }[] = [];
    for (const d of property.devices) {
      const p = devicePhotosRaw[d.id];
      if (typeof p !== 'string' || !decodePhotoDataUrl(p)) {
        return bad('photo_manquante', 400, `Photo manquante ou invalide pour l'appareil « ${d.name} ».`);
      }
      devicePhotos.push({ id: d.id, dataUrl: p });
    }

    // ── 3+4. Stockage + hash SHA-256 + statut COMPLETED ──
    const referenceDate = new Date();
    await db.$transaction(async (tx) => {
      for (const z of zonePhotos) {
        const buf = Buffer.from(z.dataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        await tx.shieldZone.update({
          where: { id: z.id },
          data: {
            referencePhoto: z.dataUrl,
            referenceHash: createHash('sha256').update(buf).digest('hex'),
          },
        });
      }
      for (const d of devicePhotos) {
        const buf = Buffer.from(d.dataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        await tx.shieldDevice.update({
          where: { id: d.id },
          data: {
            referencePhoto: d.dataUrl,
            referenceHash: createHash('sha256').update(buf).digest('hex'),
            referenceDate,
          },
        });
      }
      await tx.shieldProperty.update({
        where: { id: property.id },
        data: { onboardingStatus: 'COMPLETED' },
      });
    });

    // ── 5. Email de confirmation au propriétaire (SaaS premium) ──
    const owner = property.subscription.user;
    const nbPhotos = zonePhotos.length + devicePhotos.length;
    const dashboardUrl = `${siteUrl}/inspection/dashboard`;
    const firstName = (owner.fullName ?? '').trim().split(/\s+/)[0] || '';
    try {
      await queueEmail({
        to: owner.email,
        subject: `✅ Photos de référence reçues et certifiées - ${property.propertyName}`,
        html:
          `<p style="margin:0 0 12px">Bonjour${firstName ? ` <strong>${firstName}</strong>` : ''},</p>` +
          `<p style="margin:0 0 12px">Nous vous confirmons que votre équipe a bien terminé l'upload des photos de référence pour le logement <strong>« ${property.propertyName} »</strong>.</p>` +
          `<p style="margin:0 0 12px"><strong>Ce qui a été fait automatiquement par Roomscan Bouclier :</strong></p>` +
          `<ul style="margin:0 0 14px;padding-left:20px">` +
          `<li style="margin-bottom:4px">✅ ${nbPhotos} photos reçues et sécurisées.</li>` +
          `<li style="margin-bottom:4px">✅ Hash SHA-256 généré pour chaque image.</li>` +
          `<li style="margin-bottom:4px">✅ Bibliothèque de référence verrouillée.</li>` +
          `<li style="margin-bottom:4px">✅ PDF de conformité (ONB) généré.</li>` +
          `</ul>` +
          `<p style="margin:0 0 16px">Votre logement est maintenant <strong>100&nbsp;% prêt à recevoir des états des lieux</strong>.</p>` +
          `<p style="margin:0 0 16px"><a href="${dashboardUrl}" style="display:inline-block;background:#C21F26;color:#fff;padding:12px 20px;border-radius:12px;font-weight:700;text-decoration:none">Voir mon PDF et ma Bibliothèque</a></p>` +
          `<p style="margin:0 0 8px;color:#64748b;font-size:13px">Référence du bien : ${property.onboardingRef} — bibliothèque verrouillée le ${referenceDate.toLocaleDateString('fr-FR')}.</p>` +
          `<p style="margin:12px 0 0;color:#94a3b8;font-size:12px">Cordialement,<br/>L'équipe Roomscan Bouclier</p>`,
        text:
          `Bonjour${firstName ? ` ${firstName}` : ''},\n\n` +
          `Votre équipe a terminé l'upload des photos de référence pour « ${property.propertyName} ».\n\n` +
          `Ce qui a été fait automatiquement par Roomscan Bouclier :\n` +
          `- ✅ ${nbPhotos} photos reçues et sécurisées\n` +
          `- ✅ Hash SHA-256 généré pour chaque image\n` +
          `- ✅ Bibliothèque de référence verrouillée\n` +
          `- ✅ PDF de conformité (ONB) généré\n\n` +
          `Votre logement est maintenant 100 % prêt à recevoir des états des lieux.\n` +
          `Voir mon PDF et ma Bibliothèque : ${dashboardUrl}\n\n` +
          `Cordialement,\nL'équipe Roomscan Bouclier`,
        template: 'custom',
        userId: owner.id,
        referenceType: 'shield_delegation',
        referenceId: property.id,
        meta: { onboardingRef: property.onboardingRef, nbPhotos },
      });
    } catch (e) {
      // Fire-and-forget : un échec email ne casse JAMAIS la réception.
      console.error('[delegation/submit] email non envoyé:', e);
    }

    return NextResponse.json({
      ok: true,
      nbPhotos,
      property: { onboardingRef: property.onboardingRef, propertyName: property.propertyName },
    });
  } catch (err) {
    console.error('[delegation/submit] POST failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
