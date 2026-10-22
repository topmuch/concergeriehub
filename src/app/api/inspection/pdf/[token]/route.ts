import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/audit';
import { captureError } from '@/lib/error-monitor';
import {
  buildInspectionPdfFromDb,
  inspectionPdfFilename,
} from '@/lib/inspection-pdf-builder';

// =============================================================
// v4.97 MODULE STANDALONE « ÉTAT DES LIEUX » — PDF PUBLIC
// GET /api/inspection/pdf/[token]
//   → 200 application/pdf (inline) — document juridique signé
//   → 404 si le token est inconnu, 500 si le rendu échoue.
//
// v4.162 : le rendu est délégué au builder partagé
// (src/lib/inspection-pdf-builder.ts) — le MÊME mapping sert aux
// pièces jointes des emails de confirmation (hôte + invité), le PDF
// reçu par email est donc strictement identique à celui du lien.
// Sécurité : rate limit 20/min par token+IP (génération coûteuse) ;
// token unique ; never-throw.
// =============================================================

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  try {
    const { token } = await params;
    if (!token || typeof token !== 'string' || token.length < 6) {
      return NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 404 });
    }

    // Génération coûteuse (pdfkit + QR) : 20/min par token+IP.
    const ip = clientIp(req.headers) ?? 'local';
    if (!(await rateLimit(`insppdf:${token}:${ip}`, 20))) {
      return NextResponse.json(
        { error: 'Trop de téléchargements. Merci de patienter une minute.' },
        { status: 429 },
      );
    }

    const built = await buildInspectionPdfFromDb(token);
    if (!built.ok) {
      if (built.reason === 'not_found') {
        return NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 404 });
      }
      return NextResponse.json(
        { error: 'Impossible de générer le PDF pour le moment. Merci de réessayer.' },
        { status: 500 },
      );
    }

    return new Response(new Uint8Array(built.buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${inspectionPdfFilename(token, built.type)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    captureError('inspection.public_pdf', error);
    return NextResponse.json(
      { error: 'Impossible de générer le PDF pour le moment. Merci de réessayer.' },
      { status: 500 },
    );
  }
}
