// =============================================================
// v5.3 — TÉLÉMÉTRIE DE BUILD (diagnostic Coolify).
// Chaque couche sensible du Dockerfile (bun install, prisma
// generate, db push, next build) est exécutée via ce helper : en
// cas d'échec, les 40 dernières lignes du log sont téléversées
// vers /api/errors de l'ANCIEN conteneur (encore UP pendant le
// build) → lisibles dans /admin/logs. AUCUN secret dans ces logs
// (texte du compilateur / gestionnaire de paquets uniquement).
//
// Usage : node scripts/report-build-failure.mjs <nom-étape> <exit> <log-path>
// =============================================================
import { readFileSync } from 'fs';
import https from 'https';

const [name, exitArg, logPath] = process.argv.slice(2);
const exit = Number(exitArg ?? '1');
let log = '';
try {
  log = readFileSync(logPath ?? '/tmp/unknown.log', 'utf8');
} catch {
  log = '(log illisible)';
}

const payload = JSON.stringify({
  source: 'coolify-build',
  message: `étape ${name ?? '?'} échouée (exit ${exit}, log ${log.length} chars)`,
  stack: log.slice(-3500),
  url: 'https://roomscan.pro/_diagnostic/build',
});

// POST https (node stdlib — pas de dépendance).
const req = https.request(
  {
    hostname: 'roomscan.pro',
    path: '/api/errors',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    timeout: 10_000,
  },
  (res) => {
    res.resume();
    console.log(`[build-report] ${name} → /api/errors : ${res.statusCode}`);
  },
);
req.on('error', (e) => console.log('[build-report] POST impossible :', e.message));
req.on('timeout', () => req.destroy());
req.end(payload);
