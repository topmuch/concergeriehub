import { db } from '../src/lib/db';
await db.user.update({ where: { email: 'demo@qrdomotik.roomscan.pro' }, data: { onboardingCompleted: true } });
console.log('onboardingCompleted=true');
await db.$disconnect();
