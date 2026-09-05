// =============================================================
// /api/admin/settings/domains/verify — Module 7 : vérification DNS
// Vérification DNS RÉELLE (Node dns/promises) :
//   1. TXT _conciergerie-verify.<domaine> doit contenir
//      "conciergerie-hub=<propertyId>"
//   2. OU CNAME du domaine → domaine de l'app (fallback historique)
// Marque customDomainVerified=true en base si la preuve est trouvée.
// 🔒 Superadmin. Journalisé (audit).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { promises as dns } from 'dns';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { logAudit, clientIp } from '@/lib/audit';

export async function POST(
  req: NextRequest,
) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const body = (await req.json()) as { propertyId?: string };
    const propertyId = String(body.propertyId || '');
    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: { id: true, name: true, customDomain: true, customDomainVerified: true },
    });
    if (!property?.customDomain) {
      return NextResponse.json({ error: 'Bien sans domaine personnalisé' }, { status: 404 });
    }
    const domain = property.customDomain.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];

    const checks: string[] = [];
    let verified = false;

    // 1) TXT de possession
    try {
      const txts = await dns.resolveTxt(`_conciergerie-verify.${domain}`);
      const flat = txts.map((chunks) => chunks.join(''));
      checks.push(`TXT _conciergerie-verify: ${flat.length} entrée(s)`);
      if (flat.some((v) => v.trim() === `conciergerie-hub=${property.id}`)) verified = true;
    } catch {
      checks.push('TXT _conciergerie-verify: introuvable');
    }

    // 2) CNAME vers le domaine de l'app (fallback)
    if (!verified) {
      const appHost = new URL(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').hostname;
      try {
        const cnames = await dns.resolveCname(domain);
        checks.push(`CNAME: ${cnames.join(', ')}`);
        if (cnames.some((c) => c === appHost)) verified = true;
      } catch {
        checks.push('CNAME: introuvable');
      }
    }

    if (verified && !property.customDomainVerified) {
      await db.property.update({
        where: { id: property.id },
        data: { customDomainVerified: true },
      });
    }

    await logAudit({
      actor: admin,
      action: 'settings.domain_verify',
      entityType: 'property',
      entityId: property.id,
      details: { domain, verified, checks },
      ip: clientIp(req.headers),
    });

    return NextResponse.json({
      verified,
      alreadyVerified: property.customDomainVerified,
      checks,
      message: verified
        ? `Domaine ${domain} vérifié — l'app invitée sera servie sous ce domaine.`
        : `Vérification échouée pour ${domain}. Configurez le TXT (ou le CNAME) puis réessayez (propagation DNS jusqu'à 24 h).`,
    });
  } catch (error) {
    console.error('[POST /api/admin/settings/domains/verify] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
