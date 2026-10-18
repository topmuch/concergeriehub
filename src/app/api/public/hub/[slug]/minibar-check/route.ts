import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { captureError } from '@/lib/error-monitor';
import { resolveHubPropertyId } from '@/lib/hub-resolve';
import { parseMinibar } from '@/lib/concierge';
import { requireHubAccess } from '@/lib/hub-access';
import { siteUrl } from '@/lib/site';

// =============================================================
// v4.50 « SYSTÈME DE CONFIANCE — INVENTAIRE MINIBAR »
// POST /api/public/hub/[slug]/minibar-check
//
// À son entrée, l'invité voit la PHOTO du minibar rempli (prise par
// l'hôte à l'arrivée, configurée dans le dashboard) + la liste des
// articles, et valide le contenu EN UN CLIC (« J'ai vérifié, tout
// est là »). La validation est horodatée et rattachée au séjour
// courant : preuve de confiance réciproque, protège hôte ET invité.
//
// Sécurité : garde verrouillage (requireHubAccess) ; rate limit
// 4/min ; mode démo = succès sans écriture. Jamais de throw.
// v5.0 « ÉTAT DES LIEUX D'ENTRÉE » : chaque validation crée une
// preuve publique (publicToken UUID) consultable sans auth à
// /public/inspection/[token] (page) et …/pdf (document) — horodatage
// opposable protégant hôte ET invité.
// =============================================================

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

const checkSchema = z.object({
  guestName: z.string().trim().max(80).optional().nullable(),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    if (!(await rateLimit(`hubmbcheck:${slug}:${clientIp(req)}`, 4))) {
      return NextResponse.json(
        { error: 'Trop de validations rapprochées. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    const rawBody = await req.json().catch(() => ({}));
    const parsed = checkSchema.safeParse(rawBody ?? {});
    const guestName = parsed.success ? parsed.data.guestName?.trim().slice(0, 80) || null : null;

    // ── DEMO MODE : succès sans écriture ──
    if (isDemo(slug)) {
      return NextResponse.json({
        success: true,
        checkedAt: new Date().toISOString(),
        message: 'Inventaire validé (mode démo) — merci !',
      });
    }

    // Garde verrouillage (session hub valide si le hub est protégé).
    const access = await requireHubAccess(slug, req);
    if (!access.ok) {
      return NextResponse.json({ error: access.code, message: access.message }, { status: access.status });
    }

    const resolved = await resolveHubPropertyId(slug);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }

    const property = await db.property.findUnique({
      where: { id: resolved.propertyId },
      select: { id: true, premiumFeatures: true },
    });
    if (!property) {
      return NextResponse.json({ error: 'Ce hub est introuvable.' }, { status: 404 });
    }

    // Le module minibar doit être actif (sinon rien à valider).
    const minibar = parseMinibar(property.premiumFeatures);
    if (!minibar.enabled) {
      return NextResponse.json({ error: 'Le minibar n’est pas actif pour ce logement.' }, { status: 403 });
    }

    // Rattachement au séjour courant si identifiable, sinon trace libre.
    // v5.0 — token public de preuve (URL sans auth, PDF à la demande).
    const publicToken = crypto.randomUUID();
    const check = await db.minibarCheck.create({
      data: {
        propertyId: property.id,
        bookingId: access.bookingId,
        guestName,
        publicToken,
      },
      select: { id: true, checkedAt: true, publicToken: true },
    });

    return NextResponse.json({
      success: true,
      checkedAt: check.checkedAt.toISOString(),
      message: 'Inventaire validé — merci, bon séjour !',
      // v5.0 — preuve publique d'arrivée (page + PDF sans auth).
      publicToken: check.publicToken,
      publicUrl: `${siteUrl}/public/inspection/${check.publicToken}`,
      publicPdfUrl: `${siteUrl}/api/public/inspection/${check.publicToken}/pdf`,
    });
  } catch (error) {
    await captureError('hub.minibar-check', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur. Réessayez dans un instant.' }, { status: 500 });
  }
}

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || 'local';
}
