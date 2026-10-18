import { runMonitoringTick, runMonitoringCleanup, logCronRun } from '../src/lib/monitoring-engine';
import { db } from '../src/lib/db';

async function main() {
  // Seed d'un cron log « monitoring-tick » initial (comme si le cron venait de passer)
  await logCronRun('monitoring-tick', 'SUCCESS', 1234);

  const tick = await runMonitoringTick();
  console.log('TICK', JSON.stringify({
    ok: tick.ok,
    status: tick.status,
    api: tick.apiResponseTime,
    db: tick.dbResponseTime,
    anomalies: tick.anomalies.length,
    newIncidents: tick.newIncidents.length,
    emails: tick.emailsSent,
    errors: tick.errors,
  }));

  const cleanup = await runMonitoringCleanup();
  console.log('CLEANUP', JSON.stringify(cleanup));

  const metric = await db.systemMetric.findFirst({ orderBy: { timestamp: 'desc' } });
  console.log('METRIC', JSON.stringify({
    api: metric?.apiResponseTime,
    db: metric?.dbResponseTime,
    status: metric?.status,
    external: metric?.externalChecks?.slice(0, 80),
  }));

  const crons = await db.cronLog.count();
  console.log('CRONLOGS', crons);

  await db.$disconnect();
}

main().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
