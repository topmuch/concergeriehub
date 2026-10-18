import { runMonitoringTick } from '../src/lib/monitoring-engine';
import { db } from '../src/lib/db';

async function main() {
  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 2 * 60 * 1000);

  // ── SIMULATION 1 : pic d'erreurs serveur (11 erreurs runtime < 5 min) ──
  await db.auditLog.createMany({
    data: Array.from({ length: 11 }).map((_, i) => ({
      actorEmail: 'system',
      action: 'runtime.error',
      entityType: 'simulation.test',
      detailsJson: JSON.stringify({ message: `fake error ${i}`, name: 'TestError' }),
      createdAt: fiveMinAgo,
    })),
  });

  // ── SIMULATION 2 : cron daily-automations en retard (28 h) ──
  await db.cronLog.create({
    data: {
      jobName: 'daily-automations',
      status: 'SUCCESS',
      duration: 5000,
      executedAt: new Date(now.getTime() - 28 * 60 * 60 * 1000),
    },
  });

  const tick = await runMonitoringTick();
  console.log('TICK', JSON.stringify({
    anomalies: tick.anomalies.map((a) => `[${a.severity}/${a.category}] ${a.title}`),
    newIncidents: tick.newIncidents.map((i) => `${i.title} (${i.severity})`),
    emails: tick.emailsSent,
  }));

  // Vérifie l'incident + l'email en outbox
  const incidents = await db.systemIncident.findMany({
    where: { isResolved: false },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  console.log('INCIDENTS', JSON.stringify(incidents.map((i) => ({ sev: i.severity, cat: i.category, title: i.title, occ: i.occurrences }))));

  const alertEmail = await db.emailOutbox.findFirst({
    where: { template: 'system_alert' },
    orderBy: { createdAt: 'desc' },
  });
  console.log('ALERT_EMAIL', JSON.stringify({
    to: alertEmail?.to,
    subject: alertEmail?.subject?.slice(0, 80),
    status: alertEmail?.status,
  }));

  // ── Re-tick immédiat : l'incident existant doit être incrémenté, PAS recréé ──
  const tick2 = await runMonitoringTick();
  console.log('TICK2', JSON.stringify({
    newIncidents: tick2.newIncidents.length,
    emails: tick2.emailsSent,
  }));
  const pic = await db.systemIncident.findFirst({ where: { title: "Pic d'erreurs serveur" } });
  console.log('PIC_OCCURRENCES', pic?.occurrences, '(attendu: 2 — dédup OK)');

  // ── NETTOYAGE de la simulation ──
  await db.auditLog.deleteMany({ where: { entityType: 'simulation.test' } });
  await db.cronLog.deleteMany({ where: { jobName: 'daily-automations' } });
  console.log('SIMULATION CLEANED');

  await db.$disconnect();
}

main().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
