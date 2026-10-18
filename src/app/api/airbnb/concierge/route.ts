import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserRoleForProperty, resolveUserProperties } from '@/lib/b2b-server';
import { canManageTeam } from '@/lib/team';
import { mutationGuard, mutationKey } from '@/lib/mutation-guard';
import {
  parseAccessCodes,
  parseAppliances,
  parseEmergencyInfo,
  parseLocalSpots,
  parseShopItems,
  parseVoiceTriggers,
  SPOT_CATEGORY_META,
} from '@/lib/concierge';

// =============================================================
// DIGITAL CONCIERGE (V4.1) — ÉDITEURS CÔTÉ HÔTE : les 4 modules.
//   GET   /api/airbnb/concierge?propertyId=?
//     → biens accessibles + contenu des 4 modules (parsé)
//   PATCH /api/airbnb/concierge?propertyId=?
//     { accessCodes?, appliances?, localSpots?, emergencyInfo? }
//     → validation stricte (messages FR explicites) puis stockage
//       via les parseurs tolérants de src/lib/concierge.ts (source
//       de vérité des formes JSON — identiques à celles servies à
//       l'app invitée /api/public/guest-app).
//
// Auth : session NextAuth + OWNER/MANAGER uniquement (les codes
// d'accès sont sensibles — CLEANER/MAINTENANCE n'y accèdent pas).
// IDs en QUERY PARAM (règle sandbox). Never-throw.
// =============================================================

const MAX_APPLIANCES = 40;
const MAX_SPOTS = 60;
const MAX_ISSUES = 12;

async function requireManager(propertyId: string, userId: string) {
  const role = await getUserRoleForProperty(userId, propertyId);
  if (!role) {
    return { ok: false as const, status: 403, message: 'Accès refusé' };
  }
  if (!canManageTeam(role)) {
    return {
      ok: false as const,
      status: 403,
      message: 'Seuls le propriétaire et le co-hôte peuvent gérer la conciergerie.',
    };
  }
  return { ok: true as const };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const properties = await resolveUserProperties(userId);
    if (properties.length === 0) {
      return NextResponse.json({ properties: [], property: null, concierge: null });
    }

    const { searchParams } = new URL(req.url);
    const requestedId = (searchParams.get('propertyId') || '').trim();
    const property = properties.find((p) => p.id === requestedId) ?? properties[0];

    const guard = await requireManager(property.id, userId);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.message }, { status: guard.status });
    }

    const full = await db.property.findUnique({
      where: { id: property.id },
      select: {
        qrHubSlug: true,
        accessCodes: true,
        appliances: true,
        localSpots: true,
        emergencyInfo: true,
        premiumFeatures: true,
      },
    });
    if (!full) {
      return NextResponse.json({ error: 'Bien introuvable' }, { status: 404 });
    }

    const pf = full.premiumFeatures;
    const customShop =
      pf && typeof pf === 'object' && !Array.isArray(pf)
        ? (pf as Record<string, unknown>).shop
        : undefined;
    const hasCustomShop =
      !!customShop &&
      typeof customShop === 'object' &&
      Array.isArray((customShop as Record<string, unknown>).items);

    return NextResponse.json({
      properties: properties.map((p) => ({ id: p.id, name: p.name })),
      property: { id: property.id, name: property.name, qrHubSlug: full.qrHubSlug },
      concierge: {
        accessCodes: parseAccessCodes(full.accessCodes),
        appliances: parseAppliances(full.appliances),
        localSpots: parseLocalSpots(full.localSpots),
        emergencyInfo: parseEmergencyInfo(full.emergencyInfo),
        // v4.42 — boutique « Shop the Stay » (produits de l'hôte) + horaires
        // de déclenchement des messages vocaux (veille / jour du départ).
        shopItems: parseShopItems(full.premiumFeatures),
        hasCustomShop: hasCustomShop,
        voiceTriggers: parseVoiceTriggers(full.premiumFeatures),
      },
    });
  } catch (error) {
    console.error('[airbnb/concierge GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── Validateurs d'entrée (messages FR explicites pour l'éditeur) ──

function validateCodesInput(raw: unknown): string | null {
  if (raw === null) return null; // effacement complet explicite
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'Format des codes invalide.';
  return null;
}

function validateAppliancesInput(raw: unknown): string | null {
  if (!Array.isArray(raw)) return 'Liste d’appareils invalide.';
  if (raw.length > MAX_APPLIANCES) return `Maximum ${MAX_APPLIANCES} appareils.`;
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return 'Appareil invalide.';
    const o = item as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const instructions = typeof o.instructions === 'string' ? o.instructions.trim() : '';
    if (!name || !instructions) {
      return 'Chaque appareil doit avoir un nom ET des instructions.';
    }
  }
  return null;
}

function validateSpotsInput(raw: unknown): string | null {
  if (!Array.isArray(raw)) return 'Liste d’adresses invalide.';
  if (raw.length > MAX_SPOTS) return `Maximum ${MAX_SPOTS} adresses.`;
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return 'Adresse invalide.';
    const o = item as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const lat = typeof o.lat === 'number' ? o.lat : NaN;
    const lng = typeof o.lng === 'number' ? o.lng : NaN;
    if (!name) return 'Chaque adresse doit avoir un nom.';
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) {
      return `Coordonnées invalides pour « ${name} » (ex : 48.8566 / 2.3522).`;
    }
    if (typeof o.category === 'string' && !(o.category in SPOT_CATEGORY_META)) {
      return `Catégorie inconnue pour « ${name} ».`;
    }
  }
  return null;
}

function validateEmergencyInput(raw: unknown): string | null {
  if (raw === null) return null; // effacement complet explicite
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'Format SOS invalide.';
  const o = raw as Record<string, unknown>;
  if (o.commonIssues !== undefined && !Array.isArray(o.commonIssues)) {
    return 'Liste des pannes courantes invalide.';
  }
  if (Array.isArray(o.commonIssues)) {
    if (o.commonIssues.length > MAX_ISSUES) return `Maximum ${MAX_ISSUES} pannes courantes.`;
    for (const item of o.commonIssues) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return 'Panne invalide.';
      const iss = item as Record<string, unknown>;
      const title = typeof iss.title === 'string' ? iss.title.trim() : '';
      const instructions = typeof iss.instructions === 'string' ? iss.instructions.trim() : '';
      if (!title || !instructions) {
        return 'Chaque panne doit avoir un titre ET des instructions.';
      }
    }
  }
  for (const key of ['hospitalLat', 'hospitalLng'] as const) {
    const v = o[key];
    if (v !== undefined && v !== null && (typeof v !== 'number' || !Number.isFinite(v))) {
      return 'Coordonnées de l’hôpital invalides.';
    }
  }
  return null;
}

// v4.42 — Boutique « Shop the Stay » : les produits de l'hôte remplacent
// le catalogue par défaut (8 max). `null` = retour au catalogue démo.
const MAX_SHOP_ITEMS = 8;

function validateShopItemsInput(raw: unknown): string | null {
  if (raw === null) return null; // effacement explicite → catalogue par défaut
  if (!Array.isArray(raw)) return 'Liste de produits invalide.';
  if (raw.length > MAX_SHOP_ITEMS) return `Maximum ${MAX_SHOP_ITEMS} produits.`;
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return 'Produit invalide.';
    const o = item as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!name) return 'Chaque produit doit avoir un nom.';
    const price = typeof o.price === 'number' ? o.price : NaN;
    if (!Number.isFinite(price) || price <= 0 || price > 1000) {
      return `Prix invalide pour « ${name} » (entre 0,01 € et 1 000 €).`;
    }
    if (o.url !== undefined && o.url !== null && o.url !== '') {
      if (typeof o.url !== 'string' || !/^https:\/\/\S+$/.test(o.url.trim())) {
        return `Lien marchand invalide pour « ${name} » (https://… attendu).`;
      }
    }
  }
  return null;
}

function validateVoiceTriggersInput(raw: unknown): string | null {
  if (raw === null) return null; // retour aux défauts (20 h / 9 h)
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'Format des horaires invalide.';
  const o = raw as Record<string, unknown>;
  for (const key of ['eveHour', 'dayHour'] as const) {
    const v = o[key];
    const n = typeof v === 'number' ? v : NaN;
    if (!Number.isInteger(n) || n < 0 || n > 23) {
      return 'Chaque horaire doit être une heure entière entre 0 et 23.';
    }
  }
  return null;
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    // FIX-15 — anti-abus : 30 mutations/min par hôte (userId, sinon IP).
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const { searchParams } = new URL(req.url);
    const propertyId = (searchParams.get('propertyId') || '').trim();
    if (!propertyId) {
      return NextResponse.json({ error: 'Bien manquant' }, { status: 400 });
    }
    const guard = await requireManager(propertyId, userId);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.message }, { status: guard.status });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
    }

    const data: Record<string, unknown> = {};

    if ('accessCodes' in body) {
      const err = validateCodesInput(body.accessCodes);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      data.accessCodes = parseAccessCodes(body.accessCodes); // null si vide
    }
    if ('appliances' in body) {
      const err = validateAppliancesInput(body.appliances);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      data.appliances = parseAppliances(body.appliances);
    }
    if ('localSpots' in body) {
      const err = validateSpotsInput(body.localSpots);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      data.localSpots = parseLocalSpots(body.localSpots);
    }
    if ('emergencyInfo' in body) {
      const err = validateEmergencyInput(body.emergencyInfo);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      data.emergencyInfo = parseEmergencyInfo(body.emergencyInfo); // null si vide
    }

    // v4.42 — Shop the Stay (premiumFeatures.shop.items) et horaires des
    // vocaux (premiumFeatures.voiceTriggers) : JSON merge read-modify-write
    // (premiumFeatures porte aussi vidéo de bienvenue, départ tardif…).
    let shopPatch: unknown;
    let voicePatch: unknown;
    if ('shopItems' in body) {
      const err = validateShopItemsInput(body.shopItems);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      shopPatch = body.shopItems;
    }
    if ('voiceTriggers' in body) {
      const err = validateVoiceTriggersInput(body.voiceTriggers);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      voicePatch = body.voiceTriggers;
    }
    if (shopPatch !== undefined || voicePatch !== undefined) {
      const current = await db.property.findUnique({
        where: { id: propertyId },
        select: { premiumFeatures: true },
      });
      const pf: Record<string, unknown> =
        current?.premiumFeatures && typeof current.premiumFeatures === 'object' && !Array.isArray(current.premiumFeatures)
          ? { ...(current.premiumFeatures as Record<string, unknown>) }
          : {};
      if (shopPatch !== undefined) {
        if (shopPatch === null) {
          delete pf.shop; // retour au catalogue par défaut
        } else {
          pf.shop = { items: shopPatch };
        }
      }
      if (voicePatch !== undefined) {
        if (voicePatch === null) {
          delete pf.voiceTriggers;
        } else {
          const vp = voicePatch as Record<string, unknown>;
          pf.voiceTriggers = {
            eveHour: Math.min(23, Math.max(0, Math.round(Number(vp.eveHour)))),
            dayHour: Math.min(23, Math.max(0, Math.round(Number(vp.dayHour)))),
          };
        }
      }
      data.premiumFeatures = pf;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Aucune modification fournie.' }, { status: 400 });
    }

    await db.property.update({ where: { id: propertyId }, data });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[airbnb/concierge PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
