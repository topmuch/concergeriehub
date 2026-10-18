// =============================================================
// ORDOMOTIK - Seed: create/update admin & demo users
// Schema tables are created by `prisma db push` in Dockerfile CMD
// This script ONLY handles user seeding
//
// AUDIT 24-e (P0-2) — SÉCURITÉ :
//  • Le Super Admin est désormais CREATE-ONLY : le mot de passe d'un
//    compte existant n'est JAMAIS réécrit au démarrage → la rotation
//    du mot de passe depuis l'app survit enfin aux redéploiements
//    (avant : upsert qui écrasait le hash à chaque boot).
//  • Mot de passe initial : variable d'environnement
//    ADMIN_INITIAL_PASSWORD (à définir dans Coolify). Si absente et
//    compte absent → mot de passe ALÉATOIRE généré, affiché UNE FOIS
//    dans les logs de démarrage.
//  • Le client DÉMO garde son upsert volontaire : c'est un compte
//    produit (bouton « Client Demo » du login = Demo2024!).
//  • FINI : mot de passe superadmin en dur dans le repo.
// =============================================================

const { hash } = require('bcryptjs');
const { randomBytes } = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seedUsers() {
  // ── Super Admin — CREATE ONLY (rotation du mot de passe préservée) ──
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@qrdomotik.roomscan.pro';
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true },
  });
  if (existingAdmin) {
    console.log('[seed] Super Admin déjà présent — AUCUN changement de mot de passe (rotation préservée):', adminEmail);
  } else {
    const generated = !process.env.ADMIN_INITIAL_PASSWORD;
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD
      || randomBytes(12).toString('base64url');
    const adminHash = await hash(initialPassword, 12);
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        fullName: 'Administrateur',
        passwordHash: adminHash,
        role: 'superadmin',
      },
    });
    console.log('[seed] Super Admin créé:', admin.email);
    if (generated) {
      console.log('[seed] ⚠️  ADMIN_INITIAL_PASSWORD absent — mot de passe initial ALÉATOIRE, à changer immédiatement après connexion:');
      console.log('[seed] ⚠️  Mot de passe initial:', initialPassword);
      console.log('[seed] ⚠️  Ce message ne s\'affichera qu\'une seule fois.');
    }
  }

  // Demo Client — upsert VOLONTAIRE : le mot de passe est aligné à chaque
  // démarrage sur le bouton « Client Demo » du formulaire de connexion
  // (src/components/auth/login-form.tsx → Demo2024!). Compte produit.
  const demoHash = await hash('Demo2024!', 12);
  const demo = await prisma.user.upsert({
    where: { email: 'demo@qrdomotik.roomscan.pro' },
    update: { passwordHash: demoHash, fullName: 'Utilisateur Demo', role: 'user' },
    create: {
      email: 'demo@qrdomotik.roomscan.pro',
      fullName: 'Utilisateur Demo',
      passwordHash: demoHash,
      role: 'user',
    },
  });
  console.log('[seed] Demo Client OK:', demo.email);
}

async function main() {
  try {
    await seedUsers();
    console.log('[seed] Done.');
  } catch (err) {
    console.error('[seed] Fatal error:', err.message);
    console.error(err.stack);
  } finally {
    await prisma.$disconnect();
  }
}

main();
