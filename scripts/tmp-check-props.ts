import { db } from '@/lib/db';
async function main() {
  const props = await db.property.findMany({ select: { id: true, name: true, qrHubSlug: true, isActive: true } });
  for (const p of props) console.log(`- ${p.name} | ${p.qrHubSlug} | active=${p.isActive}`);
  const offers = await db.serviceOffer.findMany({ select: { id: true, name: true, unitPrice: true, propertyId: true }, orderBy: { unitPrice: 'asc' } });
  for (const o of offers.slice(0, 4)) console.log(`OFFER ${o.id} | ${o.name} | ${o.unitPrice}€`);
  await db.$disconnect();
}
main();
