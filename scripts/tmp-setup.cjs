const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const propId = 'cmuzcvam30001jasgubv223e8';
  // Règles d'automatisation du bien
  let rules = await db.automationRule.findMany({ where: { propertyId: propId } });
  console.log('RULES AVANT:', rules.map(r => r.key).join(', ') || 'AUCUNE');
  // Booking départ aujourd'hui + reviewShield activé ?
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const booking = await db.booking.create({
    data: {
      propertyId: propId,
      guestName: 'Jean Testeur',
      guestEmail: 'jean.testeur@example.com',
      guestPhone: '+33612345678',
      checkIn: new Date(today.getTime() - 5 * 86400000),
      checkOut: today,
      guests: 2,
      source: 'MANUAL',
      status: 'CONFIRMED',
    },
  });
  console.log('BOOKING:', booking.id);
  const prop = await db.property.findUnique({ where: { id: propId }, select: { premiumFeatures: true, name: true } });
  console.log('PREMIUM:', JSON.stringify(prop?.premiumFeatures));
  await db.$disconnect();
})();
