import { db } from '../src/lib/db';
import { compare } from 'bcryptjs';
const u = await db.user.findUnique({ where: { email: 'demo@qrdomotik.roomscan.pro' } });
console.log('hash présent:', !!u?.passwordHash);
if (u?.passwordHash) console.log('Host2024! match:', await compare('Host2024!', u.passwordHash));
await db.$disconnect();
