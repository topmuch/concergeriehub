// Purge des données démo B2B (dev only — avant reseed)
import { db } from '../src/lib/db';

async function main() {
  const prop = await db.property.findFirst({ where: { name: 'Loft Canal Saint-Martin' } });
  if (prop) {
    await db.physicalQrCode.deleteMany({ where: { propertyId: prop.id } });
    await db.property.delete({ where: { id: prop.id } });
    console.log('Bien + plaques supprimés');
  }
  const users = await db.user.findMany({ where: { email: { contains: '@pro.conciergerie-hub.fr' } } });
  for (const u of users) await db.user.delete({ where: { id: u.id } });
  console.log('Prestataires supprimés :', users.length);
}
main().catch(console.error).finally(() => process.exit(0));
