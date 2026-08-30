const { hash } = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function setup() {
  const demoUser = await prisma.user.findUnique({ where: { email: 'demo@qrdomotik.roomscan.pro' } });
  if (!demoUser) { console.log('No demo user'); return; }

  const pinHash = await hash('1234', 10);
  let home = await prisma.home.findFirst({ where: { ownerId: demoUser.id } });
  if (home) {
    await prisma.home.update({ where: { id: home.id }, data: { pinHash, name: 'Maison Demo' } });
  } else {
    home = await prisma.home.create({ data: { name: 'Maison Demo', ownerId: demoUser.id, pinHash } });
  }
  console.log('Home:', home.id);

  const roomDefs = [
    { name: 'Salon', icon: 'salon' },
    { name: 'Chambre', icon: 'chambre' },
    { name: 'Cuisine', icon: 'cuisine' },
    { name: 'Salle de bain', icon: 'sdb' },
    { name: 'Entree', icon: 'entree' },
  ];
  const rooms = [];
  for (const rd of roomDefs) {
    let r = await prisma.room.findFirst({ where: { homeId: home.id, name: rd.name } });
    if (!r) r = await prisma.room.create({ data: { homeId: home.id, name: rd.name, icon: rd.icon } });
    rooms.push(r);
  }
  console.log('Rooms:', rooms.length);

  const qrDefs = [
    { roomIdx: 0, name: 'Wi-Fi', type: 'wifi', slug: 'dh-wifi', content: { network_name: 'ORDOMOTIK_5G', password: 'Demo2025!', security_type: 'WPA3' }, isPrivate: false },
    { roomIdx: 0, name: 'Contact', type: 'contact', slug: 'dh-contact', content: { name: 'Martin Dupont', phone: '+33 6 12 34 56 78', email: 'martin@ordomotik.com' }, isPrivate: false },
    { roomIdx: 0, name: 'Regles', type: 'house_rules', slug: 'dh-rules', content: { rules: ['Pas de fumeur', 'Fermez les volets apres 22h', 'Tri selectif'] }, isPrivate: false },
    { roomIdx: 4, name: 'Urgences', type: 'emergency_contacts', slug: 'dh-urgent', content: { contacts: [{ name: 'SAMU', phone: '15' }, { name: 'Police', phone: '17' }, { name: 'Pompier', phone: '18' }] }, isPrivate: false },
    { roomIdx: 1, name: 'Livre dor', type: 'guestbook', slug: 'dh-guestbook', content: { text: 'Bienvenue ! Laissez un message.' }, isPrivate: false },
    { roomIdx: 1, name: 'Note', type: 'note', slug: 'dh-note1', content: { text: 'Clim reglee a 22C.' }, isPrivate: false },
    { roomIdx: 2, name: 'Liste de courses', type: 'shopping_list', slug: 'dh-shopping', content: { items: ['Lait', 'Pain', 'Oeufs', 'Fromage'] }, isPrivate: false },
    { roomIdx: 2, name: 'Note cuisine', type: 'note', slug: 'dh-note2', content: { text: 'Four : 180C, 30min.' }, isPrivate: false },
    { roomIdx: 3, name: 'Note SdB', type: 'note', slug: 'dh-note3', content: { text: 'Chauffe-eau regle a 55C.' }, isPrivate: false },
    { roomIdx: 4, name: 'Note entree', type: 'note', slug: 'dh-note4', content: { text: 'Cle sous le paillasson.' }, isPrivate: false },
  ];

  for (const qd of qrDefs) {
    let qr = await prisma.qrCode.findUnique({ where: { publicSlug: qd.slug } });
    if (!qr) {
      qr = await prisma.qrCode.create({
        data: { homeId: home.id, roomId: rooms[qd.roomIdx].id, name: qd.name, type: qd.type, isPrivate: qd.isPrivate, isActive: true, publicSlug: qd.slug },
      });
      await prisma.qrContent.create({ data: { qrCodeId: qr.id, contentJson: JSON.stringify(qd.content) } });
    }
  }
  console.log('QR codes created');

  // Update or create hub plaque
  let hubPlaque = await prisma.physicalQrCode.findUnique({ where: { hubSlug: 'demo-hub' } });
  if (!hubPlaque) {
    const batch = await prisma.qrBatch.findFirst({ where: { createdBy: demoUser.id } });
    const batchId = batch ? batch.id : (await prisma.qrBatch.create({ data: { quantity: 1, designConfig: '{}', createdBy: demoUser.id } })).id;
    hubPlaque = await prisma.physicalQrCode.create({
      data: { batchId, activationCode: 'demo-hub-plaque', status: 'active', designConfig: '{}', isClaimed: true, hubSlug: 'demo-hub', claimedByUserId: demoUser.id, claimedAt: new Date(), homeId: home.id },
    });
    console.log('Hub plaque created');
  } else {
    await prisma.physicalQrCode.update({ where: { id: hubPlaque.id }, data: { homeId: home.id, claimedByUserId: demoUser.id } });
    console.log('Hub plaque updated');
  }

  const memberExists = await prisma.homeMember.findFirst({ where: { homeId: home.id, userId: demoUser.id } });
  if (!memberExists) {
    await prisma.homeMember.create({ data: { homeId: home.id, userId: demoUser.id, role: 'owner', nickname: 'Martin' } });
  }

  console.log('DONE - /hub/demo-hub PIN: 1234');
  await prisma.$disconnect();
}
setup().catch(e => { console.error(e.message); process.exit(1); });
