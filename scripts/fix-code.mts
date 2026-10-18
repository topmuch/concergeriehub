import { db } from '../src/lib/db';
const b = await db.booking.findFirst({ where: { guestName: 'Camille Laurent' } });
if (!b) { console.log('booking introuvable'); process.exit(1); }
await db.booking.update({ where: { id: b.id }, data: { accessCode: '5432' } });
console.log('accessCode=5432 posé sur', b.id);
await db.$disconnect();
