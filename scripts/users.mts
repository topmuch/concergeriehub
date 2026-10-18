import { db } from '../src/lib/db';
const users = await db.user.findMany({ select: { email: true, role: true }, take: 5 });
console.log(JSON.stringify(users));
await db.$disconnect();
