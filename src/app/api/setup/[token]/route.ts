import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { db } from '@/lib/db';
import crypto from 'crypto';

// ── Demo mock data ──
const DEMO_TOKEN = 'demo-setup';

const isDemo = (token: string) => token === DEMO_TOKEN;

// ── Default rooms & modules configuration ──
// Each module: type, name, content, isPrivate, roomId (set after room creation)
interface DefaultModule {
  type: string;
  name: string;
  icon?: string;
  isPrivate: boolean;
  content: Record<string, unknown>;
}

interface DefaultRoom {
  name: string;
  icon: string;
  modules: DefaultModule[];
}

function getDefaultRooms(opts: {
  fullName: string;
  wifiSsid?: string;
  wifiPassword?: string;
  emergencyPhone?: string;
  homeName?: string;
}): DefaultRoom[] {
  const { fullName, wifiSsid, wifiPassword, emergencyPhone, homeName } = opts;

  return [
    {
      name: 'Salon',
      icon: 'salon',
      modules: [
        {
          type: 'wifi',
          name: 'WiFi',
          isPrivate: false,
          content: {
            network_name: wifiSsid || 'Mon WiFi',
            ssid: wifiSsid || 'Mon WiFi',
            password: wifiPassword || '',
            security_type: 'WPA2',
          },
        },
        {
          type: 'contact',
          name: 'Contact propriétaire',
          isPrivate: false,
          content: {
            name: fullName,
            phone: emergencyPhone || '',
          },
        },
        {
          type: 'house_rules',
          name: 'Règles de la maison',
          isPrivate: false,
          content: {
            rules: [
              'Pas de fumer à l\'intérieur',
              'Départ avant 11h le jour du checkout',
              'Merci de ne pas faire de bruit après 22h',
              'Éteindre la climatisation en votre absence',
              'Signaler tout dégât ou casse immédiatement',
            ],
            description: 'Merci de respecter ces règles pour le confort de tous.',
          },
        },
      ],
    },
    {
      name: 'Chambre',
      icon: 'chambre',
      modules: [
        {
          type: 'guestbook',
          name: 'Livre d\'or',
          isPrivate: false,
          content: {
            text: `Bienvenue dans ${homeName || 'votre logement'} ! N\'hésitez pas à laisser un petit mot pour les prochains voyageurs. ✨`,
          },
        },
        {
          type: 'note',
          name: 'Infos chambre',
          isPrivate: false,
          content: {
            title: 'Informations pratiques',
            text: 'Instructions pour les draps, serviettes et clés sont disponibles dans le tiroir de la table de nuit.\n\nContrôle de la climatisation : la télécommande est sur la table de chevet.\n\nFermez les volets la nuit pour un sommeil optimal. 😴',
          },
        },
      ],
    },
    {
      name: 'Cuisine',
      icon: 'cuisine',
      modules: [
        {
          type: 'shopping_list',
          name: 'Liste de courses',
          isPrivate: true,
          content: {
            items: ['Lait', 'Pain', '\u0152ufs', 'Fromage', 'Fruits', 'Eau minérale'],
          },
        },
        {
          type: 'note',
          name: 'Guide cuisine',
          isPrivate: false,
          content: {
            title: 'Appareils électroménagers',
            text: '☕ Machine à café : capsules dans le placard gauche\n🔥 Micro-ondes : puissance 800W\n🧊 Réfrigérateur : merci de ne pas jeter les aliments des autres\n🍽️ Lave-vaisselle : tablettes sous l\'évier',
          },
        },
      ],
    },
    {
      name: 'Salle de bain',
      icon: 'salle-de-bain',
      modules: [
        {
          type: 'note',
          name: 'Salle de bain',
          isPrivate: false,
          content: {
            title: 'Consignes salle de bain',
            text: '🚿 Chauffe-eau automatique – eau chaude disponible en 5 min\n🧴 Produits d\'accueil fournis (shampoing, gel douche)\n👕 Sèche-serviettes : appuyez sur le bouton vert\n🚽 Ne jetez rien dans les toilettes sauf le papier toilette',
          },
        },
      ],
    },
    {
      name: 'Entrée',
      icon: 'entree',
      modules: [
        {
          type: 'emergency',
          name: 'Urgences',
          isPrivate: false,
          content: {
            contact_name: fullName,
            phone: emergencyPhone || '112',
            info: 'En cas d\'urgence :\n• SAMU : 15\n• Pompiers : 18\n• Police : 17\n• Numéro européen : 112\n\nContact propriétaire : ' + (emergencyPhone || '(non renseigné)'),
          },
        },
        {
          type: 'note',
          name: 'Arrivée / Départ',
          isPrivate: false,
          content: {
            title: 'Instructions arrivée',
            text: `🏠 ${homeName || 'Votre logement'}\n\n🔑 Code porte : à renseigner\n📦 Clés : boîte à clé à côté de la porte d\'entrée\n📶 WiFi : scannez le QR code WiFi dans le salon\n\n Merci et bon séjour ! 🎉`,
          },
        },
      ],
    },
  ];
}

// GET: Validate setup token — return plaque info without claiming
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token || token.length < 4) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 400 });
    }

    // ── DEMO MODE ──
    if (isDemo(token)) {
      return NextResponse.json({
        status: 'available',
        plaque: {
          id: 'demo-plaque-001',
          activationCode: DEMO_TOKEN,
          batchId: 'demo-batch-001',
          quantity: 10,
          designConfig: null,
        },
      });
    }

    let plaque = await db.physicalQrCode.findUnique({
      where: { setupToken: token },
      include: {
        batch: true,
        claimedBy: { select: { id: true, fullName: true, email: true } },
        home: { select: { id: true, name: true, address: true } },
      },
    });

    if (!plaque) {
      plaque = await db.physicalQrCode.findUnique({
        where: { activationCode: token },
        include: {
          batch: true,
          claimedBy: { select: { id: true, fullName: true, email: true } },
          home: { select: { id: true, name: true, address: true } },
        },
      });
    }

    if (!plaque) {
      return NextResponse.json({ error: 'Plaque non trouvée' }, { status: 404 });
    }

    if (plaque.isClaimed && plaque.homeId) {
      return NextResponse.json({
        status: 'claimed',
        message: 'Cette plaque est déjà configurée',
        hubSlug: plaque.hubSlug || undefined,
        claimedBy: plaque.claimedBy
          ? { fullName: plaque.claimedBy.fullName, email: plaque.claimedBy.email }
          : undefined,
        homeName: plaque.home?.name || undefined,
      });
    }

    return NextResponse.json({
      status: 'available',
      plaque: {
        id: plaque.id,
        activationCode: plaque.activationCode,
        batchId: plaque.batch.id,
        quantity: plaque.batch.quantity,
        designConfig: plaque.designConfig,
      },
    });
  } catch (error) {
    console.error('Setup token check error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST: Execute setup — create user, claim plaque, create home with ALL rooms & modules
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await req.json();
    const {
      email,
      password,
      fullName,
      pin,
      homeName,
      plan,
      existingUserId,
      wifiSsid,
      wifiPassword,
      emergencyPhone,
    } = body;

    // ── DEMO MODE ──
    if (isDemo(token)) {
      return NextResponse.json({
        success: true,
        isNewUser: true,
        userId: 'demo-user-001',
        homeId: 'demo-home-001',
        homeName: homeName || 'Mon Appartement Demo',
        hubSlug: 'demo-hub',
        plan: plan || 'famille',
        modulesCreated: 11,
        roomsCreated: 5,
      });
    }

    // Validate inputs
    if (!fullName?.trim()) return NextResponse.json({ error: 'Nom requis' }, { status: 400 });
    if (!email?.trim()) return NextResponse.json({ error: 'Email requis' }, { status: 400 });
    if (!existingUserId && (!password || password.length < 6)) {
      return NextResponse.json({ error: 'Mot de passe requis (6 caractères minimum)' }, { status: 400 });
    }
    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'Code PIN à 4 chiffres requis' }, { status: 400 });
    }
    if (!homeName?.trim()) return NextResponse.json({ error: 'Nom du logement requis' }, { status: 400 });
    if (!plan || !['famille', 'airbnb_solo', 'airbnb_pro', 'free'].includes(plan)) {
      return NextResponse.json({ error: 'Plan invalide' }, { status: 400 });
    }

    // Find plaque
    let plaque = await db.physicalQrCode.findUnique({
      where: { setupToken: token },
      include: { batch: true },
    });
    if (!plaque) {
      plaque = await db.physicalQrCode.findUnique({
        where: { activationCode: token },
        include: { batch: true },
      });
    }
    if (!plaque) return NextResponse.json({ error: 'Plaque non trouvée' }, { status: 404 });
    if (plaque.isClaimed) return NextResponse.json({ error: 'Cette plaque est déjà configurée' }, { status: 409 });

    // ── Find or create user ──
    let userId = existingUserId || null;
    let isNewUser = false;

    if (userId) {
      const existingUser = await db.user.findUnique({ where: { id: userId } });
      if (!existingUser) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 400 });
      await db.user.update({ where: { id: userId }, data: { selectedPlan: plan, onboardingCompleted: true } });
    } else {
      const existingUser = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
      if (existingUser) {
        return NextResponse.json({ error: 'Cet email est déjà utilisé. Connectez-vous d\'abord.' }, { status: 409 });
      }
      const passwordHash = await hash(password, 12);
      const newUser = await db.user.create({
        data: {
          email: email.trim().toLowerCase(),
          fullName: fullName.trim(),
          passwordHash,
          role: 'user',
          selectedPlan: plan,
          onboardingCompleted: true,
        },
      });
      userId = newUser.id;
      isNewUser = true;
    }

    // ── Hash PIN ──
    const pinHash = await hash(pin, 10);

    // ── Generate hubSlug ──
    const baseSlug = homeName.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const suffix = crypto.randomBytes(3).toString('hex');
    let hubSlug = `${baseSlug}-${suffix}`;
    let slugExists = await db.physicalQrCode.findUnique({ where: { hubSlug } });
    let attempts = 0;
    while (slugExists && attempts < 5) {
      hubSlug = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;
      slugExists = await db.physicalQrCode.findUnique({ where: { hubSlug } });
      attempts++;
    }
    if (slugExists) hubSlug = `home-${plaque.id.slice(0, 8)}`;

    // ── Create home ──
    const home = await db.home.create({
      data: { name: homeName.trim(), ownerId: userId!, pinHash, address: '' },
    });

    // ── Get default rooms & modules config ──
    const defaultRooms = getDefaultRooms({
      fullName: fullName.trim(),
      wifiSsid: wifiSsid?.trim() || '',
      wifiPassword: wifiPassword?.trim() || '',
      emergencyPhone: emergencyPhone?.trim() || '',
      homeName: homeName.trim(),
    });

    // ── Find all physical QR codes in the same batch (to link to modules) ──
    const batchQrcodes = await db.physicalQrCode.findMany({
      where: { batchId: plaque.batchId, isClaimed: false, id: { not: plaque.id } },
      orderBy: { createdAt: 'asc' },
    });

    // ── Collect all modules into a flat list, assign physical QR codes ──
    let moduleIndex = 0;
    const createdQrIds: string[] = [];

    for (const roomConfig of defaultRooms) {
      // Create room
      const room = await db.room.create({
        data: { homeId: home.id, name: roomConfig.name, icon: roomConfig.icon },
      });

      for (const mod of roomConfig.modules) {
        const publicSlug = crypto.randomBytes(5).toString('hex');

        // Create QR code
        const qr = await db.qrCode.create({
          data: {
            homeId: home.id,
            roomId: room.id,
            name: mod.name,
            type: mod.type,
            publicSlug,
            isActive: true,
            isPrivate: mod.isPrivate,
          },
        });

        // Create content
        await db.qrContent.create({
          data: { qrCodeId: qr.id, contentJson: JSON.stringify(mod.content) },
        });

        createdQrIds.push(qr.id);

        // Link to a physical QR code if available
        if (moduleIndex < batchQrcodes.length) {
          await db.physicalQrCode.update({
            where: { id: batchQrcodes[moduleIndex].id },
            data: {
              isClaimed: true,
              claimedByUserId: userId!,
              claimedAt: new Date(),
              homeId: home.id,
              dynamicQrCodeId: qr.id,
              status: 'active',
            },
          });
        }
        moduleIndex++;
      }
    }

    // ── Activate remaining physical QR codes as generic "Note" modules in Salon ──
    if (moduleIndex < batchQrcodes.length) {
      const salonRoom = await db.room.findFirst({ where: { homeId: home.id, name: 'Salon' } });
      for (let i = moduleIndex; i < batchQrcodes.length; i++) {
        const publicSlug = crypto.randomBytes(5).toString('hex');
        const num = i - moduleIndex + 1;
        const qr = await db.qrCode.create({
          data: {
            homeId: home.id,
            roomId: salonRoom?.id || null,
            name: `Note #${num}`,
            type: 'note',
            publicSlug,
            isActive: true,
            isPrivate: false,
          },
        });
        await db.qrContent.create({
          data: {
            qrCodeId: qr.id,
            contentJson: JSON.stringify({
              title: `Note #${num}`,
              text: 'Scannez ce QR code pour accéder aux informations. Vous pouvez modifier le contenu depuis votre tableau de bord.',
            }),
          },
        });
        await db.physicalQrCode.update({
          where: { id: batchQrcodes[i].id },
          data: {
            isClaimed: true,
            claimedByUserId: userId!,
            claimedAt: new Date(),
            homeId: home.id,
            dynamicQrCodeId: qr.id,
            status: 'active',
          },
        });
      }
    }

    // ── Claim the main plaque (hub) ──
    const setupToken = plaque.setupToken || `SETUP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    await db.physicalQrCode.update({
      where: { id: plaque.id },
      data: {
        isClaimed: true,
        claimedByUserId: userId!,
        claimedAt: new Date(),
        homeId: home.id,
        hubSlug,
        status: 'active',
        setupToken,
      },
    });

    // ── Subscription (non-blocking) ──
    try {
      const planConfig: Record<string, { amount: number; cycle: string; maxHomes: number }> = {
        famille: { amount: 49, cycle: 'annual', maxHomes: 1 },
        airbnb_solo: { amount: 9.9, cycle: 'monthly', maxHomes: 1 },
        airbnb_pro: { amount: 199, cycle: 'annual', maxHomes: 3 },
        free: { amount: 0, cycle: 'annual', maxHomes: 1 },
      };
      const pc = planConfig[plan] || planConfig.free;
      await db.subscription.create({
        data: {
          subscriberId: userId!,
          subscriberType: 'user',
          plan,
          amount: pc.amount,
          billingCycle: pc.cycle,
          maxHomes: pc.maxHomes,
          status: 'trialing',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });
    } catch (subErr) {
      console.warn('[setup] Subscription creation skipped:', subErr instanceof Error ? subErr.message : subErr);
    }

    // ── Owner as home member ──
    await db.homeMember.create({
      data: { homeId: home.id, userId: userId!, role: 'owner', nickname: fullName.trim() },
    });

    return NextResponse.json({
      success: true,
      isNewUser,
      userId,
      homeId: home.id,
      homeName: home.name,
      hubSlug,
      plan,
      roomsCreated: defaultRooms.length,
      modulesCreated: createdQrIds.length + Math.max(0, batchQrcodes.length - moduleIndex + 1),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[setup] POST error:', message, error);
    return NextResponse.json({ error: `Erreur serveur: ${message}` }, { status: 500 });
  }
}
