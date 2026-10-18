import { runCoachDailyReports } from '../src/lib/coach-report';
import { db } from '../src/lib/db';

async function main() {
  // 1. Assure des préférences actives pour l'utilisateur démo
  const user = await db.user.findUnique({ where: { email: 'demo@qrdomotik.roomscan.pro' } });
  if (!user) throw new Error('demo user introuvable');
  await db.coachPreferences.upsert({
    where: { userId: user.id },
    update: { reportFrequency: 'daily', reportTime: '00:00' },
    create: { userId: user.id, reportFrequency: 'daily', reportTime: '00:00' },
  });

  // 2. Lance le runner (force = ignore heure + anti-doublon)
  const summary = await runCoachDailyReports({ force: true, now: new Date() });
  console.log('SUMMARY', JSON.stringify(summary));

  // 3. Vérifie l'email dans l'outbox
  const out = await db.emailOutbox.findFirst({
    where: { template: 'coach_daily_report', userId: user.id },
    orderBy: { createdAt: 'desc' },
  });
  console.log('OUTBOX', JSON.stringify({
    id: out?.id,
    to: out?.to,
    subject: out?.subject,
    status: out?.status,
    hasHtml: Boolean(out?.htmlBody?.includes('Briefing du')),
    hasActionBtn: Boolean(out?.htmlBody?.includes('Ouvrir mon tableau de bord')),
    textLen: out?.textBody?.length ?? 0,
    insightsCount: out?.metaJson?.includes('"insightsCount"')
      ? JSON.parse(out.metaJson).insightsCount
      : null,
  }));

  await db.$disconnect();
}

main().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
