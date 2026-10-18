import { db } from '../src/lib/db';
import { hash, compare } from 'bcryptjs';
// Vérifie le hash actuel de demo@ (mot de passe inconnu) → réinitialise à Host2024!
const u = await db.user.findUnique({ where: { email: 'demo@qrdomotik.roomscan.pro' } });
if (!u) { console.log('demo@ absent'); process.exit(1); }
await db.user.update({ where: { id: u.id }, data: { passwordHash: await hash('Host2024!', 10) } });
console.log('demo@ password réinitialisé à Host2024!');
const props = await db.property.findMany({ where: { ownerId: u.id }, select: { id: true, name: true } });
console.log('biens du démo:', JSON.stringify(props));
await db.$disconnect();
