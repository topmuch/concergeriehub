import { hash } from 'bcryptjs';
import { db } from '../src/lib/db';

async function seed() {
  console.log('🌱 Seeding demo data...');

  // 1. User (upsert)
  let user = await db.user.findUnique({ where: { email: 'demo@qrdomotik.com' } });
  if (!user) {
    user = await db.user.create({
      data: { email: 'demo@qrdomotik.com', fullName: 'Martin Dupont', passwordHash: await hash('demo1234', 12), role: 'user', selectedPlan: 'famille', onboardingCompleted: true },
    });
    console.log('✅ User created');
  } else {
    console.log('ℹ️  User exists, skipping');
  }

  // 2. Batch
  let batch = await db.qrBatch.findFirst({ where: { createdBy: user.id } });
  if (!batch) {
    batch = await db.qrBatch.create({ data: { quantity: 5, designConfig: '{}', createdBy: user.id } });
    console.log('✅ Batch created');
  } else {
    console.log('ℹ️  Batch exists, skipping');
  }

  // 3. Setup plaque
  const existingSetup = await db.physicalQrCode.findUnique({ where: { activationCode: 'demo-setup' } });
  if (!existingSetup) {
    await db.physicalQrCode.create({ data: { batchId: batch.id, activationCode: 'demo-setup', status: 'inactive', designConfig: '{}' } });
    console.log('✅ Setup plaque created (token: demo-setup)');
  } else {
    console.log('ℹ️  Setup plaque exists, skipping');
  }

  // 4. Home
  let home = await db.home.findFirst({ where: { ownerId: user.id, name: 'Maison Martin' } });
  if (!home) {
    const pinHash = await hash('1234', 10);
    home = await db.home.create({ data: { name: 'Maison Martin', ownerId: user.id, pinHash, address: '12 Rue de la Paix, Paris' } });
    console.log('✅ Home created (PIN: 1234)');
  } else {
    console.log('ℹ️  Home exists, skipping');
  }

  // 5. Rooms
  const roomDefs = ['Salon', 'Chambre principale', 'Cuisine', 'Salle de bain', 'Jardin'];
  const roomIcons = ['salon', 'chambre-principale', 'cuisine', 'sdb', 'jardin'];
  const rooms: { id: string }[] = [];
  for (let i = 0; i < roomDefs.length; i++) {
    let room = await db.room.findFirst({ where: { homeId: home.id, name: roomDefs[i] } });
    if (!room) {
      room = await db.room.create({ data: { homeId: home.id, name: roomDefs[i], icon: roomIcons[i] } });
    }
    rooms.push(room);
  }
  console.log('✅ 5 rooms ready');

  // 6. QR codes
  const qrData = [
    { roomId: rooms[0].id, name: 'Wi-Fi Maison', type: 'wifi', isPrivate: false, slug: 'demo-wifi',
      content: { network_name: 'Martin_Fibre_5G', password: 'MonWiFi2025!', security_type: 'WPA3' } },
    { roomId: rooms[0].id, name: 'Règles de la maison', type: 'house_rules', isPrivate: false, slug: 'demo-rules',
      content: { rules: ['Pas de fumeur à l\'intérieur','Pas d\'animaux sans accord préalable','Fermez les volets après 22h','Tri sélectif dans la cuisine','Ne pas jeter les essuie-tout dans les WC','Coupez la climatisation en quittant'] } },
    { roomId: rooms[0].id, name: 'Contact propriétaire', type: 'contact', isPrivate: false, slug: 'demo-contact',
      content: { name: 'Martin Dupont', phone: '+33 6 12 34 56 78', email: 'martin@qrdomotik.com',
        contacts: [{ name: 'Marie Dupont', phone: '+33 6 98 76 54 32', relation: 'Conjoint' },{ name: 'Plombier urgent', phone: '+33 1 23 45 67 89', relation: 'Urgence' }] } },
    { roomId: rooms[0].id, name: 'Liste de courses', type: 'shopping_list', isPrivate: true, slug: 'demo-shopping',
      content: { items: ['Lait demi-écrémé', 'Pain complet', 'Œufs bio x12', 'Fromage comté', 'Pommes golden'] } },
    { roomId: rooms[1].id, name: 'Manuel chambre', type: 'home_manual', isPrivate: false, slug: 'demo-manual',
      content: { text: 'Guide rapide :\n- Climatisation : télécommande sur la table de nuit\n- Stores électriques : bouton mural à droite\n- Prises USB : de chaque côté du lit' } },
    { roomId: rooms[1].id, name: 'Inventaire', type: 'inventory', isPrivate: true, slug: 'demo-inventory',
      content: { items: [{ name: 'Draps 240x240', qty: 2 }, { name: 'Oreillers', qty: 4 }, { name: 'Couettes', qty: 2 }] } },
    { roomId: rooms[2].id, name: 'Recette du jour', type: 'recipe', isPrivate: false, slug: 'demo-recipe',
      content: { title: 'Ratatouille provençale', description: 'Courgettes, aubergines, tomates, poivrons... 45min au four.' } },
    { roomId: rooms[2].id, name: 'Médicaments', type: 'medication', isPrivate: true, slug: 'demo-medication',
      content: { items: [{ name: 'Doliprane 1000mg', expiry: '2026-03' }, { name: 'Ibuprofène 400mg', expiry: '2025-11' }] } },
    { roomId: rooms[3].id, name: 'Livret d\'accueil', type: 'guestbook', isPrivate: false, slug: 'demo-guestbook',
      content: { text: 'Bienvenue ! Serviettes dans le placard bleu. Sèche-cheveux sous le lavabo. Chauffe-eau réglé à 55°C.' } },
    { roomId: rooms[4].id, name: 'Portier virtuel', type: 'doorbell', isPrivate: false, slug: 'demo-doorbell',
      content: { text: 'Sonnette connectée. Appuyez pour prévenir de votre arrivée.' } },
  ];

  for (const qr of qrData) {
    const existing = await db.qrCode.findUnique({ where: { publicSlug: qr.slug } });
    if (!existing) {
      const created = await db.qrCode.create({
        data: { homeId: home.id, roomId: qr.roomId, name: qr.name, type: qr.type, isPrivate: qr.isPrivate, isActive: true, publicSlug: qr.slug },
      });
      await db.qrContent.create({ data: { qrCodeId: created.id, contentJson: JSON.stringify(qr.content) } });
    }
  }
  console.log('✅ 11 QR codes ready');

  // 7. Hub plaque
  const existingHub = await db.physicalQrCode.findUnique({ where: { hubSlug: 'demo-hub' } });
  if (!existingHub) {
    await db.physicalQrCode.create({
      data: { batchId: batch.id, activationCode: 'demo-hub-plaque', status: 'active', designConfig: '{}',
        isClaimed: true, hubSlug: 'demo-hub', claimedByUserId: user.id, claimedAt: new Date(), homeId: home.id },
    });
    console.log('✅ Hub plaque created (slug: demo-hub)');
  } else {
    console.log('ℹ️  Hub plaque exists, skipping');
  }

  // 8. Voice messages
  const msgCount = await db.voiceMessage.count({ where: { homeId: home.id } });
  if (msgCount === 0) {
    await db.voiceMessage.createMany({
      data: [
        { homeId: home.id, senderName: 'Marie', senderType: 'family', audioUrl: '', durationSec: 8, fileSizeKb: 120, isRead: true, createdAt: new Date(Date.now() - 3600000) },
        { homeId: home.id, senderName: 'Pierre (invité)', senderType: 'guest', audioUrl: '', durationSec: 12, fileSizeKb: 180, isRead: false, createdAt: new Date(Date.now() - 7200000) },
        { homeId: home.id, senderName: 'Martin', senderType: 'family', audioUrl: '', durationSec: 5, fileSizeKb: 75, isRead: true, createdAt: new Date(Date.now() - 86400000) },
      ],
    });
    console.log('✅ 3 voice messages');
  } else {
    console.log('ℹ️  Voice messages exist, skipping');
  }

  // 9. Home member
  const memberExists = await db.homeMember.findFirst({ where: { homeId: home.id, userId: user.id } });
  if (!memberExists) {
    await db.homeMember.create({ data: { homeId: home.id, userId: user.id, role: 'owner', nickname: 'Martin' } });
    console.log('✅ Home member');
  }

  console.log('\n🎉 Demo data ready!');
  console.log('   Setup → token: "demo-setup"');
  console.log('   Hub   → slug: "demo-hub" (PIN: 1234)');
}

seed().catch((e) => { console.error('❌', e); process.exit(1); }).finally(() => process.exit(0));
