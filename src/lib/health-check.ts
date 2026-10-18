// =============================================================
// HEALTH CHECK — « TOUR DE CONTRÔLE » (v5.6, Phase 1)
//
// fetchHealthData() : vérifie tous les composants critiques de
// RoomScan et renvoie un rapport JSON. Source unique partagée par :
//   • la route publique GET /api/health (sondes Coolify/UptimeRobot) ;
//   • le moteur de monitoring (monitoring-engine.ts, tick 5 min).
//
// Checks :
//   • db      — ping Prisma `SELECT 1` mesuré (obligatoire).
//   • stripe  — GET /v1/balance api.stripe.com (timeout 3 s) si
//               STRIPE_SECRET_KEY configurée, sinon 'not_configured'.
//   • smtp    — connexion TCP host:port (timeout 3 s) si SMTP_HOST
//               configurée, sinon 'not_configured' (v4.95 : Resend
//               retiré, SMTP = seul provider email).
//   • disk    — fs.statfs sur '/'' (optionnel : null si indisponible,
//               conteneurs sans cgroup disque dédié).
//
// Statut global :
//   • DOWN     — DB injoignable (site inutilisable) ;
//   • DEGRADED — Stripe ou SMTP en échec (paiements/emails impactés)
//                ou latence DB > 500 ms ;
//   • OK       — tout va bien.
// Aucune donnée sensible n'est renvoyée (statuts + latences only).
// =============================================================

import { promises as fsPromises } from 'fs';
import net from 'net';
import { db } from '@/lib/db';

export type CheckStatus = 'up' | 'down' | 'degraded' | 'not_configured' | 'skipped';

export interface ExternalCheck {
  status: CheckStatus;
  latencyMs: number | null;
  error?: string;
}

export interface HealthReport {
  status: 'OK' | 'DEGRADED' | 'DOWN';
  totalMs: number;
  checks: {
    db: { status: CheckStatus; latencyMs: number; error?: string };
    stripe: ExternalCheck;
    smtp: ExternalCheck;
    disk: { usagePercent: number | null; error?: string };
  };
  timestamp: string;
}

const EXTERNAL_TIMEOUT_MS = 3_000;
const DB_SLOW_MS = 500; // seuil « dégradé » (habituels : < 50 ms)

/** Ping HTTP avec timeout strict — renvoie null en cas d'échec/timeout. */
async function timedPing(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; latencyMs: number; httpStatus?: number; error?: string }> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return { ok: res.ok, latencyMs: Date.now() - startedAt, httpStatus: res.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'échec réseau';
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: message.includes('abort') ? `timeout ${EXTERNAL_TIMEOUT_MS} ms` : message,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Ping Stripe (solde du compte plateforme) — 3 s max. */
async function pingStripe(): Promise<ExternalCheck> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return { status: 'not_configured', latencyMs: null };
  const res = await timedPing('https://api.stripe.com/v1/balance', {
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
  });
  return res.ok
    ? { status: 'up', latencyMs: res.latencyMs }
    : { status: 'down', latencyMs: res.latencyMs, error: res.error ?? `HTTP ${res.httpStatus}` };
}

/** Ping SMTP — connexion TCP host:port — 3 s max (aucune auth, juste joignable). */
async function pingSmtp(): Promise<ExternalCheck> {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT?.trim() || 0);
  if (!host || !port) return { status: 'not_configured', latencyMs: null };
  const startedAt = Date.now();
  return new Promise<ExternalCheck>((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (check: ExternalCheck) => {
      socket.destroy();
      resolve(check);
    };
    const timer = setTimeout(
      () => done({ status: 'down', latencyMs: Date.now() - startedAt, error: `timeout ${EXTERNAL_TIMEOUT_MS} ms` }),
      EXTERNAL_TIMEOUT_MS,
    );
    socket.once('connect', () => {
      clearTimeout(timer);
      done({ status: 'up', latencyMs: Date.now() - startedAt });
    });
    socket.once('error', (err: Error) => {
      clearTimeout(timer);
      done({ status: 'down', latencyMs: Date.now() - startedAt, error: err.message.slice(0, 120) });
    });
  });
}

/** Espace disque (best effort — null si indisponible dans le conteneur). */
async function diskUsagePercent(): Promise<{ usagePercent: number | null; error?: string }> {
  try {
    // fs.statfs — Node ≥ 18.15 / Bun. Non supporté sur certains FS → catch.
    const statfs = (fsPromises as unknown as {
      statfs?: (path: string) => Promise<{ blocks: number; bavail: number }>;
    }).statfs;
    if (!statfs) return { usagePercent: null, error: 'statfs indisponible' };
    const s = await statfs('/');
    const used = s.blocks - s.bavail;
    return { usagePercent: s.blocks > 0 ? Math.round((used / s.blocks) * 1000) / 10 : null };
  } catch (error) {
    return {
      usagePercent: null,
      error: error instanceof Error ? error.message.slice(0, 80) : 'mesure impossible',
    };
  }
}

/** Rapport de santé complet — n'expose aucune donnée métier. */
export async function fetchHealthData(): Promise<HealthReport> {
  const startedAt = Date.now();

  // DB d'abord : c'est le composant vital.
  const dbStartedAt = Date.now();
  let dbOk = true;
  let dbError: string | undefined;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch (error) {
    dbOk = false;
    dbError = error instanceof Error ? error.message.slice(0, 160) : 'ping DB échoué';
  }
  const dbLatency = Date.now() - dbStartedAt;

  // Externes en parallèle (jamais bloquants — timeouts internes).
  const [stripe, smtp, disk] = await Promise.all([pingStripe(), pingSmtp(), diskUsagePercent()]);

  const totalMs = Date.now() - startedAt;
  const status: HealthReport['status'] = !dbOk
    ? 'DOWN'
    : stripe.status === 'down' || smtp.status === 'down' || dbLatency > DB_SLOW_MS
      ? 'DEGRADED'
      : 'OK';

  return {
    status,
    totalMs,
    checks: {
      db: { status: dbOk ? 'up' : 'down', latencyMs: dbLatency, error: dbError },
      stripe,
      smtp,
      disk,
    },
    timestamp: new Date().toISOString(),
  };
}
