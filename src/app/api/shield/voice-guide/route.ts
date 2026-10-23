// =============================================================
// /api/shield/voice-guide — v5.12 « GUIDAGE VOCAL DES ÉTATS DES LIEUX »
//
// POST { type: 'CHECK_IN'|'CHECK_OUT', propertyName, zoneNames[],
//        videoTargetSec? }
// → { ok:true, messages: [{ key, text, url } × (N + 5)] }
//
// Le serveur reconstruit TOUJOURS les textes à partir des seules
// entrées validées (pas de synthèse de texte arbitraire) et lance la
// pré-génération des MP3 « Denise » en arrière-plan (idempotent,
// cache par empreinte du texte). Le client joue l'URL dès qu'elle
// existe — repli Web Speech API sinon (aucune attente).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import {
  buildEdlVoiceScript,
  edlVoiceUrl,
  ensureEdlVoiceAudio,
  sanitizeVoiceInput,
  EDL_VOICE_MAX_ZONES,
  EDL_VOICE_ZONE_NAME_MAX,
  EDL_VOICE_PROPERTY_MAX,
  type EdlVoiceType,
} from '@/lib/edl-voice';

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const allowed = await rateLimit(`voice-guide:${ip}`, 20, 60_000);
  if (!allowed) return bad('Trop de demandes — réessayez dans une minute.', 429);

  const body = (await req.json().catch(() => null)) as {
    type?: string;
    propertyName?: unknown;
    zoneNames?: unknown;
    videoTargetSec?: unknown;
  } | null;
  if (!body) return bad('Corps JSON invalide.');

  if (body.type !== 'CHECK_IN' && body.type !== 'CHECK_OUT') {
    return bad('Type de session invalide (CHECK_IN ou CHECK_OUT attendu).');
  }
  const type = body.type as EdlVoiceType;

  const propertyName = sanitizeVoiceInput(body.propertyName, EDL_VOICE_PROPERTY_MAX);
  if (!propertyName) return bad('Nom du logement requis.');

  if (!Array.isArray(body.zoneNames) || body.zoneNames.length === 0) {
    return bad('Liste des zones requise.');
  }
  if (body.zoneNames.length > EDL_VOICE_MAX_ZONES) {
    return bad(`Trop de zones (${EDL_VOICE_MAX_ZONES} maximum).`);
  }
  const zoneNames = body.zoneNames
    .map((z) => sanitizeVoiceInput(z, EDL_VOICE_ZONE_NAME_MAX))
    .filter((z) => z.length > 0);
  if (zoneNames.length === 0) return bad('Aucune zone valide.');

  let videoTargetSec = 120;
  if (typeof body.videoTargetSec === 'number' && Number.isFinite(body.videoTargetSec)) {
    videoTargetSec = Math.min(240, Math.max(30, Math.round(body.videoTargetSec)));
  }

  const texts = buildEdlVoiceScript({ type, propertyName, zoneNames, videoTargetSec });
  const messages = Object.entries(texts).map(([key, text]) => ({ key, text, url: edlVoiceUrl(text) }));

  // Pré-génération en arrière-plan (idempotent) — la réponse part
  // immédiatement, le client bascule sur Denise dès que les MP3 existent.
  void ensureEdlVoiceAudio(texts).catch((err: unknown) => {
    console.warn(
      '[voice-guide] Pré-génération MP3 impossible (repli Web Speech API client) :',
      err instanceof Error ? err.message : err,
    );
  });

  return NextResponse.json({ ok: true, messages });
}
