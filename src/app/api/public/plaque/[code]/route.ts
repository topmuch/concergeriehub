import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// ── Demo shortcuts ──
const DEMO_SETUP = 'demo-setup';
const DEMO_HUB = 'demo-hub';

/**
 * GET /api/public/plaque/[code]
 *
 * Quand un utilisateur scanne le QR physique de la plaque,
 * on renvoie l'URL de redirection appropriée :
 *  - plaque claimée  → /hub/[hubSlug]
 *  - plaque non claimée (avec setupToken) → /setup/[setupToken]
 *  - plaque non claimée (sans setupToken, ancienne plaque) → /setup/[activationCode]
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    if (!code || code.length < 2) {
      return NextResponse.json(
        { error: 'Code invalide' },
        { status: 400 }
      );
    }

    // ── Demo mode ──
    if (code === DEMO_SETUP) {
      return NextResponse.json({ redirect: '/setup/demo-setup' });
    }
    if (code === DEMO_HUB) {
      return NextResponse.json({ redirect: '/hub/demo-hub' });
    }

    // ── Lookup by activationCode ──
    const plaque = await db.physicalQrCode.findUnique({
      where: { activationCode: code },
      select: {
        id: true,
        activationCode: true,
        setupToken: true,
        isClaimed: true,
        hubSlug: true,
      },
    });

    if (!plaque) {
      return NextResponse.json(
        { error: 'Plaque non trouvée' },
        { status: 404 }
      );
    }

    // ── Claimed → redirect to hub ──
    if (plaque.isClaimed && plaque.hubSlug) {
      return NextResponse.json({ redirect: `/hub/${plaque.hubSlug}` });
    }

    // ── Not claimed, has setupToken ──
    if (plaque.setupToken) {
      return NextResponse.json({ redirect: `/setup/${plaque.setupToken}` });
    }

    // ── Fallback: old plaque without setupToken → use activationCode ──
    return NextResponse.json({ redirect: `/setup/${plaque.activationCode}` });
  } catch (error) {
    console.error('Plaque redirect error:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
