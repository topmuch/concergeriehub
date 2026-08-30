import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';

// ── Demo mock data ──
const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

const DEMO_HUB_DATA = {
  home: {
    id: 'demo-home-001',
    name: 'Le Petit Nid',
    address: '12 Rue de la Paix, 75002 Paris',
    hasPin: true,
  },
  ownerName: 'Marie Dupont',
  guestRooms: [
    {
      id: 'room-salon',
      name: 'Salon',
      icon: 'salon',
      qrCodes: [
        {
          id: 'qr-wifi-1',
          name: 'WiFi Maison',
          type: 'wifi',
          publicSlug: null,
          isPrivate: false,
          content: {
            network_name: 'LePetitNid_5G',
            password: 'Demo2025!',
            security_type: 'WPA2',
          },
        },
        {
          id: 'qr-rules-1',
          name: 'Règles de la maison',
          type: 'house_rules',
          publicSlug: null,
          isPrivate: false,
          content: {
            rules: [
              'Pas de fumer à l\'intérieur',
              'Pas d\'animaux sans autorisation',
              'Départ avant 11h le jour du checkout',
              'Merci de ne pas faire de bruit après 22h',
              'Climatisation éteinte en votre absence',
            ],
            description: 'Merci de respecter ces quelques règles pour le confort de tous.',
          },
        },
        {
          id: 'qr-emergency-1',
          name: 'Urgences',
          type: 'emergency',
          publicSlug: null,
          isPrivate: false,
          content: {
            phone: '+33 1 42 60 31 70',
            contact_name: 'Marie Dupont',
            nearest_hospital: 'Hôtel-Dieu (1.2 km)',
            pharmacy: 'Pharmacie de la Paix (200m)',
          },
        },
      ],
    },
    {
      id: 'room-cuisine',
      name: 'Cuisine',
      icon: 'cuisine',
      qrCodes: [
        {
          id: 'qr-recipe-1',
          name: 'Recette locale',
          type: 'recipe',
          publicSlug: null,
          isPrivate: false,
          content: {
            title: 'Quiche Lorraine Maison',
            ingredients: ['200g de lardons', '3 œufs', '20cl de crème', '1 pâte brisée', '100g de gruyère râpé'],
            steps: ['Préchauffez le four à 180°C', 'Étalez la pâte dans un moule', 'Faites revenir les lardons', 'Mélangez œufs et crème', 'Versez sur la pâte, ajoutez lardons et gruyère', 'Cuisez 35 min'],
          },
        },
      ],
    },
    {
      id: 'room-chambre',
      name: 'Chambre Principale',
      icon: 'chambre',
      qrCodes: [
        {
          id: 'qr-note-1',
          name: 'Livre d\'or',
          type: 'guestbook',
          publicSlug: null,
          isPrivate: false,
          content: {
            text: 'Bienvenue ! N\'hésitez pas à laisser un petit mot pour les prochains voyageurs.',
          },
        },
      ],
    },
  ],
  familyRooms: [
    {
      id: 'froom-salon',
      name: 'Salon',
      icon: 'salon',
      qrCodes: [
        {
          id: 'fqr-wifi-1',
          name: 'WiFi Maison',
          type: 'wifi',
          publicSlug: null,
          isPrivate: false,
          content: { network_name: 'LePetitNid_5G', password: 'Demo2025!', security_type: 'WPA2' },
        },
        {
          id: 'fqr-contact-1',
          name: 'Contacts Famille',
          type: 'contact',
          publicSlug: null,
          isPrivate: true,
          content: { contacts: [{ name: 'Maman', phone: '+33 6 12 34 56 78' }, { name: 'Papa', phone: '+33 6 98 76 54 32' }] },
        },
        {
          id: 'fqr-list-1',
          name: 'Liste de courses',
          type: 'shopping_list',
          publicSlug: null,
          isPrivate: true,
          content: { items: ['Lait', 'Pain', 'Œufs', 'Fromage', 'Fruits'] },
        },
      ],
    },
    {
      id: 'froom-cuisine',
      name: 'Cuisine',
      icon: 'cuisine',
      qrCodes: [
        {
          id: 'fqr-recipe-1',
          name: 'Recette locale',
          type: 'recipe',
          publicSlug: null,
          isPrivate: false,
          content: { title: 'Quiche Lorraine Maison' },
        },
        {
          id: 'fqr-chore-1',
          name: 'Tâches ménagères',
          type: 'chore',
          publicSlug: null,
          isPrivate: true,
          content: { chores: ['Vider le lave-vaisselle', 'Sortir les poubelles', 'Essuyer les plans de travail'] },
        },
      ],
    },
    {
      id: 'froom-chambre',
      name: 'Chambre Principale',
      icon: 'chambre',
      qrCodes: [
        {
          id: 'fqr-guestbook-1',
          name: 'Livre d\'or',
          type: 'guestbook',
          publicSlug: null,
          isPrivate: false,
          content: { text: 'Bienvenue dans la famille !' },
        },
        {
          id: 'fqr-medication-1',
          name: 'Médicaments',
          type: 'medication',
          publicSlug: null,
          isPrivate: true,
          content: { medications: ['Doliprane - étagère haute', 'Ibuprofène - pharmacie salle de bain'] },
        },
      ],
    },
    {
      id: 'froom-bureau',
      name: 'Bureau',
      icon: 'bureau',
      qrCodes: [
        {
          id: 'fqr-inventory-1',
          name: 'Inventaire',
          type: 'inventory',
          publicSlug: null,
          isPrivate: true,
          content: { items: ['Cartouches d\'encre (x2)', 'Papier A4 (5 ramettes)', 'Câble HDMI'] },
        },
      ],
    },
  ],
  voiceMessages: [
    {
      id: 'vm-1',
      senderName: 'Marie',
      senderType: 'owner',
      audioUrl: '',
      durationSec: 12,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'vm-2',
      senderName: 'Pierre',
      senderType: 'guest',
      audioUrl: '',
      durationSec: 8,
      createdAt: new Date(Date.now() - 7200000).toISOString(),
    },
  ],
};

// GET: Public hub info — home, rooms, active non-private QR codes
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!slug || slug.length < 2) {
      return NextResponse.json({ error: 'Slug invalide' }, { status: 400 });
    }

    // ── DEMO MODE: return rich mock data ──
    if (isDemo(slug)) {
      return NextResponse.json(DEMO_HUB_DATA);
    }

    // Find the plaque by hubSlug
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
      include: {
        claimedBy: { select: { id: true, fullName: true } },
      },
    });

    if (!plaque || !plaque.isClaimed || !plaque.homeId) {
      return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
    }

    // Fetch the home
    const home = await db.home.findUnique({
      where: { id: plaque.homeId },
      select: {
        id: true,
        name: true,
        address: true,
        pinHash: true,
      },
    });

    if (!home) {
      return NextResponse.json({ error: 'Logement non trouvé' }, { status: 404 });
    }

    // Fetch rooms with their active non-private QR codes (guest mode)
    const guestRooms = await db.room.findMany({
      where: { homeId: home.id },
      orderBy: { createdAt: 'asc' },
      include: {
        qrCodes: {
          where: { isActive: true, isPrivate: false },
          orderBy: { createdAt: 'asc' },
          include: {
            content: { select: { contentJson: true } },
          },
        },
      },
    });

    // Fetch ALL active QR codes (including private) for family mode
    const familyRooms = await db.room.findMany({
      where: { homeId: home.id },
      orderBy: { createdAt: 'asc' },
      include: {
        qrCodes: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          include: {
            content: { select: { contentJson: true } },
          },
        },
      },
    });

    // Fetch recent voice messages (last 10)
    const voiceMessages = await db.voiceMessage.findMany({
      where: { homeId: home.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        senderName: true,
        senderType: true,
        audioUrl: true,
        durationSec: true,
        createdAt: true,
      },
    });

    // Build room data helper
    const buildRoomData = (roomList: typeof guestRooms) =>
      roomList.map((room) => ({
        id: room.id,
        name: room.name,
        icon: room.icon,
        qrCodes: room.qrCodes.map((qr) => ({
          id: qr.id,
          name: qr.name,
          type: qr.type,
          publicSlug: qr.publicSlug,
          isPrivate: qr.isPrivate,
          content: qr.content?.contentJson
            ? (() => { try { return JSON.parse(qr.content.contentJson); } catch { return {}; } })()
            : {},
        })),
      }));

    return NextResponse.json({
      home: {
        id: home.id,
        name: home.name,
        address: home.address,
        hasPin: !!home.pinHash,
      },
      ownerName: plaque.claimedBy?.fullName || null,
      guestRooms: buildRoomData(guestRooms),
      familyRooms: buildRoomData(familyRooms),
      voiceMessages,
    });
  } catch (error) {
    console.error('Hub GET error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST: Verify PIN for family mode
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await req.json();
    const { pin } = body;

    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN invalide' }, { status: 400 });
    }

    // ── DEMO MODE: any 4-digit PIN works ──
    if (isDemo(slug)) {
      return NextResponse.json({ success: true, homeId: 'demo-home-001' });
    }

    // Find the plaque and home
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
    });

    if (!plaque || !plaque.isClaimed || !plaque.homeId) {
      return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
    }

    const home = await db.home.findUnique({
      where: { id: plaque.homeId },
      select: { id: true, pinHash: true },
    });

    if (!home || !home.pinHash) {
      return NextResponse.json({ error: 'Aucun PIN configuré' }, { status: 400 });
    }

    const isValid = await compare(pin, home.pinHash);
    if (!isValid) {
      return NextResponse.json({ error: 'PIN incorrect' }, { status: 401 });
    }

    return NextResponse.json({ success: true, homeId: home.id });
  } catch (error) {
    console.error('Hub PIN verify error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
