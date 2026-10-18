import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserRoleForProperty, resolveUserProperties } from '@/lib/b2b-server';
import { canManageTeam } from '@/lib/team';
import { mutationGuard, mutationKey } from '@/lib/mutation-guard';
import {
  parsePremiumFeatures,
  parseMinibar,
  parseSurvivalKit,
  parseVisualGuide,
} from '@/lib/concierge';

// =============================================================
// PREMIUM « CONCIERGERIE 5 ÉTOILES » (V5) — configuration côté hôte.
//   GET   /api/airbnb/properties/[id]/premium
//     → biens accessibles (sélecteur) + 3 modules premium parsés
//   PATCH /api/airbnb/properties/[id]/premium
//     { premiumFeatures?, visualGuide?, survivalKitItems? }
//     → validation stricte (messages FR explicites) puis stockage
//       via les parseurs de src/lib/concierge.ts (source de vérité
//       des formes JSON — identiques à celles servies à l'app
//       invitée /api/public/guest-app).
//
// Auth : session NextAuth + OWNER/MANAGER (upselling et bouclier
// d'avis = réglages business — CLEANER/MAINTENANCE exclus).
// Never-throw. Le PATCH accepte les 3 champs OU un sous-ensemble
// (seuls les champs présents dans le body sont mis à jour).
// =============================================================

const MAX_STEPS = 12;
const MAX_KIT_ITEMS = 30;

type Ctx = { params: Promise<{ id: string }> };

async function requireManager(propertyId: string, userId: string) {
  const role = await getUserRoleForProperty(userId, propertyId);
  if (!role) {
    return { ok: false as const, status: 403, message: 'Accès refusé' };
  }
  if (!canManageTeam(role)) {
    return {
      ok: false as const,
      status: 403,
      message: 'Seuls le propriétaire et le co-hôte peuvent gérer l’expérience invité.',
    };
  }
  return { ok: true as const };
}

// ── Validateurs d'entrée (messages FR explicites pour l'éditeur) ──

const MAX_MINIBAR_ITEMS = 20;

function validateMinibarItemsInput(raw: unknown): string | null {
  if (raw === null) return null; // retour au catalogue d'exemple
  if (!Array.isArray(raw)) return 'Liste du minibar invalide.';
  if (raw.length > MAX_MINIBAR_ITEMS) {
    return `Maximum ${MAX_MINIBAR_ITEMS} articles dans le minibar.`;
  }
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return 'Article invalide.';
    const o = item as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!name) return 'Chaque article doit avoir un nom.';
    if (name.length > 60) return `Nom trop long pour « ${name.slice(0, 20)}… » (60 caractères max).`;
    const price = o.price;
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > 500) {
      return `Prix invalide pour « ${name} » (entre 0,50 et 500 €).`;
    }
    if (o.emoji !== undefined && o.emoji !== null && typeof o.emoji !== 'string') {
      return 'Emoji invalide.';
    }
    // v4.47 — photo produit optionnelle (URL /uploads, http(s) ou data-URL).
    if (o.photo !== undefined && o.photo !== null) {
      if (typeof o.photo !== 'string' || o.photo.length > 500) {
        return 'Photo du minibar invalide (URL trop longue).';
      }
      if (!/^(https?:\/\/|\/|data:image\/)/.test(o.photo.trim())) {
        return 'Photo du minibar invalide (URL attendue).';
      }
    }
    // v4.50 « PACK DE BIENVENUE » — article offert (booléen optionnel).
    if (o.free !== undefined && o.free !== null && typeof o.free !== 'boolean') {
      return 'L’option « offert » doit être activée ou désactivée.';
    }
  }
  return null;
}

function validatePremiumFeaturesInput(raw: unknown): string | null {
  if (raw === null) return null; // effacement complet explicite
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'Format des options premium invalide.';
  const o = raw as Record<string, unknown>;
  for (const key of ['videoWelcomeUrl', 'reviewUrl'] as const) {
    const v = o[key];
    if (v !== undefined && v !== null) {
      if (typeof v !== 'string' || !v.trim()) {
        return 'URL invalide.';
      }
      if (!/^https?:\/\//.test(v.trim()) && !v.trim().startsWith('/')) {
        return 'Collez un lien vidéo public (YouTube, Vimeo ou Loom) commençant par https://.';
      }
      if (v.trim().length > 500) {
        return 'URL trop longue (500 caractères max).';
      }
    }
  }
  for (const key of ['enableLateCheckout', 'enableReviewShield'] as const) {
    const v = o[key];
    if (v !== undefined && v !== null && typeof v !== 'boolean') {
      return 'Les options doivent être activées ou désactivées (true/false).';
    }
  }
  const price = o.lateCheckoutPrice;
  if (price !== undefined && price !== null) {
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > 1000) {
      return 'Prix du late check-out invalide (entre 1 et 1000 €).';
    }
  }
  // v4.44 — heure de fin du départ tardif (12–18 h).
  const hour = o.lateCheckoutHour;
  if (hour !== undefined && hour !== null) {
    if (typeof hour !== 'number' || !Number.isFinite(hour) || hour < 12 || hour > 18) {
      return 'Heure de départ tardif invalide (entre 12 et 18 h).';
    }
  }
  for (const key of ['enableMinibar'] as const) {
    const v = o[key];
    if (v !== undefined && v !== null && typeof v !== 'boolean') {
      return 'Les options doivent être activées ou désactivées (true/false).';
    }
  }
  // v4.50 « VERROUILLAGE DU HUB PAR CODE » — validation de { hubLock }.
  if (o.hubLock !== undefined && o.hubLock !== null) {
    if (typeof o.hubLock !== 'object' || Array.isArray(o.hubLock)) {
      return 'Format du verrouillage du hub invalide.';
    }
    const hl = o.hubLock as Record<string, unknown>;
    if (hl.enabled !== undefined && typeof hl.enabled !== 'boolean') {
      return 'Le verrouillage doit être activé ou désactivé.';
    }
    if (hl.checkoutInstructions !== undefined && hl.checkoutInstructions !== null) {
      if (typeof hl.checkoutInstructions !== 'string' || hl.checkoutInstructions.trim().length > 600) {
        return 'Consignes de départ trop longues (600 caractères max).';
      }
    }
    if (hl.allowLateRequest !== undefined && hl.allowLateRequest !== null && typeof hl.allowLateRequest !== 'boolean') {
      return 'L’option « départ tardif » doit être activée ou désactivée.';
    }
  }
  return null;
}

function validateVisualGuideInput(raw: unknown): string | null {
  if (raw === null) return null; // effacement complet explicite
  if (!Array.isArray(raw)) return 'Liste des étapes invalide.';
  if (raw.length > MAX_STEPS) return `Maximum ${MAX_STEPS} étapes pour le guide visuel.`;
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return 'Étape invalide.';
    const o = item as Record<string, unknown>;
    const title = typeof o.title === 'string' ? o.title.trim() : '';
    if (!title) return 'Chaque étape doit avoir un titre.';
    if (typeof o.description === 'string' && o.description.trim().length > 280) {
      return `Description trop longue pour « ${title} » (280 caractères max).`;
    }
  }
  return null;
}

function validateSurvivalKitInput(raw: unknown): string | null {
  if (raw === null) return null; // effacement complet explicite
  if (!Array.isArray(raw)) return 'Liste du kit de survie invalide.';
  if (raw.length > MAX_KIT_ITEMS) return `Maximum ${MAX_KIT_ITEMS} objets dans le kit de survie.`;
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return 'Objet invalide.';
    const o = item as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!name) return 'Chaque objet du kit doit avoir un nom.';
    if (typeof o.location === 'string' && o.location.trim().length > 120) {
      return `Emplacement trop long pour « ${name} » (120 caractères max).`;
    }
  }
  return null;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { id } = await ctx.params;
    const properties = await resolveUserProperties(userId);
    if (properties.length === 0) {
      return NextResponse.json({ properties: [], property: null, premium: null });
    }

    const guard = await requireManager(id, userId);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.message }, { status: guard.status });
    }

    const property = properties.find((p) => p.id === id);
    if (!property) {
      return NextResponse.json({ error: 'Bien introuvable' }, { status: 404 });
    }

    const full = await db.property.findUnique({
      where: { id },
      select: {
        qrHubSlug: true,
        premiumFeatures: true,
        visualGuide: true,
        survivalKitItems: true,
      },
    });
    if (!full) {
      return NextResponse.json({ error: 'Bien introuvable' }, { status: 404 });
    }

    return NextResponse.json({
      properties: properties.map((p) => ({ id: p.id, name: p.name })),
      property: { id: property.id, name: property.name, qrHubSlug: full.qrHubSlug },
      premium: {
        premiumFeatures: parsePremiumFeatures(full.premiumFeatures),
        // v4.44 — minibar exposé séparément (items parsés pour l'éditeur).
        minibar: parseMinibar(full.premiumFeatures),
        visualGuide: parseVisualGuide(full.visualGuide),
        survivalKitItems: parseSurvivalKit(full.survivalKitItems),
      },
    });
  } catch (error) {
    console.error('[airbnb/properties/[id]/premium GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    // FIX-15 — anti-abus : 30 mutations/min par hôte (userId, sinon IP).
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const { id } = await ctx.params;
    const guard = await requireManager(id, userId);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.message }, { status: guard.status });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
    }

    const data: Record<string, unknown> = {};

    if ('premiumFeatures' in body) {
      const err = validatePremiumFeaturesInput(body.premiumFeatures);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      const minibarErr =
        'minibarItems' in body ? validateMinibarItemsInput(body.minibarItems) : null;
      if (minibarErr) return NextResponse.json({ error: minibarErr }, { status: 400 });
      // v4.50 — photo du minibar rempli (inventaire d'arrivée) : data-URL
      // ou URL, plafond généreux (photo compressée côté client ~400 Ko).
      const arrivalPhoto = body.minibarArrivalPhoto;
      if (
        arrivalPhoto !== undefined &&
        arrivalPhoto !== null &&
        (typeof arrivalPhoto !== 'string' ||
          arrivalPhoto.length > 500_000 ||
          !/^(https?:\/\/|\/|data:image\/)/.test(arrivalPhoto.trim()))
      ) {
        return NextResponse.json({ error: 'Photo du minibar invalide.' }, { status: 400 });
      }

      if (body.premiumFeatures === null) {
        // Effacement complet explicite (l'écran est remis à zéro).
        data.premiumFeatures = null;
      } else {
        // v4.44 — MERGE read-modify-write : premiumFeatures porte AUSSI
        // la boutique (shop), les horaires vocaux (voiceTriggers) et le
        // minibar — un save de cet écran ne doit JAMAIS les écraser.
        const current = await db.property.findUnique({
          where: { id },
          select: { premiumFeatures: true },
        });
        const pf: Record<string, unknown> =
          current?.premiumFeatures &&
          typeof current.premiumFeatures === 'object' &&
          !Array.isArray(current.premiumFeatures)
            ? { ...(current.premiumFeatures as Record<string, unknown>) }
            : {};
        const patch = body.premiumFeatures as Record<string, unknown>;

        // 1. Retire les clés gérées par CET écran, puis réinjecte les
        //    valeurs validées (parsePremiumFeatures = source de vérité).
        for (const k of [
          'videoWelcomeUrl',
          'enableLateCheckout',
          'lateCheckoutPrice',
          'lateCheckoutHour',
          'enableReviewShield',
          'reviewUrl',
          'directBookingUrl',
          'directBookingDiscount',
          'enableMinibar',
          'hubLock',
          'checkoutAudioUrl',
        ]) {
          delete pf[k];
        }
        const parsed = parsePremiumFeatures(body.premiumFeatures);
        if (parsed) Object.assign(pf, parsed);

        // 1-bis. v4.50 « VERROUILLAGE DU HUB PAR CODE » — géré
        //         explicitement (désactivé = clé supprimée) car
        //         parsePremiumFeatures ne renvoie hubLock que si
        //         enabled === true.
        const patchLock = patch.hubLock;
        if (patchLock && typeof patchLock === 'object' && !Array.isArray(patchLock)) {
          const hl = patchLock as Record<string, unknown>;
          if (hl.enabled === true) {
            const instructions =
              typeof hl.checkoutInstructions === 'string'
                ? hl.checkoutInstructions.trim().slice(0, 600)
                : '';
            pf.hubLock = {
              enabled: true,
              ...(instructions ? { checkoutInstructions: instructions } : {}),
              ...(hl.allowLateRequest !== false ? { allowLateRequest: true } : {}),
            };
          }
        }

        // 2. Minibar : activé/désactivé + catalogue (items) — merge.
        const mb =
          pf.minibar && typeof pf.minibar === 'object' && !Array.isArray(pf.minibar)
            ? { ...(pf.minibar as Record<string, unknown>) }
            : {};
        if ('enableMinibar' in patch) {
          if (patch.enableMinibar === true) {
            mb.enabled = true;
            pf.minibar = mb;
          } else {
            delete pf.minibar;
          }
        }
        if ('minibarItems' in body) {
          if (body.minibarItems === null) {
            delete mb.items; // retour au catalogue d'exemple
          } else {
            mb.items = body.minibarItems;
          }
          if (mb.enabled) {
            pf.minibar = mb;
          }
        }
        // v4.50 — photo du minibar rempli (inventaire d'arrivée).
        if (arrivalPhoto !== undefined) {
          if (arrivalPhoto === null || arrivalPhoto === '') {
            delete mb.arrivalPhoto;
          } else {
            mb.arrivalPhoto = (arrivalPhoto as string).trim();
          }
          if (mb.enabled) {
            pf.minibar = mb;
          }
        }

        data.premiumFeatures = pf;
      }
    }
    if ('visualGuide' in body) {
      const err = validateVisualGuideInput(body.visualGuide);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      data.visualGuide = parseVisualGuide(body.visualGuide); // [] si vide
    }
    if ('survivalKitItems' in body) {
      const err = validateSurvivalKitInput(body.survivalKitItems);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      data.survivalKitItems = parseSurvivalKit(body.survivalKitItems); // [] si vide
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Aucune modification fournie.' }, { status: 400 });
    }

    await db.property.update({ where: { id }, data });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[airbnb/properties/[id]/premium PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
