// =============================================================
// Seed des modèles email (DB) — FIX-12
// Insère (upsert par key) les templates canoniques extraits du
// code existant (lib/email-templates.ts → lib/email-template-defaults.ts)
// dans la table email_templates, pour l'éditeur /admin/emails → Modèles.
//
// Idempotent :
//  - clé absente  → création (isActive=true par défaut) ;
//  - clé présente → remise au canon (subject/htmlBody/description),
//    isActive COURANT conservé (le seed ne ré-active pas un modèle
//    volontairement désactivé par le Superadmin).
// ⚠️ Ré-import canonique : les éventuelles éditions Superadmin du
// sujet/corps sont écrasées par ce script (reset volontaire).
//
// Run : bun run scripts/seed-email-templates.ts
// =============================================================
import { db } from '../src/lib/db';
import { EMAIL_TEMPLATE_DEFAULTS } from '../src/lib/email-template-defaults';

async function main() {
  for (const tpl of EMAIL_TEMPLATE_DEFAULTS) {
    const existing = await db.emailTemplate.findUnique({
      where: { key: tpl.key },
      select: { id: true, isActive: true },
    });
    if (existing) {
      await db.emailTemplate.update({
        where: { key: tpl.key },
        data: { subject: tpl.subject, htmlBody: tpl.htmlBody, description: tpl.description },
      });
      console.log(`↻ ${tpl.key} — mis au canon (isActive conservé : ${existing.isActive})`);
    } else {
      await db.emailTemplate.create({
        data: { key: tpl.key, subject: tpl.subject, htmlBody: tpl.htmlBody, description: tpl.description },
      });
      console.log(`+ ${tpl.key} — créé`);
    }
  }
  const count = await db.emailTemplate.count();
  console.log(`✅ ${count} modèle(s) email présent(s) dans email_templates.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed email-templates failed:', error);
    process.exit(1);
  });
