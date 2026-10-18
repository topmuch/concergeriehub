// =============================================================
// /api/airbnb/messages — CENTRE DE MESSAGES DE L'ESPACE HÔTE
//
// Regroupe les deux canaux d'entrées des invités :
//   🎙️ messages vocaux (VoiceMessage) — envoyés depuis le Hub
//      (« Contacter l'hôte ») et depuis les modules QR vocaux ;
//   🚨 signalements de problème (GuestComplaint) — envoyés depuis
//      le Hub (« Signaler un problème »).
//
// GET  ?propertyId=<id|all>  : messages + signalements des biens
//        accessibles (session obligatoire — un hôte ne voit jamais
//        les biens d'un autre). ?countsOnly=1 → compteurs seuls
//        (badge temps réel du bouton Messages).
// PATCH { type, id, action } : type 'voice' → action 'read'
//        (marquer lu) ; type 'complaint' → action 'resolve'
//        (marquer résolu) ou action 'read' (marquer la notification
//        lue — le badge rouge s'éteint même si la réclamation reste
//        ouverte) ou action 'read-all' (ouvre l'onglet Signalements →
//        tout est considéré vu). Vérification de propriété systématique.
// DELETE ?type=voice&id=     : suppression DÉFINITIVE d'un vocal
//        (invité ou réponse hôte) — WP-BACK v4.61. Même garde session
//        + propriétés accessibles ; fichier disque nettoyé si présent.
//
// v4.32 « AUDIO DURABLE » : chaque vocal transporte audioData (copie
// dataURL en base) — la lecture ne dépend plus du fichier disque qui
// disparaissait à chaque redéploiement (cause du bug « l'audio ne
// marche pas » dans le dashboard).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { unlink } from 'fs/promises';
import { join, basename } from 'path';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveUserProperties } from '@/lib/b2b-server';
import { mutationGuard, mutationKey } from '@/lib/mutation-guard';

interface MessagesCounts {
  voiceUnread: number;
  complaintsOpen: number;
  total: number;
}

function parsePhotosJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
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
      const counts: MessagesCounts = { voiceUnread: 0, complaintsOpen: 0, total: 0 };
      return NextResponse.json({ voice: [], complaints: [], cleaningReports: [], counts });
    }

    const { searchParams } = new URL(req.url);
    const requestedId = searchParams.get('propertyId');
    const target =
      requestedId && requestedId !== 'all'
        ? properties.find((p) => p.id === requestedId) ?? null
        : null;
    // Les ids ciblés proviennent TOUJOURS de resolveUserProperties (accès garanti).
    const ids = target ? [target.id] : properties.map((p) => p.id);
    const nameById = new Map(properties.map((p) => [p.id, p.name]));

    // ── Mode compteurs seuls (badge du bouton Messages) ──
    // v4.32 — le badge rouge = notifications NON LUES : vocaux isRead=false
    // + réclamations OPEN non lues (une réclamation lue mais encore
    // ouverte reste dans la liste, sans allumer le badge).
    if (searchParams.get('countsOnly') === '1') {
      const [voiceUnread, complaintsUnread] = await Promise.all([
        db.voiceMessage.count({ where: { propertyId: { in: ids }, isRead: false } }),
        db.guestComplaint.count({ where: { propertyId: { in: ids }, status: 'OPEN', isRead: false } }),
      ]);
      const counts: MessagesCounts = {
        voiceUnread,
        complaintsOpen: complaintsUnread,
        total: voiceUnread + complaintsUnread,
      };
      return NextResponse.json({ counts });
    }

    const [voice, complaints, cleaningReports] = await Promise.all([
      db.voiceMessage.findMany({
        where: { propertyId: { in: ids } },
        orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
        take: 60,
      }),
      db.guestComplaint.findMany({
        where: { propertyId: { in: ids } },
        orderBy: [{ isUrgent: 'desc' }, { createdAt: 'desc' }],
        take: 60,
      }),
      // v4.42 « SUIVI MÉNAGE » — journal des passages (femme de ménage :
      // horaires, checklist, photos de l'appartement propre). Journal
      // structuré CleaningReport créé par /api/public/hub/[slug]/cleaning.
      db.cleaningReport.findMany({
        where: { propertyId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    const counts: MessagesCounts = {
      voiceUnread: voice.filter((v) => !v.isRead).length,
      complaintsOpen: complaints.filter((c) => c.status === 'OPEN').length,
      total: 0,
    };
    counts.total = counts.voiceUnread + counts.complaintsOpen;

    return NextResponse.json({
      voice: voice.map((v) => ({
        id: v.id,
        propertyId: v.propertyId,
        propertyName: nameById.get(v.propertyId) ?? null,
        senderName: v.senderName,
        senderType: v.senderType,
        audioUrl: v.audioUrl,
        // v4.32 — copie dataURL en base (lecture durable).
        audioData: v.audioData,
        durationSec: v.durationSec,
        fileSizeKb: v.fileSizeKb,
        isRead: v.isRead,
        createdAt: v.createdAt.toISOString(),
      })),
      complaints: complaints.map((c) => ({
        id: c.id,
        propertyId: c.propertyId,
        propertyName: nameById.get(c.propertyId) ?? null,
        category: c.category,
        description: c.description,
        photos: parsePhotosJson(c.photos),
        isUrgent: c.isUrgent,
        guestName: c.guestName,
        status: c.status,
        // v4.32 — état de lecture de la notification.
        isRead: c.isRead,
        createdAt: c.createdAt.toISOString(),
      })),
      // v4.42 « SUIVI MÉNAGE » — photos limitées à la 1ʳᵉ (cover) pour
      // garder la réponse légère ; le décompte complet est dans photoCount.
      cleaningReports: cleaningReports.map((r) => {
        const photos = parsePhotosJson(r.photos);
        let checklist: { label: string; done: boolean }[] = [];
        try {
          const parsed = JSON.parse(r.checklistJson);
          if (Array.isArray(parsed)) {
            checklist = parsed
              .filter((c): c is { label: string; done: boolean } =>
                !!c && typeof c === 'object' && typeof (c as { label?: unknown }).label === 'string' && typeof (c as { done?: unknown }).done === 'boolean')
              .slice(0, 20);
          }
        } catch {
          /* checklist illisible → vide */
        }
        return {
          id: r.id,
          propertyId: r.propertyId,
          propertyName: nameById.get(r.propertyId) ?? null,
          staffName: r.staffName,
          checklist,
          coverPhoto: photos[0] ?? null,
          photoCount: photos.length,
          startedAt: r.startedAt?.toISOString() ?? null,
          endedAt: r.endedAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        };
      }),
      counts,
    });
  } catch (error) {
    console.error('[airbnb/messages GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    // FIX-15 — guard anti-abus (mutations hôte : 30/min).
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const properties = await resolveUserProperties(userId);
    if (properties.length === 0) {
      return NextResponse.json({ error: 'Aucun bien accessible' }, { status: 404 });
    }
    const ids = properties.map((p) => p.id);

    const body = await req.json().catch(() => null);
    const type = typeof body?.type === 'string' ? body.type : '';
    const id = typeof body?.id === 'string' ? body.id : '';
    const action = typeof body?.action === 'string' ? body.action : '';
    if (!id && action !== 'read-all') {
      return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });
    }

    if (type === 'voice' && action === 'read') {
      const result = await db.voiceMessage.updateMany({
        where: { id, propertyId: { in: ids } },
        data: { isRead: true },
      });
      if (result.count === 0) {
        return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    if (type === 'complaint' && action === 'resolve') {
      const result = await db.guestComplaint.updateMany({
        where: { id, propertyId: { in: ids } },
        data: { status: 'RESOLVED' },
      });
      if (result.count === 0) {
        return NextResponse.json({ error: 'Signalement introuvable' }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    // v4.32 — notification lue (réclamation individuelle).
    if (type === 'complaint' && action === 'read') {
      const result = await db.guestComplaint.updateMany({
        where: { id, propertyId: { in: ids } },
        data: { isRead: true },
      });
      if (result.count === 0) {
        return NextResponse.json({ error: 'Signalement introuvable' }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    // v4.32 — ouverture de l'onglet Signalements : tout est vu (badge
    // rouge éteint ; les réclamations restent ouvertes jusqu'à résolution).
    if (type === 'complaint' && action === 'read-all') {
      const result = await db.guestComplaint.updateMany({
        where: { propertyId: { in: ids }, status: 'OPEN', isRead: false },
        data: { isRead: true },
      });
      return NextResponse.json({ success: true, marked: result.count });
    }

    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  } catch (error) {
    console.error('[airbnb/messages PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── WP-BACK v4.61 — DELETE ?type=voice&id= : suppression DÉFINITIVE
// d'un message vocal (invité OU réponse hôte) depuis la messagerie du
// dashboard. Garde session + propriétés accessibles (même convention que
// PATCH) + guard anti-abus. Ligne DB ET fichier disque (si encore
// présent) supprimés ; l'audio vît aussi en base (audioData v4.32), un
// fichier absent n'empêche jamais la suppression. ──
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    // FIX-15 — guard anti-abus (mutations hôte : 30/min), clé identique à PATCH.
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const properties = await resolveUserProperties(userId);
    if (properties.length === 0) {
      return NextResponse.json({ error: 'Aucun bien accessible' }, { status: 404 });
    }
    const ids = properties.map((p) => p.id);

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') ?? '';
    const id = (searchParams.get('id') ?? '').trim();
    if (type !== 'voice' || !id) {
      return NextResponse.json({ error: 'Paramètres invalides (type=voice et id requis)' }, { status: 400 });
    }

    // Le vocal DOIT appartenir à un bien accessible (invités ET réponses
    // hôte : tout VoiceMessage du périmètre est supprimable).
    const voiceMsg = await db.voiceMessage.findFirst({
      where: { id, propertyId: { in: ids } },
      select: { id: true, audioUrl: true },
    });
    if (!voiceMsg) {
      return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });
    }

    await db.voiceMessage.delete({ where: { id: voiceMsg.id } });

    // Fichier disque best-effort : basename seul (anti path traversal),
    // échec silencieux (la copie en base est la source de lecture).
    if (voiceMsg.audioUrl) {
      try {
        const filename = basename(voiceMsg.audioUrl);
        if (filename && !filename.includes('/')) {
          await unlink(join(process.cwd(), 'data', 'uploads', 'voice', filename));
        }
      } catch {
        /* fichier déjà absent — suppression DB suffisante */
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[airbnb/messages DELETE] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
