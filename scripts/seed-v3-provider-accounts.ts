// =============================================================
// ÉTAPE 17.4 (V3) — Comptes prestataires du portail
// Attribue un mot de passe aux Users prestataires seedés sans
// mot de passe (passwordHash null) pour rendre le Portail
// Prestataire (/provider) connectable en démo.
// Idempotent : ne modifie JAMAIS un compte qui a déjà un mot de passe.
// Usage : bun run scripts/seed-v3-provider-accounts.ts
// =============================================================
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';

const DEMO_PASSWORD = 'Presta2024!';

async function main() {
  const providers = await db.provider.findMany({
    select: {
      id: true,
      businessName: true,
      audience: true,
      isActive: true,
      user: { select: { id: true, email: true, passwordHash: true, isActive: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Prestataires trouvés : ${providers.length}`);
  let updated = 0;

  for (const p of providers) {
    const label = `${p.businessName} <${p.user.email}> [${p.audience}]`;
    if (p.user.passwordHash) {
      console.log(`· déjà connectable : ${label}`);
      continue;
    }
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    await db.user.update({
      where: { id: p.user.id },
      data: { passwordHash },
    });
    updated += 1;
    console.log(`✓ mot de passe attribué : ${label}`);
  }

  console.log(`\nTerminé : ${updated} compte(s) mis à jour, ${providers.length - updated} déjà OK.`);
  console.log(`Mot de passe démo : ${DEMO_PASSWORD}`);
  console.log('\nComptes GUEST_EXPERIENCE (expérience invité) :');
  for (const p of providers.filter((x) => x.audience === 'GUEST_EXPERIENCE')) {
    console.log(`  ${p.isActive ? '🟢' : '🔴'} ${p.businessName} — ${p.user.email}`);
  }
  await process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
