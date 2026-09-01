import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// =============================================================
// REMÉDIATION SÉCURITÉ — Surface legacy /api/client/*
// Ces routes (espace client QRdoo historique) n'ont aucune garde
// interne. Le middleware exige une session NextAuth valide (JWT)
// pour TOUTE requête /api/client/**. Sans token → 401 JSON.
//
// Les parcours publics (hub, app invitée, view, setup) utilisent
// /api/public/* et /api/setup/* — ils ne sont pas affectés.
// =============================================================

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json(
      { error: 'Authentification requise' },
      { status: 401 },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/client/:path*'],
};
