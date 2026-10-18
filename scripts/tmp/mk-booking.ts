import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const prop = await db.property.findFirst({ where: { name: 'Villa Test Palmiers' }, select: { id: true } });
  if (!prop) throw new Error('bien introuvable');
  const ci = new Date(Date.now() - 3600000);
  const co = new Date(Date.now() + 3 * 86400000);
  const b = await db.booking.create({
    data: { propertyId: prop.id, guestName: 'Camille Test UI', guestEmail: 'camille-ui@exemple.fr', checkIn: ci, checkOut: co, guests: 2, source: 'MANUAL', status: 'CONFIRMED', accessCode: '2468' },
  });
  console.log(b.id);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
