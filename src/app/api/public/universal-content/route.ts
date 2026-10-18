// =============================================================
// GET /api/public/universal-content — CONTENU UNIVERSEL (lecture)
//
// v4.47 — Rend le contenu de référence partagé par toutes les
// maisons (Guidebook universel + Pack d'appareils universel) :
//  • utilisé par le MODE HÔTE (boutons « Charger le guidebook
//    universel » / « ⚡ Pack universel d'appareils ») ;
//  • lecture seule, SANS authentification (aucune donnée sensible :
//    ce contenu apparaît de toute façon dans les hubs publics).
// L'ÉCRITURE reste réservée au Superadmin (PUT /api/admin/
// universal-content).
// =============================================================
import { NextResponse } from 'next/server';
import { getUniversalContent } from '@/lib/universal-content';

export async function GET() {
  try {
    const content = await getUniversalContent();
    return NextResponse.json({ ok: true, ...content });
  } catch (error) {
    console.error('[GET /api/public/universal-content] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
