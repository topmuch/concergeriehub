// =============================================================
// POST /api/onboarding/complete — chantier ONBOARD (A+C)
//
// Finalise l'assistant de démarrage du nouvel hôte (3 minutes) :
//   1. Met à jour le bien créé à l'inscription (nom + adresse,
//      slug du Hub QR personnalisé).
//   2. Crée (ou met à jour) le QR « wifi » du bien — c'est la
//      source affichée par le Hub invité /api/public/hub/[slug]
//      (contentJson : network_name / password / security_type).
//   3. Marque l'utilisateur onboardingCompleted = true.
//
// Sécurité : session requise + le bien doit appartenir à l'appelant
// (ownerId). Réservé aux comptes 'user' (le superadmin ne s'embête
// pas avec l'onboarding).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const body = (await req.json()) as {
      propertyId?: string;
      name?: string;
      address?: string;
      qrHubSlug?: string;
      wifi?: {
        networkName?: string;
        password?: string;
        securityType?: string;
      };
    };

    if (!body.propertyId) {
      return NextResponse.json({ error: 'Bien manquant.' }, { status: 400 });
    }

    // Le bien doit appartenir à l'appelant (pas seulement un rôle d'équipe).
    const property = await db.property.findFirst({
      where: { id: body.propertyId, ownerId: userId },
      select: { id: true, name: true },
    });
    if (!property) {
      return NextResponse.json(
        { error: 'Bien introuvable ou non autorisé.' },
        { status: 403 },
      );
    }

    // ----- Validations (nom / adresse / slug) -----
    const data: Record<string, unknown> = {};

    const name = body.name?.trim();
    if (name !== undefined) {
      if (name.length < 2 || name.length > 80) {
        return NextResponse.json(
          { error: 'Le nom du bien doit contenir entre 2 et 80 caractères.' },
          { status: 400 },
        );
      }
      data.name = name;
    }

    const address = body.address?.trim();
    if (address !== undefined) {
      if (address.length < 2 || address.length > 200) {
        return NextResponse.json(
          { error: "L'adresse doit contenir entre 2 et 200 caractères." },
          { status: 400 },
        );
      }
      data.address = address;
    }

    let slug: string | null = null;
    if (body.qrHubSlug !== undefined && body.qrHubSlug !== '') {
      slug = body.qrHubSlug
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (slug.length < 3 || slug.length > 60) {
        return NextResponse.json(
          { error: 'Le lien du Hub doit contenir entre 3 et 60 caractères (a-z, 0-9, -).' },
          { status: 400 },
        );
      }
      const taken = await db.property.findFirst({
        where: { qrHubSlug: slug, NOT: { id: property.id } },
        select: { id: true },
      });
      if (taken) {
        return NextResponse.json(
          { error: 'Ce lien de Hub est déjà utilisé par un autre bien.' },
          { status: 409 },
        );
      }
      data.qrHubSlug = slug;
    }

    // ----- Wi-Fi : upsert du QrCode type 'wifi' (source du Hub invité) -----
    const wifiNetwork = body.wifi?.networkName?.trim() ?? '';
    const wifiPassword = body.wifi?.password ?? '';
    if (wifiNetwork || wifiPassword) {
      if (!wifiNetwork) {
        return NextResponse.json(
          { error: 'Le nom du réseau Wi-Fi est requis.' },
          { status: 400 },
        );
      }
      if (wifiNetwork.length > 64 || wifiPassword.length > 128) {
        return NextResponse.json(
          { error: 'Identifiants Wi-Fi trop longs (réseau ≤ 64, clé ≤ 128).' },
          { status: 400 },
        );
      }
      const securityType = ['WPA2', 'WPA', 'WEP', 'nopass'].includes(
        body.wifi?.securityType ?? '',
      )
        ? (body.wifi?.securityType as string)
        : 'WPA2';

      await db.$transaction(async (tx) => {
        // 1) Bien (nom / adresse / slug)
        if (Object.keys(data).length > 0) {
          await tx.property.update({ where: { id: property.id }, data });
        }

        // 2) QR Wi-Fi (upsert)
        const existingWifi = await tx.qrCode.findFirst({
          where: { propertyId: property.id, type: 'wifi' },
          select: { id: true },
        });
        const contentJson = JSON.stringify({
          network_name: wifiNetwork,
          password: wifiPassword,
          security_type: securityType,
        });
        if (existingWifi) {
          await tx.qrContent.upsert({
            where: { qrCodeId: existingWifi.id },
            update: { contentJson },
            create: { qrCodeId: existingWifi.id, contentJson },
          });
          await tx.qrCode.update({
            where: { id: existingWifi.id },
            data: { isActive: true },
          });
        } else {
          await tx.qrCode.create({
            data: {
              propertyId: property.id,
              name: 'Wi-Fi',
              type: 'wifi',
              isActive: true,
              content: { create: { contentJson } },
            },
          });
        }

        // 3) Onboarding terminé
        await tx.user.update({
          where: { id: userId },
          data: { onboardingCompleted: true },
        });
      });
    } else {
      // Pas de Wi-Fi fourni : on met à jour le bien et on marque quand
      // même l'onboarding comme terminé (le Wi-Fi reste modifiable plus
      // tard depuis le dashboard).
      await db.$transaction([
        Object.keys(data).length > 0
          ? db.property.update({ where: { id: property.id }, data })
          : db.property.update({
              where: { id: property.id },
              data: { updatedAt: new Date() },
            }),
        db.user.update({
          where: { id: userId },
          data: { onboardingCompleted: true },
        }),
      ]);
    }

    const updated = await db.property.findUnique({
      where: { id: property.id },
      select: { id: true, name: true, address: true, qrHubSlug: true },
    });

    return NextResponse.json({
      ok: true,
      property: updated,
      hubUrl: updated?.qrHubSlug ? `/hub/${updated.qrHubSlug}` : null,
    });
  } catch (error) {
    console.error('[onboarding/complete POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
