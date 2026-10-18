// =============================================================
// /api/airbnb/menage — ONGLET MÉNAGE DÉDIÉ DU DASHBOARD (v4.43)
//
// GET  ?propertyId=<id|all>  : configuration ménage + preuves
//        (rapports de passage) des biens accessibles (session
//        obligatoire). Renvoie :
//          • checklist : { source: 'default'|'custom', items[] } —
//            la checklist choisie par l'hôte (générale si null) ;
//          • hostNote : consigne vocale hôte → femme de ménage
//            (HubVoiceMessage kind='menage_note') — métadonnées
//            uniquement, l'audio passe par /voice-note/[id] ;
//          • reports : preuves de ménage (CleaningReport, cover photo
//            seule pour garder la réponse légère + hasVoice).
// PUT  { propertyId, mode: 'default' } | { propertyId, mode: 'custom',
//      items: string[] } : enregistre la checklist de l'hôte
//      (null = retour checklist générale).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveUserProperties } from '@/lib/b2b-server';
import {
  resolveCleaningChecklist,
  validateCustomChecklist,
} from '@/lib/housekeeping';

function parsePhotosJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

/** Vérifie que la propriété ciblée appartient à l'utilisateur (ou est
 *  dans ses biens accessibles) — renvoie l'id ou null. */
async function assertOwnedProperty(
  userId: string,
  propertyId: string | null,
): Promise<{ ids: string[]; names: Map<string, string> } | null> {
  const properties = await resolveUserProperties(userId);
  if (properties.length === 0) return null;
  const names = new Map(properties.map((p) => [p.id, p.name]));
  if (!propertyId || propertyId === 'all') {
    return { ids: properties.map((p) => p.id), names };
  }
  return properties.some((p) => p.id === propertyId)
    ? { ids: [propertyId], names }
    : null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const requestedId = searchParams.get('propertyId');

    // ── v4.53 « HISTORIQUE D'ÉTAT DES LIEUX EN PHOTOS HORODATÉES » ──
    // ?reportId=<id>&photos=full → UN rapport avec TOUTES ses photos
    // (dataURL) + heures + GPS : sert à l'export PDF « rapport visuel
    // horodaté » en 1 clic (litige propreté). La liste classique reste
    // légère (cover seule).
    const reportId = searchParams.get('reportId');
    const fullPhotos = searchParams.get('photos') === 'full';
    if (reportId && fullPhotos) {
      const target = await db.cleaningReport.findUnique({
        where: { id: reportId },
        select: { propertyId: true },
      });
      if (!target) {
        return NextResponse.json({ error: 'Rapport introuvable.' }, { status: 404 });
      }
      const access = await assertOwnedProperty(userId, target.propertyId);
      if (!access || !access.ids.includes(target.propertyId)) {
        return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
      }
      const r = await db.cleaningReport.findUnique({
        where: { id: reportId },
      });
      if (!r) {
        return NextResponse.json({ error: 'Rapport introuvable.' }, { status: 404 });
      }
      let checklistReport: { label: string; done: boolean }[] = [];
      try {
        const parsed = JSON.parse(r.checklistJson);
        if (Array.isArray(parsed)) {
          checklistReport = parsed
            .filter(
              (c): c is { label: string; done: boolean } =>
                !!c &&
                typeof c === 'object' &&
                typeof (c as { label?: unknown }).label === 'string' &&
                typeof (c as { done?: unknown }).done === 'boolean',
            )
            .slice(0, 20);
        }
      } catch {
        /* checklist illisible → vide */
      }
      return NextResponse.json({
        report: {
          id: r.id,
          propertyId: r.propertyId,
          propertyName: access.names.get(r.propertyId) ?? null,
          staffName: r.staffName,
          checklist: checklistReport,
          photos: parsePhotosJson(r.photos),
          hasVoice: !!r.voiceData,
          startedAt: r.startedAt?.toISOString() ?? null,
          endedAt: r.endedAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
          startLat: r.startLat,
          startLng: r.startLng,
          endLat: r.endLat,
          endLng: r.endLng,
        },
      });
    }

    const access = await assertOwnedProperty(userId, requestedId);
    if (!access) {
      return NextResponse.json({
        checklist: resolveCleaningChecklist(null),
        customChecklist: null,
        hostNote: null,
        reports: [],
        properties: [],
      });
    }

    const { ids, names } = access;

    // Configuration : les biens visibles + leur checklist + la note vocale.
    const props = await db.property.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, cleaningChecklist: true },
      orderBy: { createdAt: 'asc' },
    });

    // Checklist « courante » : celle du bien ciblé (ou du 1er bien en 'all').
    const focusId = requestedId && requestedId !== 'all' ? requestedId : props[0]?.id ?? null;
    const focus = props.find((p) => p.id === focusId) ?? props[0] ?? null;
    const checklist = resolveCleaningChecklist(focus?.cleaningChecklist ?? null);

    // Consigne vocale (kind='menage_note') du bien ciblé — sinon du
    // premier bien qui en a une (mode 'all').
    const notes = await db.hubVoiceMessage.findMany({
      where: { propertyId: { in: ids }, kind: 'menage_note' },
      select: {
        id: true,
        propertyId: true,
        source: true,
        text: true,
        durationSec: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    const note =
      notes.find((n) => n.propertyId === focusId) ?? notes[0] ?? null;

    // Preuves de ménage (60 derniers passages, cover photo seule) —
    // v4.96 : journal du planning étendu (historique plus long).
    const reports = await db.cleaningReport.findMany({
      where: { propertyId: { in: ids } },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });

    return NextResponse.json({
      properties: props.map((p) => ({ id: p.id, name: p.name })),
      focusPropertyId: focusId,
      checklist,
      customChecklist: focus
        ? resolveCleaningChecklist(focus.cleaningChecklist).source === 'custom'
          ? resolveCleaningChecklist(focus.cleaningChecklist).items
          : null
        : null,
      hostNote: note
        ? {
            propertyId: note.propertyId,
            propertyName: names.get(note.propertyId) ?? null,
            audioUrl: `/api/airbnb/menage/voice-note?propertyId=${encodeURIComponent(note.propertyId)}`,
            source: note.source,
            text: note.text,
            durationSec: note.durationSec,
            updatedAt: note.updatedAt.toISOString(),
          }
        : null,
      reports: reports.map((r) => {
        const photos = parsePhotosJson(r.photos);
        let checklistReport: { label: string; done: boolean }[] = [];
        try {
          const parsed = JSON.parse(r.checklistJson);
          if (Array.isArray(parsed)) {
            checklistReport = parsed
              .filter(
                (c): c is { label: string; done: boolean } =>
                  !!c &&
                  typeof c === 'object' &&
                  typeof (c as { label?: unknown }).label === 'string' &&
                  typeof (c as { done?: unknown }).done === 'boolean',
              )
              .slice(0, 20);
          }
        } catch {
          /* checklist illisible → vide */
        }
        return {
          id: r.id,
          propertyId: r.propertyId,
          propertyName: names.get(r.propertyId) ?? null,
          staffName: r.staffName,
          checklist: checklistReport,
          coverPhoto: photos[0] ?? null,
          photoCount: photos.length,
          hasVoice: !!r.voiceData,
          voiceDurationSec: r.voiceDurationSec ?? 0,
          voiceUrl: r.voiceData ? `/api/airbnb/menage/report-voice/${r.id}` : null,
          startedAt: r.startedAt?.toISOString() ?? null,
          endedAt: r.endedAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        };
      }),
    });
  } catch (error) {
    console.error('[airbnb/menage GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as {
      propertyId?: string;
      mode?: string;
      items?: unknown;
    } | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }
    const propertyId = typeof body.propertyId === 'string' ? body.propertyId : null;
    const access = await assertOwnedProperty(userId, propertyId);
    if (!access) {
      return NextResponse.json({ error: 'Bien introuvable' }, { status: 404 });
    }
    if (!propertyId || propertyId === 'all' || !access.ids.includes(propertyId)) {
      return NextResponse.json(
        { error: 'Sélectionnez d’abord un bien précis pour configurer sa checklist.' },
        { status: 400 },
      );
    }

    if (body.mode === 'default') {
      await db.property.update({
        where: { id: propertyId },
        data: { cleaningChecklist: Prisma.DbNull },
      });
      return NextResponse.json({ ok: true, checklist: resolveCleaningChecklist(null) });
    }

    if (body.mode === 'custom') {
      const validated = validateCustomChecklist(body.items);
      if (!validated.ok) {
        return NextResponse.json({ error: validated.reason }, { status: 400 });
      }
      await db.property.update({
        where: { id: propertyId },
        data: { cleaningChecklist: JSON.stringify(validated.items) },
      });
      return NextResponse.json({
        ok: true,
        checklist: { source: 'custom' as const, items: validated.items },
      });
    }

    return NextResponse.json({ error: 'Mode de checklist inconnu.' }, { status: 400 });
  } catch (error) {
    console.error('[airbnb/menage PUT] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
