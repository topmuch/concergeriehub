import { db } from '@/lib/db';
const b = await db.booking.findUnique({ where: { id: 'cmuzvwhq80001r89na0g5gknq' }, select: { id: true } });
console.log(b?.id ?? '');
process.exit(0);
