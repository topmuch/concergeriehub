// =============================================================
// INSTRUMENTATION NEXT.JS — SCHEDULER INTERNE EMBARQUÉ (v4.102)
// -------------------------------------------------------------
// CORRECTIF « CRON JOB BLOQUÉ : monitoring-tick » (octobre 2026) :
// la Tour de Contrôle dépendait d'un CRON EXTERNE (tâche planifiée
// Coolify) pour exécuter /api/admin/monitoring-tick. Quand ce cron
// externe s'arrête (image sans curl, quota, URL, secret…), le
// monitoring s'arrête AVEC lui — plus aucune détection, plus aucun
// email d'alerte (le gardien dormait avec le gardien surveillé).
//
// FIX : l'application exécute ELLE-MÊME ses traitements périodiques
// en se POSTant ses propres endpoints cron (fetch PUR — aucun import
// de module Node, aucun accès DB direct) :
//   • monitoring-tick     — toutes les 5 min (Tour de Contrôle)
//   • daily-automations   — toutes les 24 h (briefing/rapports du jour)
//   • coach-reports       — toutes les heures (briefings Coach)
//   • monitoring-cleanup  — toutes les 26 h (purge métriques/logs)
//
// v4.102 — REBUILD EDGE-SAFE : la version initiale importait
// directement le moteur de monitoring (monitoring-engine → email →
// nodemailer → fs/net/node:dns). Next 16 compile instrumentation
// pour Node ET Edge : le bundle Edge ne peut pas résoudre ces
// modules → UnhandledSchemeError → TOUS les builds échouaient
// (« Module not found: Can't resolve 'fs' » / « Reading from
// "node:dns" is not handled »). Désormais le scheduler n'importe
// RIEN : il POSTe sur les endpoints cron existants (qui gèrent
// déjà l'auth CRON_SECRET, le travail réel et logCronRun) —
// graph d'imports vide, compatible Node ET Edge.
//
// Planification en MÉMOIRE (globalThis) : au boot, chaque job part
// une fois (rattrapage) puis respecte son intervalle. Les endpoints
// sont IDEMPOTENTS (briefing Coach « deja_envoye », automations
// 1×/jour, cleanup purge bornée) → aucun doublon d'effet, y compris
// en cas de collision avec le cron externe (optionnel, toujours
// supporté).
//
// Garde-fous :
//   • NEXT_RUNTIME !== 'nodejs' → inertes (edge/middleware) ;
//   • CRON_SECRET absent → inertes (les endpoints sont fail-closed,
//     le cron externe prend le relais) ;
//   • INTERNAL_CRON_DISABLED=1 → désactivable par variable d'env ;
//   • garde globalThis → aucun double démarrage (hot-reload dev) ;
//   • 1 job à la fois (les suivants patientent au battement suivant) ;
//   • warm-up 35 s après le boot (laisser le serveur + DB prêts) ;
//   • timers unref() → ne maintiennent JAMAIS le process en vie ;
//   • chaque appel borné (AbortController 4 min) + try/catch global.
// =============================================================

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.INTERNAL_CRON_DISABLED === '1') return;

  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    // Endpoints fail-closed : sans secret, un auto-appel serait 403.
    // Le cron externe (Coolify) reste le seul déclencheur.
    console.warn(
      '[scheduler] CRON_SECRET absent — scheduler interne inerte (le cron externe prend le relais).',
    );
    return;
  }

  const g = globalThis as typeof globalThis & {
    __roomscanSchedulerStarted?: boolean;
    __roomscanSchedulerLastRun?: Partial<Record<string, number>>;
  };
  if (g.__roomscanSchedulerStarted) return;
  g.__roomscanSchedulerStarted = true;
  g.__roomscanSchedulerLastRun = {};

  const WARMUP_MS = 35_000; // laisse le serveur + Prisma monter
  const BEAT_MS = 60_000; // 1 battement par minute
  const CALL_TIMEOUT_MS = 4 * 60_000; // coach-reports peut durer (emails)

  /** Intervalle minimal entre deux passages du même job (ms). */
  const INTERVAL_MS: Record<string, number> = {
    'monitoring-tick': 5 * 60_000,
    'coach-reports': 60 * 60_000,
    'evening-briefings': 60 * 60_000, // v5.19 — bilan du soir 18 h (route : échéance + anti-doublon)
    'daily-automations': 24 * 60 * 60_000,
    'monitoring-cleanup': 26 * 60 * 60_000,
  };

  /** Ordre de priorité si plusieurs jobs sont dus au même battement. */
  const JOB_ORDER = [
    'monitoring-tick',
    'daily-automations',
    'evening-briefings',
    'coach-reports',
    'monitoring-cleanup',
  ] as const;

  type JobName = (typeof JOB_ORDER)[number];

  /** Endpoint de chaque job (les routes font le travail + logCronRun). */
  const JOB_ENDPOINT: Record<JobName, string> = {
    'monitoring-tick': '/api/admin/monitoring-tick',
    'daily-automations': '/api/admin/trigger-daily-automations',
    'evening-briefings': '/api/admin/trigger-evening-briefings',
    'coach-reports': '/api/admin/trigger-coach-reports',
    'monitoring-cleanup': '/api/admin/monitoring-cleanup',
  };

  /**
   * Base du self-fetch. PROD : domaine public. DEV : localhost
   * (ne jamais mesurer/appeler la prod depuis un serveur de dev).
   */
  function selfBaseUrl(): string {
    if (process.env.NODE_ENV !== 'production') {
      return `http://127.0.0.1:${process.env.PORT ?? 3000}`;
    }
    return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://roomscan.pro').replace(
      /\/$/,
      '',
    );
  }

  let busy = false; // 1 job à la fois, jamais en parallèle

  async function runJob(jobName: JobName): Promise<void> {
    const base = selfBaseUrl();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
    const startedAt = Date.now();
    try {
      const res = await fetch(`${base}${JOB_ENDPOINT[jobName]}`, {
        method: 'POST',
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${cronSecret}`,
          'User-Agent': 'roomscan-scheduler/1.0',
        },
      });
      const body = await res.text();
      const last = g.__roomscanSchedulerLastRun ?? {};
      last[jobName] = Date.now();
      g.__roomscanSchedulerLastRun = last;
      if (res.ok) {
        console.log(
          `[scheduler] ${jobName} OK (${Math.round((Date.now() - startedAt) / 1000)} s) — ${body.slice(0, 200)}`,
        );
      } else {
        console.error(
          `[scheduler] ${jobName} HTTP ${res.status} — ${body.slice(0, 200)}`,
        );
      }
    } catch (error) {
      console.error(`[scheduler] job ${jobName} échoué :`, error);
    } finally {
      clearTimeout(timer);
    }
  }

  async function beat(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const now = Date.now();
      for (const jobName of JOB_ORDER) {
        const last = g.__roomscanSchedulerLastRun?.[jobName];
        if (last && now - last < INTERVAL_MS[jobName]) continue; // pas encore dû
        await runJob(jobName);
        break; // 1 job par battement : les autres attendent le suivant
      }
    } finally {
      busy = false;
    }
  }

  // Premier battement après le warm-up (rattrapage : chaque job repart
  // une fois — les endpoints idempotents écartent les doublons), puis
  // un battement par minute.
  const warmup = setTimeout(() => {
    void beat();
    const interval = setInterval(() => void beat(), BEAT_MS);
    if (typeof interval.unref === 'function') interval.unref();
  }, WARMUP_MS);
  if (typeof warmup.unref === 'function') warmup.unref();
}
