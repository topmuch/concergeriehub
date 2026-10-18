import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { captureError } from '@/lib/error-monitor';
import ZAI from 'z-ai-web-dev-sdk';

// =============================================================
// v4.33 « TRADUCTION INSTANTANÉE IA » — POST /api/public/translate
// v4.40 — repli GOOGLE TRANSLATE (endpoint public gtx, sans clé)
//
// Traduit un petit lot de textes FR vers une langue cible :
//   Voie 1 — LLM serveur (z-ai-web-dev-sdk — JAMAIS côté client) ;
//   Voie 2 — translate.googleapis.com (endpoint gtx public) pour les
//     textes encore manquants : sur les serveurs où l'API Z.ai est
//     injoignable (IPs privées — constat prod v4.40, Coolify), la
//     traduction des dialogues vocaux reste utilisable. Best-effort :
//     un échec (IP bloquée, quota, format inattendu) laisse simplement
//     le texte absent — l'hôte peut alors saisir/corriger à la main.
//
// body: { texts: string[] (≤ 12, ≤ 500 chars chacun), lang: 'en'|'es'|'de'|'zh'|'ar' }
// → 200 { translations: { [frText]: translatedText } } (best-effort :
//        un texte qui échoue est simplement absent de la réponse)
// Sécurité : rate limit 30/min par IP ; pas d'écriture DB ; never-throw.
//
// ⚙️ CONFIG PROD : le SDK lit .z-ai-config (cwd / home / /etc). Le repo
// étant PUBLIC, ce fichier n'y est JAMAIS committé. En production,
// Coolify fournit la variable d'environnement Z_AI_CONFIG_JSON contenant
// le même JSON. Au premier appel, la route l'écrit dans
// process.cwd()/.z-ai-config (mode 0600) — le SDK démarre ensuite
// normalement, SANS redéploiement. Absente → la voie 1 est sautée et la
// voie 2 (Google) prend le relais ; si Google bloque aussi l'IP, le hub
// garde le FR (dictionnaire statique + saisie manuelle) : dégradation
// gracieuse.
// =============================================================

// v4.37 — l'arabe rejoint les langues cibles (messages vocaux du hub :
// l'hôte écrit en FR, l'IA traduit FR→AR avant génération TTS).
const LANGS = ['en', 'es', 'de', 'zh', 'ar'] as const;

const schema = z.object({
  texts: z.array(z.string().min(1).max(500)).min(1).max(12),
  lang: z.enum(LANGS),
});

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || 'local';
}

/** Écrit .z-ai-config depuis Z_AI_CONFIG_JSON si absent (1er appel). */
async function ensureSdkConfig(): Promise<void> {
  const raw = process.env.Z_AI_CONFIG_JSON;
  if (!raw) return;
  try {
    const fs = await import('fs');
    const path = await import('path');
    const target = path.join(process.cwd(), '.z-ai-config');
    try {
      const existing = JSON.parse(fs.readFileSync(target, 'utf-8'));
      if (existing?.baseUrl && existing?.apiKey) return; // déjà en place
    } catch {
      /* absent ou invalide → on écrit */
    }
    const cfg = JSON.parse(raw) as { baseUrl?: string; apiKey?: string };
    if (!cfg?.baseUrl || !cfg?.apiKey) return;
    fs.writeFileSync(target, raw, { mode: 0o600 });
  } catch {
    /* config env invalide — le LLM restera indisponible, repli FR */
  }
}

// Cache mémoire partagé (chaud) — la couche froide est le localStorage
// du client. Key = lang + ' ' + texte FR.
const memCache = new Map<string, string>();
const MEM_MAX = 4000;

// v4.40 — disjoncteur LLM (même logique que voice-tts) : après le 1er
// échec Z.ai (API injoignable depuis prod — IPs privées), la voie LLM
// est SAUTÉE 10 min — sinon chaque lot paierait le timeout réseau avant
// le repli Google. Le LLM est réessayé toutes les 10 min.
let zaiLlmDownUntil = 0;
const ZAI_LLM_COOLDOWN_MS = 10 * 60 * 1000;

const LANG_NAMES: Record<(typeof LANGS)[number], string> = {
  en: 'English',
  es: 'Spanish',
  de: 'German',
  zh: 'Simplified Chinese',
  ar: 'Arabic (Modern Standard)',
};

/** Voie 2 v4.40 — un texte → traduction via l'endpoint public Google
 *  (client=gtx, sans clé). Durée bornée 8 s ; toute anomalie (page HTML
 *  « Sorry... » sur IP datacenter, quota) → null, repli gracieux. */
async function googleTranslateOne(
  text: string,
  lang: (typeof LANGS)[number],
): Promise<string | null> {
  try {
    const url =
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=fr&tl=${lang}&dt=t&q=` +
      encodeURIComponent(text.slice(0, 450));
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    // Format : [[["traduction","source",null,null,1],["suite","...",...]], ...]
    if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
    const joined = (data[0] as unknown[])
      .map((seg) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''))
      .join('');
    const out = joined.trim().slice(0, 500);
    return out || null;
  } catch {
    return null; // IP bloquée ou format inattendu → texte absent, repli FR
  }
}

export async function POST(req: Request) {
  try {
    // Anti-abus : 30 lots / minute / IP (le client batch par carte).
    if (!(await rateLimit(`hubtranslate:${clientIp(req)}`, 30))) {
      return NextResponse.json({ error: 'Trop de requêtes. Réessayez dans un instant.' }, { status: 429 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }

    const { texts, lang } = parsed.data;

    // 1) Cache chaud
    const translations: Record<string, string> = {};
    const missing: string[] = [];
    for (const t of texts) {
      const key = `${lang} ${t}`;
      const hit = memCache.get(key);
      if (hit) translations[t] = hit;
      else missing.push(t);
    }

    // 2) LLM pour les manquants (voie sautée si disjoncteur ouvert —
    //    réessaie toutes les 10 min au cas où le réseau revient).
    if (missing.length > 0 && Date.now() >= zaiLlmDownUntil) {
      try {
        await ensureSdkConfig();
        const zai = await ZAI.create();
        const completion = await zai.chat.completions.create({
          messages: [
            {
              role: 'assistant',
              content:
                'You are a professional translator for a vacation-rental guest app. ' +
                'Translate each French string into the target language. ' +
                'Keep emojis exactly where they are, keep the tone concise, warm and friendly, ' +
                'and do NOT translate property names, email addresses, URLs or phone numbers. ' +
                'Return STRICT JSON only, no markdown: {"translations": {"<french source>": "<translation>"}}. ' +
                'Every input key MUST appear in the JSON.',
            },
            {
              role: 'user',
              content: JSON.stringify({ target: LANG_NAMES[lang], items: missing }),
            },
          ],
          thinking: { type: 'disabled' },
        } as never);
        const content = completion.choices[0]?.message?.content ?? '';
        const jsonStr = content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1);
        const parsedOut = JSON.parse(jsonStr) as { translations?: Record<string, unknown> };
        for (const [fr, val] of Object.entries(parsedOut.translations ?? {})) {
          if (typeof val === 'string' && val.trim() && missing.includes(fr)) {
            const clean = val.trim().slice(0, 500);
            translations[fr] = clean;
            const key = `${lang} ${fr}`;
            memCache.set(key, clean);
            if (memCache.size > MEM_MAX) {
              const first = memCache.keys().next().value;
              if (first) memCache.delete(first);
            }
          }
        }
      } catch (e) {
        // Traduction indisponible → réponse partielle (le FR reste affiché)
        // + disjoncteur : on saute la voie LLM 10 min (le repli Google
        // prend le relais immédiatement sur les appels suivants).
        zaiLlmDownUntil = Date.now() + ZAI_LLM_COOLDOWN_MS;
        await captureError('hub.translate.llm', e, undefined, req);
      }
    }

    // v4.40 — voie 2 : GOOGLE TRANSLATE pour les textes encore manquants
    // (serveurs où l'API Z.ai est injoignable — IPs privées, cas prod).
    const stillMissing = texts.filter((t) => !translations[t]);
    for (const t of stillMissing) {
      const out = await googleTranslateOne(t, lang);
      if (out) {
        translations[t] = out;
        const key = `${lang} ${t}`;
        memCache.set(key, out);
        if (memCache.size > MEM_MAX) {
          const first = memCache.keys().next().value;
          if (first) memCache.delete(first);
        }
      }
    }

    return NextResponse.json({ translations });
  } catch (error) {
    await captureError('hub.translate', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur. Réessayez dans un instant.' }, { status: 500 });
  }
}
