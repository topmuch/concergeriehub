// =============================================================
// ÉTAPE 17.5 (V3) — Seed démo "Catalogue fin par service" (idempotent)
// Crée les ServiceOffer (offres commandables par bien) des prestataires
// GUEST_EXPERIENCE dans le rayon du Loft Canal Saint-Martin.
// Réexécutable sans dupliquer : upsert sur l'unique
// (propertyId, providerId, name) — répare prix/unité/description et
// réactive une offre désactivée pour converger vers l'état démo.
// =============================================================
import { db } from '@/lib/db';

const SLUG = 'loft-canal-saint-martin-11wz';

interface OfferSeed {
  name: string;
  unitPrice: number;
  unit: string;
  description: string;
}

const OFFERS_BY_PROVIDER: Record<string, OfferSeed[]> = {
  'Morning Box Paris': [
    {
      name: 'Morning Box M (2 pers.)',
      unitPrice: 12,
      unit: 'box',
      description: 'Viennoiseries artisanales, jus pressés, fruits de saison — livré avant 8 h.',
    },
    {
      name: 'Morning Box L (4 pers.)',
      unitPrice: 18,
      unit: 'box',
      description: 'La box généreuse : salé, sucré et boisson chaude pour toute l\u2019équipe.',
    },
  ],
  'Sommelier à Domicile': [
    {
      name: 'Dégustation 3 vins',
      unitPrice: 65,
      unit: 'personne',
      description: 'Trois régions, trois styles — 1 h 30 de voyage œnologique.',
    },
    {
      name: 'Dégustation 5 vins',
      unitPrice: 95,
      unit: 'personne',
      description: 'Le grand format : 5 crus et plateau de fromages affinés.',
    },
  ],
  'Chef Antoine — Dîner Privé': [
    {
      name: 'Menu Dégustation 5 services',
      unitPrice: 85,
      unit: 'personne',
      description: 'Marché du jour, dressage à l\u2019assiette, service en logement.',
    },
    {
      name: 'Menu Signature 7 services',
      unitPrice: 120,
      unit: 'personne',
      description: 'Le grand menu : le chef s\u2019installe à table avec vos invités.',
    },
  ],
  'Paris Transfer Premium': [
    {
      name: 'Navette Aéroport CDG (1-4 pers.)',
      unitPrice: 79,
      unit: 'trajet',
      description: 'Berline confort, chauffeur suivi de vol, bagages inclus.',
    },
    {
      name: 'Navette Aéroport Orly (1-4 pers.)',
      unitPrice: 69,
      unit: 'trajet',
      description: 'Trajet direct Orly ↔ logement, eau et recharges offertes.',
    },
  ],
  'Louvre Private Tours': [
    {
      name: 'Visite guidée privée — 2 h',
      unitPrice: 90,
      unit: 'groupe',
      description: 'Les chefs-d\u2019œuvre du Louvre avec un guide conférencier.',
    },
    {
      name: 'Visite guidée privée — 3 h',
      unitPrice: 130,
      unit: 'groupe',
      description: 'Grand parcours + expositions temporaires, coupe-file inclus.',
    },
  ],
};

async function main() {
  const property = await db.property.findUnique({
    where: { qrHubSlug: SLUG },
    select: { id: true, name: true },
  });
  if (!property) {
    console.error(`❌ Bien introuvable pour le slug "${SLUG}"`);
    process.exit(1);
  }

  const providers = await db.provider.findMany({
    where: { isActive: true, audience: 'GUEST_EXPERIENCE' },
    select: { id: true, businessName: true },
  });

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const [businessName, offers] of Object.entries(OFFERS_BY_PROVIDER)) {
    const provider = providers.find((p) => p.businessName === businessName);
    if (!provider) {
      console.warn(`⚠️ Prestataire GUEST_EXPERIENCE introuvable : ${businessName}`);
      skipped += offers.length;
      continue;
    }
    for (const o of offers) {
      const existing = await db.serviceOffer.findUnique({
        where: {
          propertyId_providerId_name: {
            propertyId: property.id,
            providerId: provider.id,
            name: o.name,
          },
        },
      });
      if (existing) {
        const needsUpdate =
          existing.unitPrice !== o.unitPrice ||
          existing.unit !== o.unit ||
          existing.description !== o.description ||
          !existing.isActive;
        if (needsUpdate) {
          await db.serviceOffer.update({
            where: { id: existing.id },
            data: {
              unitPrice: o.unitPrice,
              unit: o.unit,
              description: o.description,
              isActive: true,
            },
          });
          updated++;
        } else {
          unchanged++;
        }
      } else {
        await db.serviceOffer.create({
          data: {
            propertyId: property.id,
            providerId: provider.id,
            name: o.name,
            unitPrice: o.unitPrice,
            unit: o.unit,
            description: o.description,
          },
        });
        created++;
      }
    }
  }

  console.log(
    `✅ ServiceOffer — créées: ${created}, mises à jour: ${updated}, inchangées: ${unchanged}, ignorées (prestataire absent): ${skipped}`,
  );
  console.log(`   Bien : ${property.name} (${property.id})`);

  await db.$disconnect();
}

main();
