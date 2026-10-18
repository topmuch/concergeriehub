// =============================================================
// v4.37 « MESSAGES VOCAUX DU HUB » — AIDES CLIENT (invité)
//
// Trois déclencheurs côté invité (spécifications client v4.37) :
//   1. BIENVENUE  → 1er clic « Mode Invité » : lecture immédiate (le
//      clic fournit l'activation utilisateur → l'autoplay n'est PAS
//      bloqué). « Joué une seule fois dès le 1er scan » : mémorisé par
//      APPAREIL (localStorage), ré-armé si l'hôte régénère la voix
//      (nouvelle version) ou après 14 jours (nouveau séjour probable).
//   2. VEILLE DU DÉPART → 1er scan après 20 h (heure du téléphone) la
//      veille du check-out : joué UNE SEULE fois par date de départ
//      (clé locale datée — un nouveau séjour ré-armera naturellement).
//   3. JOUR DU DÉPART → dès 9 h, CHAQUE ouverture de l'espace invité
//      (consigne client : « chaque ouverture dans la journée »),
//      bridé à 1× / 3 min par session pour éviter le spam de va-et-vient.
//
// L'audio est servi par /api/public/hub/[slug]/voice-messages/audio
// (binaire MP3, cache 24 h busté par ?v=version). Langue : détection
// du smartphone (fr/en/es/ar) avec repli FR géré CÔTÉ SERVEUR.
// =============================================================

export type HubVoiceLang = 'fr' | 'en' | 'es' | 'ar';
// v4.71 — 'guidebook' rejoint les kinds jouables côté hub (voix de
// l'hôte proposée à la sortie du guidebook).
export type HubVoiceKind = 'welcome' | 'checkout_eve' | 'checkout_day' | 'guidebook';

export const HUB_VOICE_LANGS: HubVoiceLang[] = ['fr', 'en', 'es', 'ar'];

export const HUB_VOICE_LANG_FLAG: Record<HubVoiceLang, string> = {
  fr: '🇫🇷',
  en: '🇬🇧',
  es: '🇪🇸',
  ar: '🇸🇦',
};

/** Ré-armement de la bienvenue (jours) — nouveau séjour probable. */

/** Pont minimum entre deux lectures « jour du départ » (même session). */
const DAY_REPEAT_MIN_GAP_MS = 3 * 60 * 1000;

/** Détection de la langue de voix : première langue du navigateur qui
 *  commence par fr/en/es/ar ; sinon français (repli géré aussi serveur). */
export function detectVoiceLang(): HubVoiceLang {
  if (typeof navigator === 'undefined') return 'fr';
  const candidates: string[] = [];
  if (Array.isArray(navigator.languages)) candidates.push(...navigator.languages);
  if (navigator.language) candidates.push(navigator.language);
  for (const raw of candidates) {
    const code = raw.toLowerCase().split('-')[0];
    if ((HUB_VOICE_LANGS as string[]).includes(code)) return code as HubVoiceLang;
  }
  return 'fr';
}

/** URL du flux audio public (v = version, buste le cache navigateur). */
export function hubVoiceAudioUrl(
  slug: string,
  kind: HubVoiceKind,
  lang: HubVoiceLang,
  version: string,
): string {
  return (
    `/api/public/hub/${encodeURIComponent(slug)}/voice-messages/audio` +
    `?kind=${kind}&lang=${lang}&v=${encodeURIComponent(version)}`
  );
}

// ── localStorage « joué une fois » (échec silencieux = navigation privée) ──

function readFlag<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible → la voix se rejouera, acceptable */
  }
}

const welcomeKey = (slug: string) => `hub-voice-welcome-${slug}`;
const eveKey = (slug: string) => `hub-voice-eve-${slug}`;
const daySessionKey = (slug: string) => `hub-voice-day-${slug}`;

/** Bienvenue : faut-il jouer ? (v4.77 — 1× PAR SÉJOUR)
 *  Clé = index jour du check-out du séjour courant (checkoutDayKey),
 *  'none' entre deux séjours. Chaque NOUVEL invité (nouvelle date de
 *  départ en base) entend la voix de bienvenue, même sur la même
 *  tablette posée dans le salon. L'ancienne logique « 1× / appareil /
 *  version » rejouait la voix dès que l'hôte touchait UNE autre voix
 *  (version = updatedAt max de TOUS les kinds) — bug signalé.
 *  FIX COMPLÉMENTAIRE (serveur) : la version est désormais calculée
 *  PAR KIND dans /api/public/hub/[slug] (route.ts versionOf).
 */
export function shouldPlayWelcome(slug: string, stayKey: string): boolean {
  const flag = readFlag<{ date: string }>(welcomeKey(slug));
  return flag?.date !== stayKey;
}

export function markWelcomePlayed(slug: string, stayKey: string): void {
  writeFlag(welcomeKey(slug), { date: stayKey, t: Date.now() });
}

/** Veille du départ : faut-il jouer ? (1× par date de check-out) */
export function shouldPlayCheckoutEve(slug: string, checkoutDayIso: string): boolean {
  const flag = readFlag<{ date: string }>(eveKey(slug));
  return flag?.date !== checkoutDayIso;
}

export function markCheckoutEvePlayed(slug: string, checkoutDayIso: string): void {
  writeFlag(eveKey(slug), { date: checkoutDayIso, t: Date.now() });
}

// ── v4.71 « ARRIVÉE TARDIVE » — l'annonce de veille ne doit JAMAIS se
// déclencher dans la minute qui suit l'installation de l'invité. Si le
// 1er accès au hub du séjour a lieu APRÈS l'heure configurée (ex. arrivée
// à 23 h pour une annonce de 22 h), elle se joue 30 min après cet accès ;
// sinon elle se joue à l'heure configurée comme avant. ──
const EVE_LATE_ARRIVAL_DELAY_MS = 30 * 60 * 1000;
const eveFirstAccessKey = (slug: string, checkoutDayIso: string) =>
  `hub-voice-eve-first-${slug}-${checkoutDayIso}`;

/** Mémorise le 1er accès au hub pour ce séjour (clé par date de départ —
 *  un nouveau séjour ré-arme naturellement). Appel silencieux si déjà fait. */
export function markEveFirstAccess(slug: string, checkoutDayIso: string): void {
  const key = eveFirstAccessKey(slug, checkoutDayIso);
  if (readFlag<number>(key) != null) return;
  writeFlag(key, Date.now());
}

/** L'annonce de veille est-elle due ?
 *  - 1er accès AVANT l'heure configurée → due à partir de cette heure ;
 *  - 1er accès APRÈS l'heure configurée → due 30 min après cet accès. */
export function isEveAnnounceDue(
  slug: string,
  checkoutDayIso: string,
  eveHour: number,
): boolean {
  const now = new Date();
  const eveStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    eveHour,
    0,
    0,
    0,
  ).getTime();
  const first = readFlag<number>(eveFirstAccessKey(slug, checkoutDayIso));
  const base = typeof first === 'number' ? first : Date.now();
  const scheduledAt = base > eveStart ? base + EVE_LATE_ARRIVAL_DELAY_MS : Math.max(eveStart, base);
  return Date.now() >= scheduledAt;
}

/** Jour du départ : pont de 3 min par session (sessionStorage). */
export function shouldPlayCheckoutDay(slug: string): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(daySessionKey(slug)) ?? 0);
    return Date.now() - last > DAY_REPEAT_MIN_GAP_MS;
  } catch {
    return true;
  }
}

export function markCheckoutDayPlayed(slug: string): void {
  try {
    window.sessionStorage.setItem(daySessionKey(slug), String(Date.now()));
  } catch {
    /* session indisponible → chaque ouverture jouera, acceptable */
  }
}

/** Date de check-out au format jour local YYYY-MM-DD (comparaison stable
 *  avec le marquage local, indépendante du fuseau serveur UTC). */
export function checkoutDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
