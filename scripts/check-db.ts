import { db } from '../src/lib/db';
const props = await db.property.findMany({ select: { id: true, name: true, qrHubSlug: true }, take: 10 });
console.log(JSON.stringify(props, null, 1));
db.$disconnect();
