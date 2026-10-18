import { db } from '../src/lib/db';
const pid = 'cmuzcvam30001jasgubv223e8';

// 1) Active le verrouillage + minibar sur le bien de test
const prop = await db.property.findUnique({ where: { id: pid }, select: { premiumFeatures: true } });
const pf = (prop?.premiumFeatures && typeof prop.premiumFeatures === 'object' ? prop.premiumFeatures : {}) as Record<string, unknown>;
pf.hubLock = { enabled: true, checkoutInstructions: 'Laissez les clés sur la table de la cuisine et éteignez la climatisation.', allowLateRequest: true };
pf.enableMinibar = true;
pf.minibar = { enabled: true, items: [
  { id: 'mb-water', name: 'Eau minérale 50 cl', emoji: '💧', price: 2, free: true },
  { id: 'mb-beer', name: 'Bière locale', emoji: '🍺', price: 4 },
] };
await db.property.update({ where: { id: pid }, data: { premiumFeatures: pf } });
console.log('hubLock activé sur Villa Test Palmiers');

// 2) Crée une réservation avec téléphone (code = 4 derniers chiffres)
const ci = new Date(Date.now() - 24 * 3600_000); // hier
const co = new Date(Date.now() + 36 * 3600_000); // après-demain 11h UTC approx
const existing = await db.booking.findFirst({ where: { propertyId: pid, guestName: 'Camille Laurent' } });
if (existing) {
  await db.booking.delete({ where: { id: existing.id } });
}
const booking = await db.booking.create({
  data: {
    propertyId: pid,
    guestName: 'Camille Laurent',
    guestPhone: '+33698765432',
    checkIn: ci,
    checkOut: new Date(Date.now() + 36 * 3600_000),
    guests: 2,
    source: 'MANUAL',
    status: 'CONFIRMED',
  },
});
console.log('booking créé:', booking.id, 'code attendu: 5432');
await db.$disconnect();
