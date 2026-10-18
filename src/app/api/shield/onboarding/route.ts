// =============================================================
// /api/shield/onboarding — ROOMSCAN BOUCLIER AUTOMATISÉ (v5.1)
//
// POST : ONBOARDING UNE FOIS (hôte, 10 min à vie).
// Crée la ShieldProperty + ses 6 zones (photos de référence =
// futurs fantômes d'angle) + ses appareils permanents
// (bibliothèque de référence : QR REF-xxx + hash SHA-256).
//
// Corps JSON :
// {
//   propertyName, propertyAddress, city, ownerName,
//   nbChambres?: number (0-8),
//   zones:   [{ name, photo(dataURL) } × 1..12],
//   devices: [{ name, kind, photo(dataURL) } × 1..20]
// }
// CONFIG DYNAMIQUE (wizard post-paiement) : pieces, equipementsCoches
// et nbPhotosMenage sont DÉRIVÉS CÔTÉ SERVEUR des zones/devices réels
// (source de vérité) — jamais de case vide « N/A » dans le PDF.
// Réponse 201 : { ok:true, property:{ id, onboardingRef } }
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { resolveShieldAccess, decodePhotoDataUrl } from '@/lib/shield-access';
import { onboardingRef, deviceRefCode, SHIELD_DEVICE_KINDS } from '@/lib/shield-refs';

const MAX_ZONES = 12;
const MAX_DEVICES = 20; // 14 équipements du wizard + marges (kinds CUSTOM)

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
    if (!(await rateLimit(`shield-onboarding:${access.userId}`, 6))) {
      return bad('rate_limited', 429, 'Trop de tentatives — réessayez dans une minute.');
    }

    const body = (await req.json().catch(() => null)) as {
      propertyName?: unknown;
      propertyAddress?: unknown;
      city?: unknown;
      ownerName?: unknown;
      nbChambres?: unknown;
      zones?: unknown;
      devices?: unknown;
    } | null;
    if (!body) return bad('corps_invalide');

    const propertyName = typeof body.propertyName === 'string' ? body.propertyName.trim() : '';
    const propertyAddress =
      typeof body.propertyAddress === 'string' ? body.propertyAddress.trim() : '';
    const city = typeof body.city === 'string' && body.city.trim() ? body.city.trim() : 'DAKAR';
    const ownerName = typeof body.ownerName === 'string' ? body.ownerName.trim() : '';
    if (!propertyName || propertyName.length > 120) return bad('nom_logement_invalide');
    if (!propertyAddress || propertyAddress.length > 240) return bad('adresse_invalide');
    if (!ownerName || ownerName.length > 120) return bad('proprietaire_invalide');

    // nbChambres (wizard : 0 = Studio, 3 = « 3 chambres+ »).
    const nbChambres =
      typeof body.nbChambres === 'number' && Number.isInteger(body.nbChambres)
        ? Math.min(8, Math.max(0, body.nbChambres))
        : 0;

    // ── Zones (6 fixes attendues) ──
    const zonesRaw = Array.isArray(body.zones) ? body.zones : [];
    if (zonesRaw.length < 1 || zonesRaw.length > MAX_ZONES) return bad('zones_invalide');
    const zones: { name: string; photo: string }[] = [];
    for (const z of zonesRaw) {
      const zt = z as { name?: unknown; photo?: unknown };
      const name = typeof zt?.name === 'string' ? zt.name.trim().slice(0, 60) : '';
      const photo = typeof zt?.photo === 'string' ? zt.photo : '';
      if (!name) return bad('zone_sans_nom');
      if (!decodePhotoDataUrl(photo)) return bad(`photo_zone_invalide:${name}`);
      zones.push({ name: name.toUpperCase(), photo });
    }

    // ── Appareils (bibliothèque de référence) ──
    const devicesRaw = Array.isArray(body.devices) ? body.devices : [];
    if (devicesRaw.length < 1 || devicesRaw.length > MAX_DEVICES) return bad('appareils_invalide');
    const validKinds = new Set<string>(SHIELD_DEVICE_KINDS.map((k) => k.kind));
    const devices: { name: string; kind: string; photo: string }[] = [];
    for (const d of devicesRaw) {
      const dt = d as { name?: unknown; kind?: unknown; photo?: unknown };
      const name = typeof dt?.name === 'string' ? dt.name.trim().slice(0, 80) : '';
      const kindRaw = typeof dt?.kind === 'string' ? dt.kind.toUpperCase() : '';
      const kind = validKinds.has(kindRaw) ? kindRaw : 'CUSTOM';
      const photo = typeof dt?.photo === 'string' ? dt.photo : '';
      if (!name) return bad('appareil_sans_nom');
      if (!decodePhotoDataUrl(photo)) return bad(`photo_appareil_invalide:${name}`);
      devices.push({ name, kind, photo });
    }

    // ── Référence onboarding (séquence par ville + année) ──
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const count = await db.shieldProperty.count({
      where: { city, onboardedAt: { gte: yearStart } },
    });

    const referenceDate = new Date();
    let property: { id: string; onboardingRef: string } | null = null;
    // Création avec retry sur collision de référence (P2002).
    for (let attempt = 0; attempt < 4; attempt++) {
      const ref = onboardingRef(city, count + 1 + attempt);
      try {
        const created = await db.$transaction(async (tx) => {
          const prop = await tx.shieldProperty.create({
            data: {
              subscriptionId: access.subscriptionId,
              propertyName,
              propertyAddress,
              city,
              ownerName,
              onboardingRef: ref,
              // Config dynamique dérivée des choix réels de l'hôte.
              nbChambres,
              pieces: JSON.stringify(zones.map((z) => z.name)),
              equipementsCoches: JSON.stringify(devices.map((d) => d.kind)),
              nbPhotosMenage: zones.length,
            },
          });
          await tx.shieldZone.createMany({
            data: zones.map((z, i) => ({
              propertyId: prop.id,
              name: z.name,
              referencePhoto: z.photo,
              sortOrder: i,
            })),
          });
          for (let i = 0; i < devices.length; i++) {
            const d = devices[i];
            const buf = Buffer.from(d.photo.replace(/^data:image\/\w+;base64,/, ''), 'base64');
            const hash = createHash('sha256').update(buf).digest('hex');
            await tx.shieldDevice.create({
              data: {
                propertyId: prop.id,
                name: d.name,
                kind: d.kind,
                referencePhoto: d.photo,
                referenceHash: hash,
                referenceCode: deviceRefCode(d.kind, referenceDate),
                referenceDate,
                sortOrder: i,
              },
            });
          }
          return prop;
        });
        property = { id: created.id, onboardingRef: created.onboardingRef };
        break;
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code !== 'P2002' || attempt === 3) throw e;
      }
    }

    return NextResponse.json({ ok: true, property }, { status: 201 });
  } catch (err) {
    console.error('[shield/onboarding] POST failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
