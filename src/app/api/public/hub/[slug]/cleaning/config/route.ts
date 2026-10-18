import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { captureError } from '@/lib/error-monitor';
import { resolveHubPropertyId } from '@/lib/hub-resolve';
import {
  resolveCleaningChecklist,
} from '@/lib/housekeeping';

// =============================================================
// v4.43 « ONGLET MÉNAGE DÉDIÉ » — GET /api/public/hub/[slug]/cleaning/config
// (PUBLIC — consommé par le Mode Ménage du Hub, code staff saisi côté
// client puis revérifié serveur à la validation)
//
// Renvoie à la femme de ménage :
//   1. la checklist de nettoyage choisie par l'hôte (personnalisée ou
//      checklist générale — parseur tolérant, jamais de throw) ;
//   2. le message vocal laissé par l'hôte pour elle (HubVoiceMessage
//      kind='menage_note', lang='fr') — servi paresseusement par la
//      route /voice-messages/audio?kind=menage_note&v=<updatedAt>.
// Données volontairement minimales (pas de donnée personnelle invité).
// =============================================================

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

// v4.76 — IP cliente (même convention que les autres routes hub).
function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || 'local';
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    // v4.76 — les routes consommées par l'Espace Ménage sont cadencées
    // à 5 requêtes/min/IP (politique durcie : code staff fixe partagé).
    if (!(await rateLimit(`hubstaff-config:${slug}:${clientIp(req)}`, 5))) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    // ── DEMO MODE : checklist générale, pas de vocal ──
    if (isDemo(slug)) {
      const { source, items } = resolveCleaningChecklist(null);
      return NextResponse.json({
        propertyName: 'Logement de démonstration',
        checklist: { source, items },
        hostNote: null,
      });
    }

    const resolved = await resolveHubPropertyId(slug);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }

    const property = await db.property.findUnique({
      where: { id: resolved.propertyId },
      select: {
        name: true,
        cleaningChecklist: true,
      },
    });
    if (!property) {
      return NextResponse.json({ error: 'Ce hub est introuvable.' }, { status: 404 });
    }

    // Checklist : personnalisée si l'hôte l'a configurée, sinon générale.
    const checklist = resolveCleaningChecklist(property.cleaningChecklist);

    // Consigne vocale de l'hôte (kind='menage_note', fr) — présence +
    // version (cache-bust). L'audio lui-même ne quitte la base QUE via
    // la route /voice-messages/audio (déjà publique pour les voix hub).
    let hostNote: {
      audioUrl: string;
      source: string;
      durationSec: number;
      createdAt: string;
    } | null = null;
    try {
      const note = await db.hubVoiceMessage.findUnique({
        where: {
          propertyId_kind_lang: {
            propertyId: resolved.propertyId,
            kind: 'menage_note',
            lang: 'fr',
          },
        },
        select: { source: true, durationSec: true, createdAt: true, updatedAt: true },
      });
      if (note) {
        const v = note.updatedAt.toISOString();
        hostNote = {
          audioUrl: `/api/public/hub/${encodeURIComponent(slug)}/voice-messages/audio?kind=menage_note&lang=fr&v=${encodeURIComponent(v)}`,
          source: note.source,
          durationSec: note.durationSec,
          createdAt: note.createdAt.toISOString(),
        };
      }
    } catch {
      // Dégradation gracieuse : sans vocal, la femme de ménage voit
      // simplement la checklist.
    }

    return NextResponse.json({
      propertyName: property.name,
      checklist,
      hostNote,
    });
  } catch (error) {
    await captureError('hub.cleaning.config', error, undefined, req);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}
