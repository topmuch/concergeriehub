// =============================================================
// ÉTAPE 21 (V3) — Rate limiting multi-instance (Coolify-ready)
//
// Abstraction commune aux endpoints sensibles :
//  - REDIS_URL définie → store Redis partagé (ioredis, importé
//    dynamiquement : aucun coût au démarrage, connexion lazy) ;
//  - sinon → store mémoire local (dev / mono-instance, héritage 17.x).
//
// Sémantique : fenêtre fixe de 60 s par clé. Redis rend la limite
// effective sur TOUTES les instances (multi-réplicas Coolify) ;
// le fallback mémoire reste correct en mono-instance.
//
// Fail-open assumé : si Redis est indisponible, on laisse passer
// (priorité disponibilité > anti-spam ; les garde-fous métier restent).
// =============================================================

const WINDOW_MS = 60_000;

/** Sous-ensemble minimal de l'API ioredis utilisé par le limiter. */
interface RedisLike {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  on(event: string, cb: () => void): unknown;
}

let redisClient: RedisLike | null = null;
let redisTried = false;

/** Connexion lazy unique — null si REDIS_URL absente ou injoignable. */
async function getRedis(): Promise<RedisLike | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (redisTried) return redisClient;
  redisTried = true;
  try {
    const { default: Redis } = await import('ioredis');
    const client = new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      // Le rate limiter ne doit jamais planter l'app
      retryStrategy: (times: number) => (times > 3 ? null : Math.min(times * 500, 2000)),
    }) as unknown as RedisLike;
    client.on('error', () => {
      /* silencieux — fail-open géré par l'appelant */
    });
    redisClient = client;
    return client;
  } catch {
    redisClient = null;
    return null;
  }
}

// ── Store mémoire (fallback) ──
const memoryBuckets = new Map<string, number[]>();

/** true = autorisé, false = limite atteinte (max requêtes / 60 s). */
export async function rateLimit(key: string, maxPerMinute = 10): Promise<boolean> {
  const max = Math.max(1, maxPerMinute);

  const redis = await getRedis();
  if (redis) {
    try {
      const redisKey = `rl:${key}:${Math.floor(Date.now() / WINDOW_MS)}`;
      const count = await redis.incr(redisKey);
      if (count === 1) await redis.pexpire(redisKey, WINDOW_MS + 1000);
      return count <= max;
    } catch {
      // Redis indisponible → fallback mémoire (fail-open, jamais throw)
    }
  }

  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const arr = (memoryBuckets.get(key) || []).filter((t) => t > windowStart);
  if (arr.length >= max) {
    memoryBuckets.set(key, arr);
    return false;
  }
  arr.push(now);
  memoryBuckets.set(key, arr);
  // Hygiène mémoire : purge périodique des clés froides
  if (memoryBuckets.size > 5000) {
    for (const [k, v] of memoryBuckets) {
      if (v.every((t) => t <= windowStart)) memoryBuckets.delete(k);
    }
  }
  return true;
}
