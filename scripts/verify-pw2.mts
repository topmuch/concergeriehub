import { db } from '../src/lib/db';
import { compare } from 'bcryptjs';
const u = await db.user.findUnique({ where: { email: 'sofia@exemple.fr' } });
console.log('sofia présente:', !!u);
if (u?.passwordHash) console.log('Host2024! match:', await compare('Host2024!', u.passwordHash));
const prop = u ? await db.property.findFirst({ where: { ownerId: u.id }, select: { id: true, name: true } }) : null;
console.log('bien:', prop);
await db.$disconnect();
