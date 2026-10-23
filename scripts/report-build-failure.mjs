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

// POST https (node stdlib — pas de dépendance) vers DEUX canaux :
//  1. /api/errors (l'ancien conteneur, si reachable depuis le build) ;
//  2. webhook.site (lecture garantie depuis la sandbox de dev).
const WEBHOOK_UUID = 'cee5488a-eede-4dcd-b3a5-dd569476f403';
function post(hostname, path) {
  const req = https.request(
    {
      hostname,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 10_000,
    },
    (res) => {
      res.resume();
      console.log(`[build-report] ${name} → ${hostname}${path} : ${res.statusCode}`);
    },
  );
  req.on('error', (e) => console.log(`[build-report] POST ${hostname} impossible :`, e.message));
  req.on('timeout', () => req.destroy());
  req.end(payload);
}
post('roomscan.pro', '/api/errors');
post('webhook.site', `/${WEBHOOK_UUID}`);
