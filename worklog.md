# Worklog — Conciergerie Hub (transformation Qrdoo → SaaS B2B)

---
Task ID: 1
Agent: Z.ai Code (orchestrator)
Task: Clone https://github.com/topmuch/Qrdoo.git, installer les dépendances, lancer le dev, puis ÉTAPE 1 : audit du codebase famille.

Work Log:
- Cloné le repo Qrdoo (commit 11e2369) dans /tmp puis fusionné (rsync, hors .git/skills/worklog.md/PNG) dans /home/z/my-project.
- `.env` du repo conservé : DATABASE_URL=file:/home/z/my-project/db/custom.db. Caddyfile identique à celui du sandbox.
- `bun install` : 72 packages installés.
- `bunx prisma generate` + `bun run db:push` : DB recréée (db/custom.db), 38 modèles poussés.
- Erreur au premier démarrage : `src/instrumentation.ts` (init SQLite production Coolify) cassait le build Edge de Next 16. Corrigé avec imports dynamiques protégés par NEXT_RUNTIME, puis désactivé en `src/instrumentation.ts.bak` (utile uniquement au déploiement Docker/Coolify, no-op en dev). Convention `.bak` déjà utilisée dans le repo (middleware.ts.bak).
- Serveur dev `bun run dev` OK sur port 3000 : "Ready in 791ms", page / répond HTTP 200 (title ORDOMOTIK - Smart Home Solutions).
- Audit complet réalisé via agent Explore + vérifications croisées manuelles (greps d'imports).

Stage Summary:
- Projet cloné, installé, DB initialisée, dev server opérationnel sur port 3000.
- DÉCOUVERTE CLÉ : tout le dossier src/components/modules/ (105 fichiers) est du CODE MORT (module-registry ← module-explorer ← personne ; registry.ts ← module-preview/module-config ← personne). Les pages publiques hub/view réimplémentent les affichages en inline.
- chores-manager.tsx (795 l.) est chaîné via page.tsx case 'client-chores' (case mort : plus d'entrée nav).
- Modèles Prisma famille à SUPPRIMER : Chore, ChoreCompletion. À MODIFIER : User (relations chores), Home (chores), HomeMember (points), Product (isOnShoppingList), Subscription (plan 'famille'), VoiceMessage (senderType 'family').
- Bloc Marketplace B2C (Merchant, Coupon, Promo, FlashSale, Professional, etc.) listé séparément pour évaluation.
- Rapport d'audit ÉTAPE 1 livré à l'utilisateur. ÉTAPE 2 (rebranding + onboarding /setup) en attente de validation.

---
Task ID: 2-a
Agent: Z.ai Code (orchestrator)
Task: ÉTAPE 2 — Adaptation Prisma B2B (Home→Property, PropertyType, Provider géoloc + audience, enums modules) + exécution du nettoyage ÉTAPE 1 validé.

Work Log:
- Supprimé : src/components/modules/ (105 f.), chores-manager.tsx, module-preview.tsx, module-config.tsx, admin-layout.tsx, 4 routes API chores, case 'client-chores' + import dans page.tsx.
- Renommages mécaniques (sed global src/ + scripts/) : Home→Property (model + db.home→db.property), HomeMember→PropertyMember, HomeAutomation→PropertyAutomation, Professional→Provider, homeId→propertyId, professionalId→providerId, includes/selects home:→property:, db.homeMember→db.propertyMember, homeMemberships→propertyMemberships.
- Réécrit prisma/schema.prisma (36 modèles) : Property (+propertyType 'AIRBNB'|'BOOKING'|'GITE'|'CHAMBRE_HOTE', +latitude/longitude, pinHash="Mode Hôte"), Provider (ex Professional, +latitude/longitude/serviceRadiusKm/audience 'OWNER_SERVICE'|'GUEST_EXPERIENCE'), User.selectedPlan sans 'famille' (airbnb_solo|airbnb_pro|agency|free), Subscription.maxHomes→maxProperties, VoiceMessage senderType 'guest'|'host'|'system', HomeMember sans points + rôles B2B, PropertyType commenté sur QrCode.type (catalogue B2B : WIFI|GUIDEBOOK|UPSELLING|CHECKOUT|COMPLAINT|PROVIDER_DIRECTORY), +createdAt sur PhysicalQrCode & Service (utilisé par orderBy existants).
- Migration : prisma migrate dev --name conciergerie_b2b_update (prisma/migrations/20260830183759_conciergerie_b2b_update/), DB jetable recréée.
- Supprimé le pack 'famille' de packs-config.ts ; setup route : default plan 'airbnb_solo', whitelist sans 'famille', planConfig sans famille.
- types/database.ts : HomeMemberRole B2B (owner|cohost|staff|cleaner|member), 'chore_reminder' et ChoreFrequency/ChoreCompletionStatus retirés, HOME_MEMBER_ROLES mis à jour ; VALID_ROLES API members sans 'child' ; ALL_EVENTS webhooks sans 'chore_completed'.
- Fixes TS préexistants révélés par le passage strict : stripe apiVersion retiré (4 routes), PLANS.free.stripePriceId typé, webhook stripe (getStripe narrowing + import type Stripe), ClientPage élargi + breadcrumbs, flash-sales title required, view-content unknown→boolean coercion, scan-analytics formatter, module-content-fields FieldType +'email', use-push-notifications cast BufferSource, useState defaults (webhooks/automations managers), bug repo original "const omes" réparé (en réalité illusion d'affichage: le chat filtre la séquence ANSI [h — utiliser base64/booléens pour les diagnostics).
- tsc --noEmit : 0 erreur (hors examples/skills/mini-services hors build). ESLint : 0 erreur.
- Vérifié navigateur (agent-browser) : landing rendue + interactive, vues démo accessibles, /api/client/billing/plans OK, /api/public/hub/[slug] OK avec payload property:. Aucune erreur console.

Stage Summary:
- Schéma B2B validé techniquement : Property/PropertyMember/PropertyAutomation/Provider renommés, géoloc + audience prestataires OK, catalogue modules B2B documenté, famille entièrement retiré de la DB/logic.
- 1 migration propre : conciergerie_b2b_update. tsc + eslint verts, dev server OK sur :3000, APIs vérifiées.
- En attente SOUS-ÉTAPE B : palette Tailwind B2B, B2BCard/EmojiIcon/ProgressBar, wizard /setup 4 étapes (Airbnb/Gîte/Gestionnaire, infos logement, PIN, config rapide) + narrowing final des modules V2 dans types/database.ts + rebranding textes (hub-content "Mode Hôte", landing).

---
Task ID: 3
Agent: Z.ai Code (orchestrator) + subagent rebranding (3-c)
Task: ÉTAPE 3 — Rebranding & UI : palette B2B, composants UI, wizard /setup 4 étapes, rebranding textes global.

Work Log:
- globals.css : tokens B2B complets (light + dark). Primary #0F172A, accent #059669 (Emerald — choisi parmi les 2 options proposées), background #F8FAFC, card #FFF, border #E2E8F0, radius 0.75rem. Brand tokens @theme : bg-brand, bg-brand-accent, etc. Fini les gradients violets complexes.
- Nouveaux composants ui/ : b2b-card.tsx (B2BCard : blanc, border-slate-200, shadow-sm, rounded-xl, header/badge/footer optionnels), emoji-icon.tsx (EmojiIcon : tuile emoji 5 tailles × 4 variantes), progress-bar.tsx (ProgressBar : piste slate, remplissage emerald, label + %), brand-logo.tsx (BrandLogo : tuile 🗝️ + wordmark "Conciergerie Hub", variants dark/light) — remplace le PNG ordomotik partout.
- Subagent (3-c) : 13 fichiers rebrandés — i18n.ts (powered_by ×8 langues), pdf-export, role-selector, login-form (tagline B2B + BrandLogo + violet→emerald), client-layout, super-admin-layout, view-content (footer), QRTPreview, PageTransition, how-it-works, modules-showcase (modules famille renommés Check-out/Prestataires/Upselling), interactive-demo (Mode Invité), types/database.ts (commentaire).
- QRT components restylés B2B : QRTCard (border slate-200, shadow-sm, rounded-xl), QRTButton (primary slate-900 / new variant accent emerald / secondary blanc), QRTProgressBar (dots slate, barre emerald), QRTNumericKeypad (touches blanches bordure slate, dots emerald). Se propage à setup/activate/hub/view automatiquement.
- API /api/setup/[token] : +propertyType (AIRBNB|BOOKING|GITE|CHAMBRE_HOTE, validé), +address, +latitude/longitude (parse + validation), plan whitelist +agency (49€/mois, 10 biens), property.create avec nouveaux champs, module Guidebook (type home_manual, "Guide de bienvenue") ajouté aux modules par défaut du Salon, "Contact propriétaire"→"Contact hôte".
- Wizard /setup/[token] réécrit (setup-content.tsx, ~800 l.) : fond clair #F8FAFC, BrandLogo header. Flow : welcome → ①type (3 cartes emoji 🏠 Airbnb / 🏨 Gîte & Chambre d'hôtes / 🏢 Gestion multi-biens, radio + badge plan : airbnb_solo ou agency) → ②info (compte hôte + nom annonce + adresse précise + bouton géolocalisation navigator.geolocation → lat/lng) → ③PIN 4 chiffres (QRTNumericKeypad, "protège votre Mode Hôte") → ④config (Wi-Fi SSID/MP + carte modules : Wi-Fi/Guidebook "Activé", Annuaire/Upselling "Plus tard" + récap) → succès (check emerald animé + confettis emojis + ProgressBar + carte récap + redirection dashboard auto 4s avec login credentials si nouvel utilisateur).
- Landing hero-section : H1 "Transformez vos locations en expériences 5 étoiles", badge/CTA emerald, "Dès 9,90 €/mois", trust "2 500+ logements gérés", CtaFinal "Prêt à passer en mode Hôte ?", footer réécrit, BrandLogo nav/footer, fond slate-950 uni + halos emerald.
- pricing-section : plan Famille remplacé par "Découverte 0€" (gratuit) ; Airbnb Solo 9,90€/mois (highlight) ; Airbnb Pro→"Agence" 49€/mois multi-biens (10 logements, équipe co-hôtes/staff/cleaning).
- hub-content : carte "Mode Famille"→"Mode Hôte" (emerald, 🗝️, "Accès complet au logement"), sous-titre header Mode Hôte, toast "Connectez-vous à votre tableau de bord Conciergerie Hub", footer texte 🗝️ Conciergerie Hub. Sweep violet #6D28D9/#5B21B6/#8B5CF6 → #059669/#047857/#10B981 sur hub/view/activate/QRTPreview (sed).
- demo-views.tsx : SetupDemo en clair B2B (light, 🗝️ Conciergerie Hub, plans Solo/Agence, succès check emerald), HubDemo : "Mode Hôte" bouton slate, PIN "Code Hôte" slate-800→950, salons famille→hôte (Buanderie, check-list check-out, prestataires), DEMO badge emerald.
- page.tsx : nav démo violet→emerald, title "Hub QR (Invité / Hôte)".
- layout.tsx : metadata "Conciergerie Hub — La conciergerie digitale des hôtes" + keywords B2B.
- BUG CRITIQUE PRÉEXISTANT corrigé : src/lib/auth.ts dépendait du CLI sqlite3 (/usr/bin/sqlite3, absent du sandbox) et lisait db/qrdomotik.db alors que Prisma écrit db/custom.db → login IMPOSSIBLE. Réécrit sur Prisma (db.user.findUnique + bcrypt compare), même base que le reste de l'app. JWT/session callbacks inchangés.
- .env : +NEXTAUTH_SECRET +NEXTAUTH_URL (sessions stables). scripts/seed-demo-users.ts créé et exécuté : admin@qrdomotik.roomscan.pro (superadmin) + demo@qrdomotik.roomscan.pro (user, plan airbnb_solo) — comptes affichés sur le formulaire.
- login-form.tsx : bug hydration préexistant corrigé (button imbriqué dans button des cartes identifiants → motion.div role="button" + onKeyDown).
- tsc 0 erreur, eslint 0 erreur. Vérifié navigateur : landing (desktop+mobile), wizard démo complet cliquable bout en bout (API demo POST → succès + hubSlug), hub démo Mode Hôte + PIN, login démo → dashboard OK, console sans erreur.

Stage Summary:
- Identité B2B appliquée : palette Slate 900/Emerald 600/#F8FAFC, BrandLogo 🗝️ partout, emoji-icons, cartes épurées border-slate-200/shadow-sm/rounded-xl, zéro gradient violet sur les surfaces publiques.
- Wizard onboarding B2B fonctionnel (4 étapes + succès) aligné sur le schéma Property (propertyType/address/lat/lng) et le catalogue modules (Wi-Fi + Guidebook activés, Annuaire/Upselling plus tard).
- Login unifié Prisma + comptes démo seedés : la démo est utilisable de bout en bout.
- Reste pour ÉTAPE 4 : de-violetiser l'intérieur du dashboard client (cartes stats "SCANS HUB" violet, tableaux, boutons internes), narrowing catalogue modules dans types/database.ts + hub/view renderers, ajustements hub-content restants (variables totalFamilyModules), QRTags preview restant.
