// =============================================================
// TEST RUNTIME — Moteur Coach Roomscan (exécuté hors Next via bun)
// NODE_ENV=production bun run scripts/test-insight-engine.ts
// Lecture seule : aucune écriture DB.
// =============================================================
import { db } from '../src/lib/db';
import { generateInsights } from '../src/lib/insight-engine';

async function main() {
  const props = await db.property.findMany({
    select: { id: true, name: true },
    take: 3,
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Biens trouvés : ${props.length}`);

  for (const p of props) {
    const insights = await generateInsights(p.id);
    console.log(`\n=== ${p.name} (${p.id}) → ${insights.length} insight(s) ===`);
    for (const i of insights.slice(0, 8)) {
      console.log(`  [${i.priority} · score ${i.score}] (${i.type}) ${i.title}`);
      console.log(`     action → ${i.actionLabel} (${i.actionUrl})`);
    }
  }

  // Smoke test : les 4 nouveaux modèles sont bien accessibles.
  const [ins, prefs, actions, analytics] = await Promise.all([
    db.dashboardInsight.count(),
    db.coachPreferences.count(),
    db.insightAction.count(),
    db.coachAnalytics.count(),
  ]);
  console.log('\nNouveaux modèles OK :', {
    dashboardInsight: ins,
    coachPreferences: prefs,
    insightAction: actions,
    coachAnalytics: analytics,
  });

  await db.$disconnect();
}

main().catch((e) => {
  console.error('ÉCHEC :', e);
  process.exit(1);
});
