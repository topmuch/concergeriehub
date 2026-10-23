// =============================================================
// /api/shield/mode-demploi/pdf — ROOMSCAN INVENTAIRE (v5.0)
// GET : génère et télécharge le PDF du mode d'emploi (guide des 6
// étapes + notifications). Demande client : « dans mode d'emploi
// mettre un bouton télécharger qui permet de télécharger le
// document pdf ».
// Auth : abonnement owner (resolveShieldAccess) — même garde que
// les autres PDF du dashboard.
// =============================================================
import { NextResponse } from 'next/server';
import { resolveShieldAccess } from '@/lib/shield-access';
import { renderModeDEmploiPdf } from '@/lib/mode-demploi-pdf';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const access = await resolveShieldAccess();
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error, message: access.message },
        { status: access.status },
      );
    }

    const pdf = await renderModeDEmploiPdf();
    const date = new Date().toISOString().slice(0, 10);

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        // attachment → téléchargement direct (bouton « Télécharger le PDF »)
        'Content-Disposition': `attachment; filename="mode-demploi-roomscan-inventaire-${date}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[shield/mode-demploi/pdf GET] error:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
