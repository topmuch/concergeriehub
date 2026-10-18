// =============================================================
// /api/airbnb/menage/report-voice/[id] — VOCAL DE LA FEMME DE MÉNAGE
// accompagnant ses preuves (v4.43, onglet Ménage du dashboard)
//
// GET : sert le binaire audio du CleaningReport (session obligatoire,
// le rapport doit appartenir à un bien accessible). Fallback :
// dataURL stocké → binaire, aucun audio sur le disque.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveUserProperties } from '@/lib/b2b-server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const { id } = await params;

    const report = await db.cleaningReport.findUnique({
      where: { id },
      select: { propertyId: true, voiceData: true, voiceMime: true },
    });
    if (!report?.voiceData) {
      return NextResponse.json({ error: 'Vocal introuvable' }, { status: 404 });
    }

    // Garde d'accès : le rapport doit appartenir à un bien de l'utilisateur.
    const properties = await resolveUserProperties(userId);
    if (!properties.some((p) => p.id === report.propertyId)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    // voiceData est un dataURL (« data:audio/...;base64,.... »).
    const match = /^data:([a-z]+\/[a-z0-9.+_-]+);base64,(.+)$/i.exec(report.voiceData);
    const mime = report.voiceMime || (match ? match[1] : 'audio/webm');
    const b64 = match ? match[2] : report.voiceData;
    const buffer = Buffer.from(b64, 'base64');
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, max-age=86400',
        'Accept-Ranges': 'none',
      },
    });
  } catch (error) {
    console.error('[airbnb/menage/report-voice GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
