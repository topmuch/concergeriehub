import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { captureError } from '@/lib/error-monitor';
// v4.37 « MESSAGES VOCAUX DU HUB » — langues de voix.
import { VOICE_LANGS, type VoiceLang } from '@/lib/voice-tts';
// WP-BACK v4.61 — VOIX PLATEFORME : repli par défaut du Superadmin
// quand le bien n'a défini aucune voix pour (kind, lang).
import { getPlatformVoiceStore } from '@/lib/platform-voices';

// =============================================================
// v4.37 — /api/public/hub/[slug]/voice-messages/audio  (PUBLIC)
//
// GET ?kind=welcome|checkout_eve|checkout_day|menage_note|guidebook & lang=fr|en|es|ar [& v=]
//
// Sert le binaire audio (MP3/WAV base64 en base) au navigateur de
// l'INVITÉ : l'élément <audio> du hub pointe directement cette URL
// (aucun base64 dans le payload du hub — chargement paresseux, la voix
// n'est téléchargée QUE si un déclencheur la demande, et le cache
// navigateur (max-age 24 h, busté par ?v=updatedAt) évite les re-GET).
//
// Repli langue : la version demandée absente → voix française ; rien
// du tout → VOIX PLATEFORME (WP-BACK v4.61, bien > plateforme) ;
// aucune des deux → 404 (le client n'affiche alors pas de lecteur).
// =============================================================

const KINDS = new Set(['welcome', 'checkout_eve', 'checkout_day', 'menage_note', 'guidebook']);

/** Résolution du bien : plaque QR (hubSlug) puis repli qrHubSlug. */
async function resolvePropertyId(slug: string): Promise<string | null> {
  const plaque = await db.physicalQrCode.findUnique({
    where: { hubSlug: slug },
    select: { propertyId: true, isClaimed: true, status: true },
  });
  if (plaque && plaque.isClaimed && plaque.propertyId && plaque.status === 'active') {
    return plaque.propertyId;
  }
  const bySlug = await db.property.findUnique({
    where: { qrHubSlug: slug },
    select: { id: true, isActive: true },
  });
  return bySlug?.isActive ? bySlug.id : null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    if (!slug || slug.length < 2) {
      return NextResponse.json({ error: 'Slug invalide' }, { status: 400 });
    }
    if (!(await rateLimit(`hubvoice-audio:${slug}`, 60))) {
      return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 });
    }
    const url = new URL(req.url);
    const kind = url.searchParams.get('kind') ?? '';
    const lang = url.searchParams.get('lang') ?? 'fr';
    if (!KINDS.has(kind) || !VOICE_LANGS.includes(lang as VoiceLang)) {
      return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 });
    }
    const propertyId = await resolvePropertyId(slug);
    if (!propertyId) {
      return NextResponse.json({ error: 'Hub introuvable' }, { status: 404 });
    }
    // Langue demandée, puis repli français.
    let message =
      (await db.hubVoiceMessage.findUnique({
        where: { propertyId_kind_lang: { propertyId, kind, lang } },
      })) ??
      (lang !== 'fr'
        ? await db.hubVoiceMessage.findUnique({
            where: { propertyId_kind_lang: { propertyId, kind, lang: 'fr' } },
          })
        : null);
    // ── WP-BACK v4.61 — REPLI VOIX PLATEFORME : le bien n'a défini
    // aucune voix pour ce kind (aucune langue) → la voix par défaut du
    // Superadmin est servie (bien > plateforme). Repli langue : la
    // plateforme française gagne sur une plateforme d'une autre langue. ──
    let platformFallback: { audioData: string; audioMime: string } | null = null;
    if (!message) {
      try {
        const store = await getPlatformVoiceStore();
        const langs = store[kind as keyof typeof store];
        platformFallback =
          langs?.[lang as 'fr' | 'en' | 'es' | 'ar'] ??
          langs?.['fr'] ??
          null;
      } catch (e) {
        // Store illisible → comportement historique (404).
        console.error('[voice-messages.audio] platform fallback failed:', e);
      }
    }
    if (!message && !platformFallback) {
      return NextResponse.json({ error: 'Aucune voix pour ce message' }, { status: 404 });
    }
    const audioData = message ? message.audioData : platformFallback!.audioData;
    const audioMime = message ? message.audioMime : platformFallback!.audioMime;
    const buffer = Buffer.from(audioData, 'base64');
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': audioMime || 'audio/mpeg',
        'Content-Length': String(buffer.length),
        // 24 h — la version ?v=updatedAt buste le cache à chaque
        // régénération (l'URL change, le cache ne sert pas du périmé).
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'Accept-Ranges': 'none',
      },
    });
  } catch (error) {
    await captureError('hub.voice-messages.audio', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
