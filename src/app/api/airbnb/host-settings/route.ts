// =============================================================
// /api/airbnb/host-settings — v4.69 PHASE 5
// « Paiements & commission » de l'hôte connecté.
//
// GET    → { useOwnStripe, stripePubKey, hasStripeSecret, commissionRate }
//          (la clé secrète n'est JAMAIS renvoyée, seulement son existence)
// PATCH  → { useOwnStripe?, stripePubKey?, stripeSecretKey? }
//          Upsert ; la commission (commissionRate) est fixée par le
//          Superadmin (CRM facturation) — non modifiable ici.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';
import { db } from '@/lib/db';
import { mutationGuard, mutationKey } from '@/lib/mutation-guard';
import { getOrCreateHostSettings, DEFAULT_HOST_COMMISSION_RATE } from '@/lib/commission';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  try {
    const settings = await getOrCreateHostSettings(session.user.id);
    return NextResponse.json({
      useOwnStripe: settings.useOwnStripe,
      stripePubKey: settings.stripePubKey ?? '',
      hasStripeSecret: !!settings.stripeSecretKey,
      commissionRate: typeof settings.commissionRate === 'number' ? settings.commissionRate : DEFAULT_HOST_COMMISSION_RATE,
    });
  } catch {
    return NextResponse.json({ error: 'Erreur lors du chargement des paramètres.' }, { status: 500 });
  }
}

const patchSchema = z.object({
  useOwnStripe: z.boolean().optional(),
  stripePubKey: z.string().max(200).regex(/^pk_(test|live)_/, 'Clé publique invalide (doit commencer par pk_test_ ou pk_live_)').nullable().optional(),
  stripeSecretKey: z.string().max(200).regex(/^sk_(test|live)_/, 'Clé secrète invalide (doit commencer par sk_test_ ou sk_live_)').nullable().optional(),
});

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  const mutGuard = await mutationGuard(mutationKey('airbnb-mut', request, session.user.id));
  if (mutGuard) return mutGuard; // null = autorisé

  try {
    const body: unknown = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Requête invalide.' },
        { status: 400 },
      );
    }
    const { useOwnStripe, stripePubKey, stripeSecretKey } = parsed.data;

    await getOrCreateHostSettings(session.user.id);
    await db.hostSettings.update({
      where: { userId: session.user.id },
      data: {
        ...(useOwnStripe !== undefined ? { useOwnStripe } : {}),
        ...(stripePubKey !== undefined ? { stripePubKey: stripePubKey || null } : {}),
        ...(stripeSecretKey !== undefined ? { stripeSecretKey: stripeSecretKey || null } : {}),
      },
    });

    const settings = await db.hostSettings.findUnique({ where: { userId: session.user.id } });
    return NextResponse.json({
      ok: true,
      settings: {
        useOwnStripe: settings?.useOwnStripe ?? false,
        stripePubKey: settings?.stripePubKey ?? '',
        hasStripeSecret: !!settings?.stripeSecretKey,
        commissionRate: settings?.commissionRate ?? DEFAULT_HOST_COMMISSION_RATE,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Erreur lors de la sauvegarde.' }, { status: 500 });
  }
}
