const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  // Simule checkDailyAutomations : règles actives → runDailyAutomations
  // (via les fonctions TS → appel indirect : déclenche via un tick manuel)
  // Ici : on vérifie côté DB après l'appel HTTP admin (plus haut niveau).
  const bookings = await db.booking.findMany({
    where: { propertyId: 'cmuzcvam30001jasgubv223e8' },
    select: { id: true, guestName: true, feedbackToken: true, lateCheckoutStatus: true },
  });
  console.log('BOOKINGS:', JSON.stringify(bookings, null, 1));
  await db.$disconnect();
})();
