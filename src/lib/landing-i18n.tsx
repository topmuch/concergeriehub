'use client';

// =============================================================
// LANDING I18N — 8 langues officielles du produit RoomScan.
//
//   fr · en · es · de · nl · it · pt · ar (ar = RTL)
//
// Pattern identique à src/lib/i18n.ts (pages /view) : les CLÉS du
// dictionnaire sont les textes FRANÇAIS EXACTS de la landing, les
// valeurs sont les traductions. t(frText) renvoie la traduction de
// la langue courante, SINON le texte FR d'origine (fallback robuste)
// → adoption progressive : toute clé manquante ne casse pas le rendu.
// fr = dictionnaire vide (identité).
//
// Persistance : localStorage 'roomscan-lang' → sinon navigator.language
// (préfixe match) → sinon 'fr'.
//
// SANS FLASH + SANS ERREUR D'HYDRATATION : la langue est lue dans un
// store externe via useSyncExternalStore. Pendant le SSR et
// l'hydratation, React utilise getServerSnapshot → 'fr' (rendu identique
// au serveur, zéro mismatch) puis re-lit getSnapshot (localStorage /
// navigator) et re-rend immédiatement si différent — l'équivalent
// exact du « useState initializer » demandé, mais sans l'erreur
// d'hydratation qu'il provoquerait en App Router (composants client
// pré-rendus côté serveur). Aucun useEffect visible pour l'init.
//
// Interpolation : t('… {x} …', { x: 42 }) → remplacement simple de
// {x} (les chaînes interpolées restent traduisibles).
// =============================================================

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

export type Lang = 'fr' | 'en' | 'es' | 'de' | 'nl' | 'it' | 'pt' | 'ar';

export interface LocaleDef {
  code: Lang;
  /** Libellé NATIF (jamais traduit). */
  label: string;
  dir: 'ltr' | 'rtl';
}

/** Les 8 langues officielles — source de vérité pour le switcher. */
export const SUPPORTED_LOCALES: readonly LocaleDef[] = [
  { code: 'fr', label: 'Français', dir: 'ltr' },
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'es', label: 'Español', dir: 'ltr' },
  { code: 'de', label: 'Deutsch', dir: 'ltr' },
  { code: 'nl', label: 'Nederlands', dir: 'ltr' },
  { code: 'it', label: 'Italiano', dir: 'ltr' },
  { code: 'pt', label: 'Português', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
] as const;

const LANG_CODES: readonly string[] = SUPPORTED_LOCALES.map((l) => l.code);
const STORAGE_KEY = 'roomscan-lang';

/** Direction de la langue (RTL pour l'arabe). */
export function dirFor(lang: Lang): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

// -------------------------------------------------------------
// Store externe (localStorage + navigator) — lu de façon synchrone
// -------------------------------------------------------------

let currentLang: Lang | null = null;
const listeners = new Set<() => void>();

function readStoredLang(): Lang | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && (LANG_CODES as string[]).includes(v) ? (v as Lang) : null;
  } catch {
    return null;
  }
}

function detectBrowserLang(): Lang {
  if (typeof navigator !== 'undefined') {
    const candidates = [
      ...(navigator.languages ?? []),
      navigator.language,
    ].filter((c): c is string => Boolean(c));
    for (const c of candidates) {
      const base = c.toLowerCase().split('-')[0];
      if ((LANG_CODES as string[]).includes(base)) return base as Lang;
    }
  }
  return 'fr';
}

function getSnapshot(): Lang {
  if (typeof window === 'undefined') return 'fr';
  if (currentLang === null) {
    currentLang = readStoredLang() ?? detectBrowserLang();
  }
  return currentLang;
}

// SSR + hydratation : toujours FR (identique au HTML serveur).
const getServerSnapshot = (): Lang => 'fr';

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setLangGlobal(next: Lang): void {
  if (next === currentLang) return;
  currentLang = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Mode privé / quota — la langue reste active pour la session.
  }
  listeners.forEach((l) => l());
}

// -------------------------------------------------------------
// Dictionnaires — clés = texte FR exact, valeurs = traductions.
// fr = {} (identité : t(frText) → frText).
// -------------------------------------------------------------

const DICTIONARIES: Record<Lang, Record<string, string>> = {
  fr: {},

  // =========================================================
  // ENGLISH
  // =========================================================
  en: {
    // Offre « États des Lieux » (module standalone, carte tarifs v4.107)
    'Module indépendant': 'Standalone module',
    'Le module des conciergeries qui veulent des EDL impeccables.':
      'The module for property managers who want flawless move-in reports.',
    'Entrée & sortie en 5 étapes guidées': 'Move-in & move-out in 5 guided steps',
    'Génération de PDF illimitée': 'Unlimited PDF generation',
    'Signature électronique de l’invité': 'Guest e-signature',
    'Partage par lien sécurisé (sans compte)': 'Share via secure link (no account needed)',
    'Emails automatiques hôte + invité': 'Automatic host + guest emails',
    'Payer 299 € — PDF illimités': 'Pay 299 € — unlimited PDFs',
    'Paiement sécurisé PayPal · Accès immédiat': 'Secure PayPal payment · Instant access',
    // Navbar
    'Fonctionnalités': 'Features',
    'Comment ça marche': 'How it works',
    'Tarifs': 'Pricing',
    'Contact': 'Contact',
    'Connexion': 'Log in',
    'Essai gratuit': 'Free trial',
    'RoomScan — retour en haut': 'RoomScan — back to top',
    'Fermer le menu': 'Close menu',
    'Ouvrir le menu': 'Open menu',
    // Language switcher
    'Choisir la langue': 'Choose language',
    // Démo (section)
    'La magie en 1 scan': 'The magic of a single scan',
    'Voyez le Hub': 'See the Hub',
    'en action': 'in action',
    "Observez comment l'expérience bascule fluidement entre le mode Invité (commande de services) et le mode Hôte (dashboard de gestion), le tout sans installer d'application.":
      'Watch how the experience switches smoothly between Guest mode (service ordering) and Host mode (management dashboard), all without installing an app.',
    'Démo en cours de lecture…': 'Demo playing…',
    // Footer
    'La plateforme tout-en-un pour les hôtes Airbnb et conciergeries professionnelles.':
      'The all-in-one platform for Airbnb hosts and professional property managers.',
    'Produit': 'Product',
    'Vos espaces': 'Your spaces',
    'Espace Hôte': 'Host Space',
    'États des Lieux': 'Move-in Reports',
    'Console Superadmin': 'Superadmin Console',
    'Démo interactive': 'Interactive demo',
    'Avantages fondateurs': 'Founder benefits',
    'Légal': 'Legal',
    'Mentions légales': 'Legal notice',
    'CGU': 'Terms of Service',
    'Confidentialité': 'Privacy',
    'Réponse sous 24 h, 7j/7': 'Reply within 24 h, 7 days a week',
    '© {year} RoomScan. Tous droits réservés.':
      '© {year} RoomScan. All rights reserved.',
    // Hero
    'Nouveau — Mode White-Label': 'New — White-Label Mode',
    'Transformez chaque séjour en expérience 5 étoiles.':
      'Turn every stay into a 5-star experience.',
    'Une seule plaque QR élégante : vos invités accèdent au Wi-Fi, au guidebook et à vos services en 1 scan. Vous pilotez tout depuis un dashboard professionnel.':
      'One elegant QR plaque: your guests get Wi-Fi, the guidebook and your services in a single scan. You manage everything from a professional dashboard.',
    "Commencer l'essai gratuit": 'Start your free trial',
    'Voir la démo': 'Watch the demo',
    'Hôtes actifs': 'Active hosts',
    'Satisfaction': 'Satisfaction',
    'Setup moyen': 'Average setup',
    // Avant / Après
    'La différence': 'The difference',
    "Du chaos papier à l'expérience": 'From paper chaos to a',
    '5 étoiles': '5-star experience',
    'Vos invités ne verront que la version de droite.':
      'Your guests will only ever see the right-hand side.',
    'Avant': 'Before',
    "La gestion à l'ancienne": 'The old-school way',
    'Le Wi-Fi écrit sur un post-it perdu': 'Wi-Fi written on a lost sticky note',
    '20 messages « où est la clé ? »': '20 messages: “where is the key?”',
    'Un guidebook papier périmé': 'An out-of-date paper guidebook',
    'Des avis mitigés, visibles par tous': 'Mixed reviews, visible to everyone',
    'Après': 'After',
    'Avec RoomScan': 'With RoomScan',
    'Wi-Fi auto-connecté en 1 scan': 'Wi-Fi auto-connected in one scan',
    'Accueil digitalisé, zéro allers-retours': 'Digital welcome, zero back-and-forth',
    'Guidebook toujours à jour, dans la poche':
      'Guidebook always up to date, right in their pocket',
    'Problèmes résolus en privé, avant l’avis public':
      'Issues resolved privately, before the public review',
    // Comment ça marche
    'Opérationnel en': 'Up and running in',
    '3 minutes': '3 minutes',
    "De la réception de la plaque à l'autonomie de vos invités, c'est simple comme bonjour.":
      'From receiving your plaque to fully self-sufficient guests — it couldn\'t be simpler.',
    'Recevez votre plaque': 'Receive your plaque',
    'Design premium en aluminium gravé, prête à poser. Livrée chez vous en 48 h.':
      'Premium engraved aluminium design, ready to display. Delivered to your door within 48 h.',
    'Scannez pour configurer': 'Scan to configure',
    'Wizard guidé : Wi-Fi, guidebook, règles, PIN. 2 minutes chrono, sans compétence technique.':
      'Guided wizard: Wi-Fi, guidebook, house rules, PIN. 2 minutes flat, no technical skills required.',
    'Vos invités sont autonomes': 'Your guests are self-sufficient',
    "Ils scannent, commandent, s'informent. Vous pilotez tout à distance, depuis votre dashboard.":
      'They scan, order and find their way around. You manage everything remotely, from your dashboard.',
    'Zéro application à installer — tout fonctionne dans le navigateur':
      'Zero apps to install — everything runs in the browser',
    // Bento / Fonctionnalités
    'Tout votre tableau de bord,': 'Your entire dashboard,',
    'une seule plaque': 'one single plaque',
    'Une plateforme complète pour gérer vos locations courte durée comme un pro.':
      'A complete platform to run your short-term rentals like a pro.',
    'Cœur du produit': 'Core of the product',
    'Dashboard multi-propriétés': 'Multi-property dashboard',
    'Pilotez villas, studios et appartements depuis un seul écran : séjours, services, équipe et revenus — en temps réel.':
      'Run villas, studios and apartments from a single screen: stays, services, team and revenue — in real time.',
    'Upselling automatisé': 'Automated upselling',
    'Vendez petit-déjeuner, transfert ou late check-out directement depuis le hub. Revenus passifs, zéro effort.':
      'Sell breakfast, transfers or late check-out straight from the hub. Passive revenue, zero effort.',
    'Petit-déjeuner · +12 €': 'Breakfast · +€12',
    'Transfert gare · +29 €': 'Station transfer · +€29',
    'Late check-out · +45 €': 'Late check-out · +€45',
    '≈ +340 € / mois': '≈ +€340 / month',
    'Anti-mauvais avis': 'Bad-review shield',
    "Un souci ? L'invité le signale en privé depuis le hub. Vous résolvez avant que l'avis public n'existe.":
      'Something wrong? The guest reports it privately from the hub. You fix it before a public review ever exists.',
    'Signalement privé': 'Private report',
    'Résolution express': 'Express resolution',
    '★★★★★ préservée': '★★★★★ preserved',
    'Votre logo, vos couleurs, votre domaine. Vos invités ne voient que votre marque.':
      'Your logo, your colours, your domain. Your guests only ever see your brand.',
    'Équipe': 'Team',
    'Ménage, maintenance, co-hôtes : rôles et permissions granulaires.':
      'Housekeeping, maintenance, co-hosts: granular roles and permissions.',
    'Scans, revenus et engagement de vos invités en temps réel.':
      'Scans, revenue and guest engagement in real time.',
    // Tarifs
    'Simple. Transparent.': 'Simple. Transparent.',
    'Sans surprise.': 'No surprises.',
    "Choisissez l'offre adaptée à votre activité. 14 jours d'essai, sans engagement.":
      'Choose the plan that fits your business. 14-day trial, no commitment.',
    '1 logement': '1 property',
    'Pour les hôtes avec un seul logement.': 'For hosts with a single property.',
    '/ mois': '/ month',
    '1 Plaque QR Hub': '1 Hub QR plaque',
    'Wi-Fi & guidebook illimités': 'Unlimited Wi-Fi & guidebook',
    'Module upselling de base': 'Basic upselling module',
    'Support par email': 'Email support',
    'Analytics essentiels': 'Essential analytics',
    "Commencer l'essai": 'Start the trial',
    'Populaire': 'Popular',
    'Pour les conciergeries et multi-hôtes.': 'For property managers and multi-hosts.',
    '/ an': '/ year',
    'Jusqu’à 3 logements inclus': 'Up to 3 properties included',
    'Équipe multi-rôles (ménage, maintenance)':
      'Multi-role team (housekeeping, maintenance)',
    'White-label complet': 'Full white-label',
    'Analytics avancés multi-biens': 'Advanced multi-property analytics',
    'Support prioritaire 24/7': 'Priority 24/7 support',
    'API & Webhooks': 'API & Webhooks',
    'Passer à Pro': 'Go Pro',
    'Au-delà de 3 logements,': 'More than 3 properties?',
    'contactez-nous': 'Contact us',
    'pour un devis sur mesure.': 'for a tailored quote.',
    // CTA final
    "Prêt à offrir l'expérience": 'Ready to offer the',
    'Rejoignez les 500+ hôtes qui automatisent déjà leur conciergerie.':
      'Join the 500+ hosts already automating their property management.',
    'Sans engagement · Installé en 5 minutes': 'No commitment · Set up in 5 minutes',
    // Démo interactive (libellés principaux)
    'L’invité scanne': 'The guest scans',
    'L’invité scanne la plaque et accède instantanément au Hub digital.':
      'The guest scans the plaque and instantly opens the digital Hub.',
    'L’expérience Guest': 'The guest experience',
    'L’invité commande un service en 1 clic — l’hôte est notifié en temps réel.':
      'The guest orders a service in one tap — the host is notified in real time.',
    'Le Dashboard Hôte': 'The host dashboard',
    'Vous pilotez tout depuis votre dashboard : séjours, services et équipes.':
      'You manage everything from your dashboard: stays, services and teams.',
    'Scannez-moi': 'Scan me',
    '✓ Hub ouvert': '✓ Hub opened',
    '✓ Commande transmise à l’hôte': '✓ Order sent to the host',
    'Étape précédente': 'Previous step',
    'Étape suivante': 'Next step',
    'Étape {n}': 'Step {n}',
    'Mettre la démo en pause': 'Pause the demo',
    'Reprendre la démo': 'Resume the demo',
    'Pause': 'Pause',
    'Lecture': 'Play',
    'Étapes de la démo': 'Demo steps',
    // Lancement (témoignages honnêtes)
    'Lancement': 'Launch',
    'Rejoignez les premiers hôtes RoomScan': 'Join the first RoomScan hosts',
    "RoomScan vient d'ouvrir. Les premiers avis hôtes arrivent dès les premiers séjours — soyez parmi ceux qui les écriront.":
      'RoomScan has just launched. The first host reviews will arrive with the first stays — be among the ones who write them.',
    'Tarif fondateur garanti à vie': 'Founder rate, locked for life',
    "Votre tarif d'inscription est verrouillé pour toujours — même quand de nouvelles fonctionnalités arrivent.":
      'Your sign-up price is locked in forever — even as new features ship.',
    'Accompagnement premium dédié': 'Dedicated premium onboarding',
    'Notre équipe configure vos hubs avec vous, de la plaque au guidebook. Réponse sous 24 h, 7j/7.':
      'Our team sets up your hubs with you, from plaque to guidebook. Reply within 24 h, 7 days a week.',
    'Votre voix compte': 'Your voice counts',
    'Les prochaines fonctionnalités sont votées par les premiers hôtes. Façonnez RoomScan avec nous.':
      'Upcoming features are voted on by the first hosts. Shape RoomScan with us.',
    'Devenir hôte fondateur': 'Become a founding host',
    "Places limitées à la première vague d'hôtes — sans engagement.":
      'Limited to the first wave of hosts — no commitment.',
  },

  // =========================================================
  // ESPAÑOL
  // =========================================================
  es: {
    'Fonctionnalités': 'Funcionalidades',
    'Comment ça marche': 'Cómo funciona',
    'Tarifs': 'Tarifas',
    'Contact': 'Contacto',
    'Connexion': 'Iniciar sesión',
    'Essai gratuit': 'Prueba gratis',
    'RoomScan — retour en haut': 'RoomScan — volver arriba',
    'Fermer le menu': 'Cerrar el menú',
    'Ouvrir le menu': 'Abrir el menú',
    'Choisir la langue': 'Elegir idioma',
    'La magie en 1 scan': 'La magia en 1 escaneo',
    'Voyez le Hub': 'Vea el Hub',
    'en action': 'en acción',
    "Observez comment l'expérience bascule fluidement entre le mode Invité (commande de services) et le mode Hôte (dashboard de gestion), le tout sans installer d'application.":
      'Observe cómo la experiencia cambia con fluidez entre el modo Invitado (pedido de servicios) y el modo Anfitrión (panel de gestión), todo sin instalar ninguna aplicación.',
    'Démo en cours de lecture…': 'Demostración en curso…',
    'La plateforme tout-en-un pour les hôtes Airbnb et conciergeries professionnelles.':
      'La plataforma todo en uno para anfitriones de Airbnb y conciergerías profesionales.',
    'Produit': 'Producto',
    'Vos espaces': 'Tus espacios',
    'Espace Hôte': 'Espacio Anfitrión',
    'États des Lieux': 'Inventario de Entrada',
    'Console Superadmin': 'Consola Superadmin',
    'Démo interactive': 'Demostración interactiva',
    'Avantages fondateurs': 'Ventajas fundadoras',
    'Légal': 'Legal',
    'Mentions légales': 'Aviso legal',
    'CGU': 'Términos y condiciones',
    'Confidentialité': 'Privacidad',
    'Réponse sous 24 h, 7j/7': 'Respuesta en 24 h, 7 días a la semana',
    '© {year} RoomScan. Tous droits réservés.':
      '© {year} RoomScan. Todos los derechos reservados.',
    'Nouveau — Mode White-Label': 'Nuevo — Modo White-Label',
    'Transformez chaque séjour en expérience 5 étoiles.':
      'Convierta cada estancia en una experiencia de 5 estrellas.',
    'Une seule plaque QR élégante : vos invités accèdent au Wi-Fi, au guidebook et à vos services en 1 scan. Vous pilotez tout depuis un dashboard professionnel.':
      'Una sola placa QR elegante: sus invitados acceden al Wi-Fi, a la guía digital y a sus servicios en 1 escaneo. Usted lo gestiona todo desde un panel profesional.',
    "Commencer l'essai gratuit": 'Empiece la prueba gratis',
    'Voir la démo': 'Ver la demo',
    'Hôtes actifs': 'Anfitriones activos',
    'Satisfaction': 'Satisfacción',
    'Setup moyen': 'Configuración media',
    'La différence': 'La diferencia',
    "Du chaos papier à l'expérience": 'Del caos de papel a la experiencia',
    '5 étoiles': '5 estrellas',
    'Vos invités ne verront que la version de droite.':
      'Sus invitados solo verán la versión de la derecha.',
    'Avant': 'Antes',
    "La gestion à l'ancienne": 'La gestión de toda la vida',
    'Le Wi-Fi écrit sur un post-it perdu': 'El Wi-Fi escrito en una nota perdida',
    '20 messages « où est la clé ? »': '20 mensajes: «¿dónde está la llave?»',
    'Un guidebook papier périmé': 'Una guía de papel desactualizada',
    'Des avis mitigés, visibles par tous': 'Reseñas mixtas, visibles para todos',
    'Après': 'Después',
    'Avec RoomScan': 'Con RoomScan',
    'Wi-Fi auto-connecté en 1 scan': 'Wi-Fi conectado automáticamente en 1 escaneo',
    'Accueil digitalisé, zéro allers-retours': 'Bienvenida digital, cero idas y vueltas',
    'Guidebook toujours à jour, dans la poche': 'Guía siempre al día, en el bolsillo',
    'Problèmes résolus en privé, avant l’avis public':
      'Problemas resueltos en privado, antes de la reseña pública',
    'Opérationnel en': 'Operativo en',
    '3 minutes': '3 minutos',
    "De la réception de la plaque à l'autonomie de vos invités, c'est simple comme bonjour.":
      'Desde la recepción de la placa hasta la autonomía de sus invitados: así de simple.',
    'Recevez votre plaque': 'Reciba su placa',
    'Design premium en aluminium gravé, prête à poser. Livrée chez vous en 48 h.':
      'Diseño premium de aluminio grabado, lista para colocar. Entregada en su domicilio en 48 h.',
    'Scannez pour configurer': 'Escanee para configurar',
    'Wizard guidé : Wi-Fi, guidebook, règles, PIN. 2 minutes chrono, sans compétence technique.':
      'Asistente guiado: Wi-Fi, guía digital, normas, PIN. 2 minutos reloj en mano, sin conocimientos técnicos.',
    'Vos invités sont autonomes': 'Sus invitados son autónomos',
    "Ils scannent, commandent, s'informent. Vous pilotez tout à distance, depuis votre dashboard.":
      'Escanean, piden y se informan. Usted lo controla todo a distancia, desde su panel.',
    'Zéro application à installer — tout fonctionne dans le navigateur':
      'Cero aplicaciones que instalar: todo funciona en el navegador',
    'Tout votre tableau de bord,': 'Todo su panel de control,',
    'une seule plaque': 'una sola placa',
    'Une plateforme complète pour gérer vos locations courte durée comme un pro.':
      'Una plataforma completa para gestionar sus alquileres de corta estancia como un profesional.',
    'Cœur du produit': 'Núcleo del producto',
    'Dashboard multi-propriétés': 'Panel multi-propiedades',
    'Pilotez villas, studios et appartements depuis un seul écran : séjours, services, équipe et revenus — en temps réel.':
      'Gestione villas, estudios y apartamentos desde una sola pantalla: estancias, servicios, equipo e ingresos, en tiempo real.',
    'Upselling automatisé': 'Upselling automatizado',
    'Vendez petit-déjeuner, transfert ou late check-out directement depuis le hub. Revenus passifs, zéro effort.':
      'Venda desayuno, traslados o late check-out directamente desde el hub. Ingresos pasivos, cero esfuerzo.',
    'Petit-déjeuner · +12 €': 'Desayuno · +12 €',
    'Transfert gare · +29 €': 'Traslado estación · +29 €',
    'Late check-out · +45 €': 'Late check-out · +45 €',
    '≈ +340 € / mois': '≈ +340 € / mes',
    'Anti-mauvais avis': 'Escudo anti-malas reseñas',
    "Un souci ? L'invité le signale en privé depuis le hub. Vous résolvez avant que l'avis public n'existe.":
      '¿Algún problema? El invitado lo informa en privado desde el hub. Usted lo resuelve antes de que exista la reseña pública.',
    'Signalement privé': 'Aviso privado',
    'Résolution express': 'Resolución exprés',
    '★★★★★ préservée': '★★★★★ preservada',
    'Votre logo, vos couleurs, votre domaine. Vos invités ne voient que votre marque.':
      'Su logo, sus colores, su dominio. Sus invitados solo ven su marca.',
    'Équipe': 'Equipo',
    'Ménage, maintenance, co-hôtes : rôles et permissions granulaires.':
      'Limpieza, mantenimiento, coanfitriones: roles y permisos granulares.',
    'Scans, revenus et engagement de vos invités en temps réel.':
      'Escaneos, ingresos y compromiso de sus invitados en tiempo real.',
    'Simple. Transparent.': 'Simple. Transparente.',
    'Sans surprise.': 'Sin sorpresas.',
    "Choisissez l'offre adaptée à votre activité. 14 jours d'essai, sans engagement.":
      'Elija la oferta adaptada a su actividad. 14 días de prueba, sin compromiso.',
    '1 logement': '1 alojamiento',
    'Pour les hôtes avec un seul logement.': 'Para anfitriones con un solo alojamiento.',
    '/ mois': '/ mes',
    '1 Plaque QR Hub': '1 placa QR Hub',
    'Wi-Fi & guidebook illimités': 'Wi-Fi y guía digital ilimitados',
    'Module upselling de base': 'Módulo de upselling básico',
    'Support par email': 'Soporte por correo',
    'Analytics essentiels': 'Analíticas esenciales',
    "Commencer l'essai": 'Empezar la prueba',
    'Populaire': 'Popular',
    'Pour les conciergeries et multi-hôtes.': 'Para conciergerías y multi-anfitriones.',
    '/ an': '/ año',
    'Jusqu’à 3 logements inclus': 'Hasta 3 alojamientos incluidos',
    'Équipe multi-rôles (ménage, maintenance)':
      'Equipo multi-rol (limpieza, mantenimiento)',
    'White-label complet': 'White-label completo',
    'Analytics avancés multi-biens': 'Analíticas avanzadas multi-propiedad',
    'Support prioritaire 24/7': 'Soporte prioritario 24/7',
    'API & Webhooks': 'API y Webhooks',
    'Passer à Pro': 'Pasar a Pro',
    'Au-delà de 3 logements,': '¿Más de 3 alojamientos?',
    'contactez-nous': 'contacte con nosotros',
    'pour un devis sur mesure.': 'para un presupuesto a medida.',
    "Prêt à offrir l'expérience": '¿Listo para ofrecer la experiencia',
    'Rejoignez les 500+ hôtes qui automatisent déjà leur conciergerie.':
      'Únase a los más de 500 anfitriones que ya automatizan su conciergería.',
    'Sans engagement · Installé en 5 minutes': 'Sin compromiso · Instalado en 5 minutos',
    'L’invité scanne': 'El invitado escanea',
    'L’invité scanne la plaque et accède instantanément au Hub digital.':
      'El invitado escanea la placa y accede al instante al Hub digital.',
    'L’expérience Guest': 'La experiencia invitado',
    'L’invité commande un service en 1 clic — l’hôte est notifié en temps réel.':
      'El invitado pide un servicio en 1 clic — el anfitrión recibe la notificación en tiempo real.',
    'Le Dashboard Hôte': 'El panel del anfitrión',
    'Vous pilotez tout depuis votre dashboard : séjours, services et équipes.':
      'Usted lo gestiona todo desde su panel: estancias, servicios y equipos.',
    'Scannez-moi': 'Escanéame',
    '✓ Hub ouvert': '✓ Hub abierto',
    '✓ Commande transmise à l’hôte': '✓ Pedido enviado al anfitrión',
    'Étape précédente': 'Paso anterior',
    'Étape suivante': 'Paso siguiente',
    'Étape {n}': 'Paso {n}',
    'Mettre la démo en pause': 'Pausar la demo',
    'Reprendre la démo': 'Reanudar la demo',
    'Pause': 'Pausa',
    'Lecture': 'Reproducir',
    'Étapes de la démo': 'Pasos de la demo',
    'Lancement': 'Lanzamiento',
    'Rejoignez les premiers hôtes RoomScan': 'Únase a los primeros anfitriones de RoomScan',
    "RoomScan vient d'ouvrir. Les premiers avis hôtes arrivent dès les premiers séjours — soyez parmi ceux qui les écriront.":
      'RoomScan acaba de abrir. Las primeras reseñas de anfitriones llegarán con las primeras estancias — sea de quienes las escriben.',
    'Tarif fondateur garanti à vie': 'Tarifa fundadora garantizada de por vida',
    "Votre tarif d'inscription est verrouillé pour toujours — même quand de nouvelles fonctionnalités arrivent.":
      'El precio de registro queda bloqueado para siempre, incluso a medida que lleguen nuevas funciones.',
    'Accompagnement premium dédié': 'Acompañamiento premium dedicado',
    'Notre équipe configure vos hubs avec vous, de la plaque au guidebook. Réponse sous 24 h, 7j/7.':
      'Nuestro equipo configura sus hubs con usted, de la placa a la guía digital. Respuesta en 24 h, 7 días a la semana.',
    'Votre voix compte': 'Su voz cuenta',
    'Les prochaines fonctionnalités sont votées par les premiers hôtes. Façonnez RoomScan avec nous.':
      'Las próximas funciones se votan entre los primeros anfitriones. Dé forma a RoomScan con nosotros.',
    'Devenir hôte fondateur': 'Convertirse en anfitrión fundador',
    "Places limitées à la première vague d'hôtes — sans engagement.":
      'Plazas limitadas a la primera oleada de anfitriones — sin compromiso.',
  },

  // =========================================================
  // DEUTSCH
  // =========================================================
  de: {
    'Fonctionnalités': 'Funktionen',
    'Comment ça marche': 'So funktioniert es',
    'Tarifs': 'Preise',
    'Contact': 'Kontakt',
    'Connexion': 'Anmelden',
    'Essai gratuit': 'Kostenlos testen',
    'RoomScan — retour en haut': 'RoomScan — nach oben',
    'Fermer le menu': 'Menü schließen',
    'Ouvrir le menu': 'Menü öffnen',
    'Choisir la langue': 'Sprache wählen',
    'La magie en 1 scan': 'Magie in 1 Scan',
    'Voyez le Hub': 'Erleben Sie den Hub',
    'en action': 'in Aktion',
    "Observez comment l'expérience bascule fluidement entre le mode Invité (commande de services) et le mode Hôte (dashboard de gestion), le tout sans installer d'application.":
      'Sehen Sie, wie das Erlebnis nahtlos zwischen Gastmodus (Services bestellen) und Gastgebermodus (Verwaltungs-Dashboard) wechselt — ganz ohne App-Installation.',
    'Démo en cours de lecture…': 'Demo läuft…',
    'La plateforme tout-en-un pour les hôtes Airbnb et conciergeries professionnelles.':
      'Die All-in-One-Plattform für Airbnb-Gastgeber und professionelle Property-Manager.',
    'Produit': 'Produkt',
    'Vos espaces': 'Ihre Bereiche',
    'Espace Hôte': 'Gastgeber-Bereich',
    'États des Lieux': 'Übergabeprotokoll',
    'Console Superadmin': 'Superadmin-Konsole',
    'Démo interactive': 'Interaktive Demo',
    'Avantages fondateurs': 'Founder-Vorteile',
    'Légal': 'Rechtliches',
    'Mentions légales': 'Impressum',
    'CGU': 'AGB',
    'Confidentialité': 'Datenschutz',
    'Réponse sous 24 h, 7j/7': 'Antwort innerhalb von 24 h, 7 Tage pro Woche',
    '© {year} RoomScan. Tous droits réservés.':
      '© {year} RoomScan. Alle Rechte vorbehalten.',
    'Nouveau — Mode White-Label': 'Neu — White-Label-Modus',
    'Transformez chaque séjour en expérience 5 étoiles.':
      'Verwandeln Sie jeden Aufenthalt in ein 5-Sterne-Erlebnis.',
    'Une seule plaque QR élégante : vos invités accèdent au Wi-Fi, au guidebook et à vos services en 1 scan. Vous pilotez tout depuis un dashboard professionnel.':
      'Eine einzige elegante QR-Plakette: Ihre Gäste erreichen WLAN, Guidebook und Ihre Services mit einem Scan. Sie steuern alles über ein professionelles Dashboard.',
    "Commencer l'essai gratuit": 'Kostenlose Testphase starten',
    'Voir la démo': 'Demo ansehen',
    'Hôtes actifs': 'Aktive Gastgeber',
    'Satisfaction': 'Zufriedenheit',
    'Setup moyen': 'Ø Einrichtung',
    'La différence': 'Der Unterschied',
    "Du chaos papier à l'expérience": 'Vom Papier-Chaos zum',
    '5 étoiles': '5-Sterne-Erlebnis',
    'Vos invités ne verront que la version de droite.':
      'Ihre Gäste sehen nur die rechte Seite.',
    'Avant': 'Vorher',
    "La gestion à l'ancienne": 'Verwaltung nach alter Schule',
    'Le Wi-Fi écrit sur un post-it perdu': 'Das WLAN auf einem verlorenen Zettel',
    '20 messages « où est la clé ? »': '20 Nachrichten: „Wo ist der Schlüssel?“',
    'Un guidebook papier périmé': 'Ein veraltetes Papier-Guidebook',
    'Des avis mitigés, visibles par tous': 'Gemischte Bewertungen, für alle sichtbar',
    'Après': 'Nachher',
    'Avec RoomScan': 'Mit RoomScan',
    'Wi-Fi auto-connecté en 1 scan': 'WLAN automatisch in 1 Scan verbunden',
    'Accueil digitalisé, zéro allers-retours': 'Digitaler Empfang, null Hin und Her',
    'Guidebook toujours à jour, dans la poche': 'Guidebook immer aktuell, in der Tasche',
    'Problèmes résolus en privé, avant l’avis public':
      'Probleme privat gelöst, bevor die öffentliche Bewertung entsteht',
    'Opérationnel en': 'Einsatzbereit in',
    '3 minutes': '3 Minuten',
    "De la réception de la plaque à l'autonomie de vos invités, c'est simple comme bonjour.":
      'Vom Erhalt der Plakette bis zu unabhängigen Gästen — so einfach wie ein Hallo.',
    'Recevez votre plaque': 'Erhalten Sie Ihre Plakette',
    'Design premium en aluminium gravé, prête à poser. Livrée chez vous en 48 h.':
      'Premium-Design aus graviertem Aluminium, bereit zum Aufstellen. Lieferung binnen 48 h.',
    'Scannez pour configurer': 'Zum Konfigurieren scannen',
    'Wizard guidé : Wi-Fi, guidebook, règles, PIN. 2 minutes chrono, sans compétence technique.':
      'Geführter Wizard: WLAN, Guidebook, Hausregeln, PIN. 2 Minuten chrono, ganz ohne Technikkenntnisse.',
    'Vos invités sont autonomes': 'Ihre Gäste sind für sich',
    "Ils scannent, commandent, s'informent. Vous pilotez tout à distance, depuis votre dashboard.":
      'Sie scannen, bestellen, informieren sich. Sie steuern alles aus der Ferne — über Ihr Dashboard.',
    'Zéro application à installer — tout fonctionne dans le navigateur':
      'Keine App-Installation — alles läuft im Browser',
    'Tout votre tableau de bord,': 'Ihr gesamtes Dashboard,',
    'une seule plaque': 'eine einzige Plakette',
    'Une plateforme complète pour gérer vos locations courte durée comme un pro.':
      'Eine komplette Plattform, um Ihre Ferienvermietungen wie ein Profi zu verwalten.',
    'Cœur du produit': 'Kern des Produkts',
    'Dashboard multi-propriétés': 'Multi-Property-Dashboard',
    'Pilotez villas, studios et appartements depuis un seul écran : séjours, services, équipe et revenus — en temps réel.':
      'Steuern Sie Villen, Studios und Apartments über einen einzigen Bildschirm: Aufenthalte, Services, Team und Umsätze — in Echtzeit.',
    'Upselling automatisé': 'Automatisiertes Upselling',
    'Vendez petit-déjeuner, transfert ou late check-out directement depuis le hub. Revenus passifs, zéro effort.':
      'Verkaufen Sie Frühstück, Transfers oder Late Check-out direkt über den Hub. Passives Einkommen, null Aufwand.',
    'Petit-déjeuner · +12 €': 'Frühstück · +12 €',
    'Transfert gare · +29 €': 'Bahnhofstransfer · +29 €',
    'Late check-out · +45 €': 'Late Check-out · +45 €',
    '≈ +340 € / mois': '≈ +340 € / Monat',
    'Anti-mauvais avis': 'Schutz vor schlechten Bewertungen',
    "Un souci ? L'invité le signale en privé depuis le hub. Vous résolvez avant que l'avis public n'existe.":
      'Ein Problem? Der Gast meldet es privat über den Hub. Sie lösen es, bevor eine öffentliche Bewertung entsteht.',
    'Signalement privé': 'Private Meldung',
    'Résolution express': 'Express-Lösung',
    '★★★★★ préservée': '★★★★★ bewahrt',
    'Votre logo, vos couleurs, votre domaine. Vos invités ne voient que votre marque.':
      'Ihr Logo, Ihre Farben, Ihre Domain. Ihre Gäste sehen nur Ihre Marke.',
    'Équipe': 'Team',
    'Ménage, maintenance, co-hôtes : rôles et permissions granulaires.':
      'Reinigung, Wartung, Co-Hosts: granulare Rollen und Berechtigungen.',
    'Scans, revenus et engagement de vos invités en temps réel.':
      'Scans, Umsätze und Gästebindung in Echtzeit.',
    'Simple. Transparent.': 'Einfach. Transparent.',
    'Sans surprise.': 'Ohne Überraschungen.',
    "Choisissez l'offre adaptée à votre activité. 14 jours d'essai, sans engagement.":
      'Wählen Sie das passende Angebot für Ihre Tätigkeit. 14 Tage Testphase, ohne Bindung.',
    '1 logement': '1 Unterkunft',
    'Pour les hôtes avec un seul logement.': 'Für Gastgeber mit einer einzigen Unterkunft.',
    '/ mois': '/ Monat',
    '1 Plaque QR Hub': '1 Hub-QR-Plakette',
    'Wi-Fi & guidebook illimités': 'Unbegrenztes WLAN & Guidebook',
    'Module upselling de base': 'Basis-Upselling-Modul',
    'Support par email': 'Support per E-Mail',
    'Analytics essentiels': 'Wesentliche Analysen',
    "Commencer l'essai": 'Testphase starten',
    'Populaire': 'Beliebt',
    'Pour les conciergeries et multi-hôtes.': 'Für Property-Manager und Multi-Hosts.',
    '/ an': '/ Jahr',
    'Jusqu’à 3 logements inclus': 'Bis zu 3 Unterkünfte inklusive',
    'Équipe multi-rôles (ménage, maintenance)':
      'Team mit mehreren Rollen (Reinigung, Wartung)',
    'White-label complet': 'Vollständiges White-Label',
    'Analytics avancés multi-biens': 'Erweiterte Multi-Property-Analysen',
    'Support prioritaire 24/7': 'Prioritäts-Support 24/7',
    'API & Webhooks': 'API & Webhooks',
    'Passer à Pro': 'Zu Pro wechseln',
    'Au-delà de 3 logements,': 'Über 3 Unterkünfte hinaus',
    'contactez-nous': 'kontaktieren Sie uns',
    'pour un devis sur mesure.': 'für ein maßgeschneidertes Angebot.',
    "Prêt à offrir l'expérience": 'Bereit für das',
    'Rejoignez les 500+ hôtes qui automatisent déjà leur conciergerie.':
      'Schließen Sie sich den 500+ Gastgebern an, die ihre Verwaltung bereits automatisieren.',
    'Sans engagement · Installé en 5 minutes': 'Ohne Bindung · In 5 Minuten eingerichtet',
    'L’invité scanne': 'Der Gast scannt',
    'L’invité scanne la plaque et accède instantanément au Hub digital.':
      'Der Gast scannt die Plakette und öffnet sofort den digitalen Hub.',
    'L’expérience Guest': 'Das Gast-Erlebnis',
    'L’invité commande un service en 1 clic — l’hôte est notifié en temps réel.':
      'Der Gast bestellt einen Service mit einem Klick — der Gastgeber wird in Echtzeit benachrichtigt.',
    'Le Dashboard Hôte': 'Das Gastgeber-Dashboard',
    'Vous pilotez tout depuis votre dashboard : séjours, services et équipes.':
      'Sie steuern alles über Ihr Dashboard: Aufenthalte, Services und Teams.',
    'Scannez-moi': 'Scannen Sie mich',
    '✓ Hub ouvert': '✓ Hub geöffnet',
    '✓ Commande transmise à l’hôte': '✓ Bestellung an den Gastgeber übermittelt',
    'Étape précédente': 'Vorheriger Schritt',
    'Étape suivante': 'Nächster Schritt',
    'Étape {n}': 'Schritt {n}',
    'Mettre la démo en pause': 'Demo pausieren',
    'Reprendre la démo': 'Demo fortsetzen',
    'Pause': 'Pause',
    'Lecture': 'Abspielen',
    'Étapes de la démo': 'Demo-Schritte',
    'Lancement': 'Start',
    'Rejoignez les premiers hôtes RoomScan':
      'Werden Sie einer der ersten RoomScan-Gastgeber',
    "RoomScan vient d'ouvrir. Les premiers avis hôtes arrivent dès les premiers séjours — soyez parmi ceux qui les écriront.":
      'RoomScan ist gerade gestartet. Die ersten Gastgeberbewertungen folgen mit den ersten Aufenthalten — gehören Sie zu denen, die sie schreiben.',
    'Tarif fondateur garanti à vie': 'Founder-Tarif, garantiert für immer',
    "Votre tarif d'inscription est verrouillé pour toujours — même quand de nouvelles fonctionnalités arrivent.":
      'Ihr Einstiegspreis bleibt für immer eingefroren — auch wenn neue Funktionen erscheinen.',
    'Accompagnement premium dédié': 'Dediziertes Premium-Onboarding',
    'Notre équipe configure vos hubs avec vous, de la plaque au guidebook. Réponse sous 24 h, 7j/7.':
      'Unser Team richtet Ihre Hubs gemeinsam mit Ihnen ein, von der Plakette bis zum Guidebook. Antwort innerhalb von 24 h, 7 Tage pro Woche.',
    'Votre voix compte': 'Ihre Stimme zählt',
    'Les prochaines fonctionnalités sont votées par les premiers hôtes. Façonnez RoomScan avec nous.':
      'Kommende Funktionen werden von den ersten Gastgebern abgestimmt. Gestalten Sie RoomScan mit uns.',
    'Devenir hôte fondateur': 'Founder-Gastgeber werden',
    "Places limitées à la première vague d'hôtes — sans engagement.":
      'Begrenzt auf die erste Welle von Gastgebern — ohne Bindung.',
  },

  // =========================================================
  // NEDERLANDS
  // =========================================================
  nl: {
    'Fonctionnalités': 'Functies',
    'Comment ça marche': 'Hoe het werkt',
    'Tarifs': 'Prijzen',
    'Contact': 'Contact',
    'Connexion': 'Inloggen',
    'Essai gratuit': 'Gratis proberen',
    'RoomScan — retour en haut': 'RoomScan — terug naar boven',
    'Fermer le menu': 'Menu sluiten',
    'Ouvrir le menu': 'Menu openen',
    'Choisir la langue': 'Taal kiezen',
    'La magie en 1 scan': 'Magie in 1 scan',
    'Voyez le Hub': 'Zie de Hub',
    'en action': 'in actie',
    "Observez comment l'expérience bascule fluidement entre le mode Invité (commande de services) et le mode Hôte (dashboard de gestion), le tout sans installer d'application.":
      'Zie hoe de ervaring soepel wisselt tussen Gastmodus (diensten bestellen) en Hostmodus (beheerdashboard), alles zonder een app te installeren.',
    'Démo en cours de lecture…': 'Demo speelt af…',
    'La plateforme tout-en-un pour les hôtes Airbnb et conciergeries professionnelles.':
      'Het alles-in-één platform voor Airbnb-hosts en professionele verhuurmanagers.',
    'Produit': 'Product',
    'Vos espaces': 'Uw ruimtes',
    'Espace Hôte': 'Hostgedeelte',
    'États des Lieux': 'Opleverinspectie',
    'Console Superadmin': 'Superadmin-console',
    'Démo interactive': 'Interactieve demo',
    'Avantages fondateurs': 'Founder-voordelen',
    'Légal': 'Juridisch',
    'Mentions légales': 'Wettelijke informatie',
    'CGU': 'Algemene voorwaarden',
    'Confidentialité': 'Privacy',
    'Réponse sous 24 h, 7j/7': 'Antwoord binnen 24 uur, 7 dagen per week',
    '© {year} RoomScan. Tous droits réservés.':
      '© {year} RoomScan. Alle rechten voorbehouden.',
    'Nouveau — Mode White-Label': 'Nieuw — White-Label-modus',
    'Transformez chaque séjour en expérience 5 étoiles.':
      'Verander elk verblijf in een 5-sterrenervaring.',
    'Une seule plaque QR élégante : vos invités accèdent au Wi-Fi, au guidebook et à vos services en 1 scan. Vous pilotez tout depuis un dashboard professionnel.':
      'Eén elegante QR-plaquette: uw gasten hebben met 1 scan toegang tot wifi, de guidebook en uw diensten. U stuurt alles aan vanaf een professioneel dashboard.',
    "Commencer l'essai gratuit": 'Start uw gratis proefperiode',
    'Voir la démo': 'Bekijk de demo',
    'Hôtes actifs': 'Actieve hosts',
    'Satisfaction': 'Tevredenheid',
    'Setup moyen': 'Gemiddelde setup',
    'La différence': 'Het verschil',
    "Du chaos papier à l'expérience": 'Van papieren chaos naar een',
    '5 étoiles': '5-sterrenervaring',
    'Vos invités ne verront que la version de droite.':
      'Uw gasten zien alleen de versie aan de rechterkant.',
    'Avant': 'Voor',
    "La gestion à l'ancienne": 'Beheer op de oude manier',
    'Le Wi-Fi écrit sur un post-it perdu': 'De wifi op een verloren geeltje',
    '20 messages « où est la clé ? »': '20 berichten: ‘waar is de sleutel?’',
    'Un guidebook papier périmé': 'Een verouderde papieren guidebook',
    'Des avis mitigés, visibles par tous': 'Gemengde reviews, zichtbaar voor iedereen',
    'Après': 'Na',
    'Avec RoomScan': 'Met RoomScan',
    'Wi-Fi auto-connecté en 1 scan': 'Wifi automatisch verbonden in 1 scan',
    'Accueil digitalisé, zéro allers-retours': 'Digitaal welkom, nul heen en weer',
    'Guidebook toujours à jour, dans la poche': 'Guidebook altijd up-to-date, in de broekzak',
    'Problèmes résolus en privé, avant l’avis public':
      'Problemen privé opgelost, vóór de openbare review',
    'Opérationnel en': 'Operationeel in',
    '3 minutes': '3 minuten',
    "De la réception de la plaque à l'autonomie de vos invités, c'est simple comme bonjour.":
      'Van het ontvangen van de plaquette tot zelfstandige gasten: kind kan de was doen.',
    'Recevez votre plaque': 'Ontvang uw plaquette',
    'Design premium en aluminium gravé, prête à poser. Livrée chez vous en 48 h.':
      'Premium ontwerp in gegraveerd aluminium, klaar om te plaatsen. Binnen 48 uur bij u thuis.',
    'Scannez pour configurer': 'Scan om in te stellen',
    'Wizard guidé : Wi-Fi, guidebook, règles, PIN. 2 minutes chrono, sans compétence technique.':
      'Begeleide wizard: wifi, guidebook, huisregels, PIN. 2 minuten tout court, zonder technische kennis.',
    'Vos invités sont autonomes': 'Uw gasten zijn zelfstandig',
    "Ils scannent, commandent, s'informent. Vous pilotez tout à distance, depuis votre dashboard.":
      'Ze scannen, bestellen en vinden hun weg. U stuurt alles op afstand aan, vanaf uw dashboard.',
    'Zéro application à installer — tout fonctionne dans le navigateur':
      'Nul apps te installeren — alles werkt in de browser',
    'Tout votre tableau de bord,': 'Uw volledige dashboard,',
    'une seule plaque': 'één enkele plaquette',
    'Une plateforme complète pour gérer vos locations courte durée comme un pro.':
      'Een compleet platform om uw kort verblijf als een professional te beheren.',
    'Cœur du produit': 'Kern van het product',
    'Dashboard multi-propriétés': 'Multi-property dashboard',
    'Pilotez villas, studios et appartements depuis un seul écran : séjours, services, équipe et revenus — en temps réel.':
      'Beheer villa’s, studio’s en appartementen vanaf één scherm: verblijven, diensten, team en omzet — in realtime.',
    'Upselling automatisé': 'Geautomatiseerde upselling',
    'Vendez petit-déjeuner, transfert ou late check-out directement depuis le hub. Revenus passifs, zéro effort.':
      'Verkoop ontbijt, transfers of late check-out rechtstreeks via de hub. Passief inkomen, nul moeite.',
    'Petit-déjeuner · +12 €': 'Ontbijt · +12 €',
    'Transfert gare · +29 €': 'Stationstransfer · +29 €',
    'Late check-out · +45 €': 'Late check-out · +45 €',
    '≈ +340 € / mois': '≈ +340 € / maand',
    'Anti-mauvais avis': 'Bescherming tegen slechte reviews',
    "Un souci ? L'invité le signale en privé depuis le hub. Vous résolvez avant que l'avis public n'existe.":
      'Een probleem? De gast meldt het privé via de hub. U lost het op voordat de openbare review bestaat.',
    'Signalement privé': 'Privé-melding',
    'Résolution express': 'Express-oplossing',
    '★★★★★ préservée': '★★★★★ behouden',
    'Votre logo, vos couleurs, votre domaine. Vos invités ne voient que votre marque.':
      'Uw logo, uw kleuren, uw domein. Uw gasten zien alleen uw merk.',
    'Équipe': 'Team',
    'Ménage, maintenance, co-hôtes : rôles et permissions granulaires.':
      'Schoonmaak, onderhoud, co-hosts: fijnmazige rollen en rechten.',
    'Scans, revenus et engagement de vos invités en temps réel.':
      'Scans, omzet en gastbetrokkenheid in realtime.',
    'Simple. Transparent.': 'Eenvoudig. Transparant.',
    'Sans surprise.': 'Zonder verrassingen.',
    "Choisissez l'offre adaptée à votre activité. 14 jours d'essai, sans engagement.":
      'Kies de formule die past bij uw activiteit. 14 dagen proefperiode, zonder verplichtingen.',
    '1 logement': '1 accommodatie',
    'Pour les hôtes avec un seul logement.': 'Voor hosts met één accommodatie.',
    '/ mois': '/ maand',
    '1 Plaque QR Hub': '1 Hub-QR-plaquette',
    'Wi-Fi & guidebook illimités': 'Onbeperkt wifi & guidebook',
    'Module upselling de base': 'Basis upselling-module',
    'Support par email': 'Support via e-mail',
    'Analytics essentiels': 'Essentiële analytics',
    "Commencer l'essai": 'Proefperiode starten',
    'Populaire': 'Populair',
    'Pour les conciergeries et multi-hôtes.': 'Voor verhuurmanagers en multi-hosts.',
    '/ an': '/ jaar',
    'Jusqu’à 3 logements inclus': 'Tot 3 accommodaties inbegrepen',
    'Équipe multi-rôles (ménage, maintenance)':
      'Team met meerdere rollen (schoonmaak, onderhoud)',
    'White-label complet': 'Volledig white-label',
    'Analytics avancés multi-biens': 'Geavanceerde multi-property analytics',
    'Support prioritaire 24/7': 'Prioriteitssupport 24/7',
    'API & Webhooks': 'API & Webhooks',
    'Passer à Pro': 'Upgraden naar Pro',
    'Au-delà de 3 logements,': 'Meer dan 3 accommodaties?',
    'contactez-nous': 'neem contact op',
    'pour un devis sur mesure.': 'voor een offerte op maat.',
    "Prêt à offrir l'expérience": 'Klaar voor de',
    'Rejoignez les 500+ hôtes qui automatisent déjà leur conciergerie.':
      'Sluit u aan bij de 500+ hosts die hun verhuur al automatiseren.',
    'Sans engagement · Installé en 5 minutes':
      'Zonder verplichtingen · In 5 minuten geïnstalleerd',
    'L’invité scanne': 'De gast scant',
    'L’invité scanne la plaque et accède instantanément au Hub digital.':
      'De gast scant de plaquette en opent direct de digitale Hub.',
    'L’expérience Guest': 'De gastervaring',
    'L’invité commande un service en 1 clic — l’hôte est notifié en temps réel.':
      'De gast bestelt een dienst met 1 tik — de host wordt realtime op de hoogte gebracht.',
    'Le Dashboard Hôte': 'Het hostdashboard',
    'Vous pilotez tout depuis votre dashboard : séjours, services et équipes.':
      'U stuurt alles aan vanaf uw dashboard: verblijven, diensten en teams.',
    'Scannez-moi': 'Scan mij',
    '✓ Hub ouvert': '✓ Hub geopend',
    '✓ Commande transmise à l’hôte': '✓ Bestelling naar de host verstuurd',
    'Étape précédente': 'Vorige stap',
    'Étape suivante': 'Volgende stap',
    'Étape {n}': 'Stap {n}',
    'Mettre la démo en pause': 'Demo pauzeren',
    'Reprendre la démo': 'Demo hervatten',
    'Pause': 'Pauze',
    'Lecture': 'Afspelen',
    'Étapes de la démo': 'Demostappen',
    'Lancement': 'Lancering',
    'Rejoignez les premiers hôtes RoomScan':
      'Sluit u aan bij de eerste RoomScan-hosts',
    "RoomScan vient d'ouvrir. Les premiers avis hôtes arrivent dès les premiers séjours — soyez parmi ceux qui les écriront.":
      'RoomScan is net geopend. De eerste hostreviews volgen zodra de eerste verblijven starten — wees erbij wanneer ze geschreven worden.',
    'Tarif fondateur garanti à vie': 'Founder-tarief, levenslang gegarandeerd',
    "Votre tarif d'inscription est verrouillé pour toujours — même quand de nouvelles fonctionnalités arrivent.":
      'Uw inschrijftarief blijft voor altijd vastgelegd — ook wanneer nieuwe functies verschijnen.',
    'Accompagnement premium dédié': 'Toegewijde premium-begeleiding',
    'Notre équipe configure vos hubs avec vous, de la plaque au guidebook. Réponse sous 24 h, 7j/7.':
      'Ons team richt uw hubs samen met u in, van plaquette tot guidebook. Antwoord binnen 24 uur, 7 dagen per week.',
    'Votre voix compte': 'Uw stem telt',
    'Les prochaines fonctionnalités sont votées par les premiers hôtes. Façonnez RoomScan avec nous.':
      'Aankomende functies worden gestemd door de eerste hosts. Geef RoomScan samen met ons vorm.',
    'Devenir hôte fondateur': 'Word founder-host',
    "Places limitées à la première vague d'hôtes — sans engagement.":
      'Beperkt tot de eerste golf hosts — zonder verplichtingen.',
  },

  // =========================================================
  // ITALIANO
  // =========================================================
  it: {
    'Fonctionnalités': 'Funzionalità',
    'Comment ça marche': 'Come funziona',
    'Tarifs': 'Prezzi',
    'Contact': 'Contatti',
    'Connexion': 'Accedi',
    'Essai gratuit': 'Prova gratuita',
    'RoomScan — retour en haut': 'RoomScan — torna su',
    'Fermer le menu': 'Chiudi il menu',
    'Ouvrir le menu': 'Apri il menu',
    'Choisir la langue': 'Scegli la lingua',
    'La magie en 1 scan': 'La magia in 1 scansione',
    'Voyez le Hub': 'Guarda l’Hub',
    'en action': 'in azione',
    "Observez comment l'expérience bascule fluidement entre le mode Invité (commande de services) et le mode Hôte (dashboard de gestion), le tout sans installer d'application.":
      'Osserva come l’esperienza passa con fluidità dalla modalità Ospite (ordine dei servizi) alla modalità Host (dashboard di gestione), tutto senza installare app.',
    'Démo en cours de lecture…': 'Demo in riproduzione…',
    'La plateforme tout-en-un pour les hôtes Airbnb et conciergeries professionnelles.':
      'La piattaforma tutto-in-uno per host Airbnb e conciergerie professionali.',
    'Produit': 'Prodotto',
    'Vos espaces': 'I tuoi spazi',
    'Espace Hôte': 'Spazio Host',
    'États des Lieux': 'Verbale di Consegna',
    'Démo interactive': 'Demo interattiva',
    'Avantages fondateurs': 'Vantaggi founder',
    'Légal': 'Legale',
    'Mentions légales': 'Note legali',
    'CGU': 'Termini e condizioni',
    'Confidentialité': 'Privacy',
    'Réponse sous 24 h, 7j/7': 'Risposta entro 24 h, 7 giorni su 7',
    '© {year} RoomScan. Tous droits réservés.':
      '© {year} RoomScan. Tutti i diritti riservati.',
    'Nouveau — Mode White-Label': 'Novità — Modalità White-Label',
    'Transformez chaque séjour en expérience 5 étoiles.':
      'Trasformate ogni soggiorno in un’esperienza a 5 stelle.',
    'Une seule plaque QR élégante : vos invités accèdent au Wi-Fi, au guidebook et à vos services en 1 scan. Vous pilotez tout depuis un dashboard professionnel.':
      'Una sola elegante targa QR: i vostri ospiti accedono a Wi-Fi, guidebook e servizi con 1 scansione. Voi gestite tutto da una dashboard professionale.',
    "Commencer l'essai gratuit": 'Iniziate la prova gratuita',
    'Voir la démo': 'Guarda la demo',
    'Hôtes actifs': 'Host attivi',
    'Satisfaction': 'Soddisfazione',
    'Setup moyen': 'Setup medio',
    'La différence': 'La differenza',
    "Du chaos papier à l'expérience": 'Dal caos di carta all’esperienza',
    '5 étoiles': 'da 5 stelle',
    'Vos invités ne verront que la version de droite.':
      'I vostri ospiti vedranno solo la versione di destra.',
    'Avant': 'Prima',
    "La gestion à l'ancienne": 'La gestione alla vecchia maniera',
    'Le Wi-Fi écrit sur un post-it perdu': 'Il Wi-Fi scritto su un post-it perso',
    '20 messages « où est la clé ? »': '20 messaggi: «dov’è la chiave?»',
    'Un guidebook papier périmé': 'Una guida cartacea datata',
    'Des avis mitigés, visibles par tous': 'Recensioni miste, visibili a tutti',
    'Après': 'Dopo',
    'Avec RoomScan': 'Con RoomScan',
    'Wi-Fi auto-connecté en 1 scan': 'Wi-Fi connesso automaticamente in 1 scansione',
    'Accueil digitalisé, zéro allers-retours': 'Accoglienza digitale, zero avanti-indietro',
    'Guidebook toujours à jour, dans la poche': 'Guida sempre aggiornata, in tasca',
    'Problèmes résolus en privé, avant l’avis public':
      'Problemi risolti in privato, prima della recensione pubblica',
    'Opérationnel en': 'Operativo in',
    '3 minutes': '3 minuti',
    "De la réception de la plaque à l'autonomie de vos invités, c'est simple comme bonjour.":
      'Dalla ricezione della targa all’autonomia dei vostri ospiti: semplicissimo.',
    'Recevez votre plaque': 'Ricevete la vostra targa',
    'Design premium en aluminium gravé, prête à poser. Livrée chez vous en 48 h.':
      'Design premium in alluminio inciso, pronta da installare. Consegna a domicilio in 48 h.',
    'Scannez pour configurer': 'Scansionate per configurare',
    'Wizard guidé : Wi-Fi, guidebook, règles, PIN. 2 minutes chrono, sans compétence technique.':
      'Procedura guidata: Wi-Fi, guidebook, regole, PIN. 2 minuti cronometrati, senza competenze tecniche.',
    'Vos invités sont autonomes': 'I vostri ospiti sono autonomi',
    "Ils scannent, commandent, s'informent. Vous pilotez tout à distance, depuis votre dashboard.":
      'Scansionano, ordinano, si orientano. Voi gestite tutto a distanza, dalla vostra dashboard.',
    'Zéro application à installer — tout fonctionne dans le navigateur':
      'Zero app da installare — tutto funziona nel browser',
    'Tout votre tableau de bord,': 'Tutta la vostra dashboard,',
    'une seule plaque': 'un’unica targa',
    'Une plateforme complète pour gérer vos locations courte durée comme un pro.':
      'Una piattaforma completa per gestire gli affitti a breve termine come un professionista.',
    'Cœur du produit': 'Cuore del prodotto',
    'Dashboard multi-propriétés': 'Dashboard multi-proprietà',
    'Pilotez villas, studios et appartements depuis un seul écran : séjours, services, équipe et revenus — en temps réel.':
      'Gestite ville, studio e appartamenti da un solo schermo: soggiorni, servizi, team e ricavi — in tempo reale.',
    'Upselling automatisé': 'Upselling automatizzato',
    'Vendez petit-déjeuner, transfert ou late check-out directement depuis le hub. Revenus passifs, zéro effort.':
      'Vendete colazione, transfer o late check-out direttamente dall’hub. Ricavi passivi, zero fatica.',
    'Petit-déjeuner · +12 €': 'Colazione · +12 €',
    'Transfert gare · +29 €': 'Transfer stazione · +29 €',
    'Late check-out · +45 €': 'Late check-out · +45 €',
    '≈ +340 € / mois': '≈ +340 € / mese',
    'Anti-mauvais avis': 'Scudo anti-recensioni negative',
    "Un souci ? L'invité le signale en privé depuis le hub. Vous résolvez avant que l'avis public n'existe.":
      'Un problema? L’ospite lo segnala in privato dall’hub. Voi risolvete prima che la recensione pubblica esista.',
    'Signalement privé': 'Segnalazione privata',
    'Résolution express': 'Risoluzione express',
    '★★★★★ préservée': '★★★★★ preservata',
    'Votre logo, vos couleurs, votre domaine. Vos invités ne voient que votre marque.':
      'Il vostro logo, i vostri colori, il vostro dominio. I vostri ospiti vedono solo il vostro marchio.',
    'Équipe': 'Team',
    'Ménage, maintenance, co-hôtes : rôles et permissions granulaires.':
      'Pulizie, manutenzione, co-host: ruoli e permessi granulari.',
    'Scans, revenus et engagement de vos invités en temps réel.':
      'Scansioni, ricavi e coinvolgimento degli ospiti in tempo reale.',
    'Simple. Transparent.': 'Semplice. Trasparente.',
    'Sans surprise.': 'Senza sorprese.',
    "Choisissez l'offre adaptée à votre activité. 14 jours d'essai, sans engagement.":
      'Scegliete l’offerta adatta alla vostra attività. 14 giorni di prova, senza impegno.',
    '1 logement': '1 alloggio',
    'Pour les hôtes avec un seul logement.': 'Per host con un solo alloggio.',
    '/ mois': '/ mese',
    '1 Plaque QR Hub': '1 targa QR Hub',
    'Wi-Fi & guidebook illimités': 'Wi-Fi e guidebook illimitati',
    'Module upselling de base': 'Modulo upselling base',
    'Support par email': 'Supporto via email',
    'Analytics essentiels': 'Analytics essenziali',
    "Commencer l'essai": 'Iniziate la prova',
    'Populaire': 'Popolare',
    'Pour les conciergeries et multi-hôtes.': 'Per conciergerie e multi-host.',
    '/ an': '/ anno',
    'Jusqu’à 3 logements inclus': 'Fino a 3 alloggi inclusi',
    'Équipe multi-rôles (ménage, maintenance)':
      'Team multi-ruolo (pulizie, manutenzione)',
    'White-label complet': 'White-label completo',
    'Analytics avancés multi-biens': 'Analytics avanzate multi-proprietà',
    'Support prioritaire 24/7': 'Supporto prioritario 24/7',
    'API & Webhooks': 'API e Webhooks',
    'Passer à Pro': 'Passate a Pro',
    'Au-delà de 3 logements,': 'Oltre 3 alloggi?',
    'contactez-nous': 'contattateci',
    'pour un devis sur mesure.': 'per un preventivo su misura.',
    "Prêt à offrir l'expérience": 'Pronti a regalare l’esperienza',
    'Rejoignez les 500+ hôtes qui automatisent déjà leur conciergerie.':
      'Unitevi ai 500+ host che automatizzano già la loro conciergerie.',
    'Sans engagement · Installé en 5 minutes': 'Senza impegno · Installata in 5 minuti',
    'L’invité scanne': 'L’ospite scansiona',
    'L’invité scanne la plaque et accède instantanément au Hub digital.':
      'L’ospite scansiona la targa e accede all’istante al Hub digitale.',
    'L’expérience Guest': 'L’esperienza ospite',
    'L’invité commande un service en 1 clic — l’hôte est notifié en temps réel.':
      'L’ospite ordina un servizio in 1 tocco — l’host riceve la notifica in tempo reale.',
    'Le Dashboard Hôte': 'La dashboard dell’host',
    'Vous pilotez tout depuis votre dashboard : séjours, services et équipes.':
      'Gestite tutto dalla vostra dashboard: soggiorni, servizi e team.',
    'Scannez-moi': 'Scansionami',
    '✓ Hub ouvert': '✓ Hub aperto',
    '✓ Commande transmise à l’hôte': '✓ Ordine inviato all’host',
    'Étape précédente': 'Fase precedente',
    'Étape suivante': 'Fase successiva',
    'Étape {n}': 'Fase {n}',
    'Mettre la démo en pause': 'Mettere in pausa la demo',
    'Reprendre la démo': 'Riprendere la demo',
    'Pause': 'Pausa',
    'Lecture': 'Riproduci',
    'Étapes de la démo': 'Fasi della demo',
    'Lancement': 'Lancio',
    'Rejoignez les premiers hôtes RoomScan': 'Unitevi ai primi host di RoomScan',
    "RoomScan vient d'ouvrir. Les premiers avis hôtes arrivent dès les premiers séjours — soyez parmi ceux qui les écriront.":
      'RoomScan ha appena aperto. Le prime recensioni degli host arriveranno con i primi soggiorni — siate tra chi le scriverà.',
    'Tarif fondateur garanti à vie': 'Tariffa founder garantita a vita',
    "Votre tarif d'inscription est verrouillé pour toujours — même quand de nouvelles fonctionnalités arrivent.":
      'Il prezzo di iscrizione resta bloccato per sempre — anche all’arrivo di nuove funzionalità.',
    'Accompagnement premium dédié': 'Onboarding premium dedicato',
    'Notre équipe configure vos hubs avec vous, de la plaque au guidebook. Réponse sous 24 h, 7j/7.':
      'Il nostro team configura gli hub insieme a voi, dalla targa al guidebook. Risposta entro 24 h, 7 giorni su 7.',
    'Votre voix compte': 'La vostra voce conta',
    'Les prochaines fonctionnalités sont votées par les premiers hôtes. Façonnez RoomScan avec nous.':
      'Le prossime funzionalità sono votate dai primi host. Disegnate RoomScan con noi.',
    'Devenir hôte fondateur': 'Diventate host founder',
    "Places limitées à la première vague d'hôtes — sans engagement.":
      'Posti limitati alla prima ondata di host — senza impegno.',
  },

  // =========================================================
  // PORTUGUÊS
  // =========================================================
  pt: {
    'Fonctionnalités': 'Funcionalidades',
    'Comment ça marche': 'Como funciona',
    'Tarifs': 'Preços',
    'Contact': 'Contacto',
    'Connexion': 'Iniciar sessão',
    'Essai gratuit': 'Teste grátis',
    'RoomScan — retour en haut': 'RoomScan — voltar ao topo',
    'Fermer le menu': 'Fechar o menu',
    'Ouvrir le menu': 'Abrir o menu',
    'Choisir la langue': 'Escolher o idioma',
    'La magie en 1 scan': 'A magia em 1 digitalização',
    'Voyez le Hub': 'Veja o Hub',
    'en action': 'em ação',
    "Observez comment l'expérience bascule fluidement entre le mode Invité (commande de services) et le mode Hôte (dashboard de gestion), le tout sans installer d'application.":
      'Veja como a experiência alterna com fluidez entre o modo Hóspede (encomenda de serviços) e o modo Anfitrião (dashboard de gestão), tudo sem instalar aplicações.',
    'Démo en cours de lecture…': 'Demonstração em curso…',
    'La plateforme tout-en-un pour les hôtes Airbnb et conciergeries professionnelles.':
      'A plataforma tudo-em-um para anfitriões Airbnb e conciergerias profissionais.',
    'Produit': 'Produto',
    'Vos espaces': 'Os seus espaços',
    'Espace Hôte': 'Espaço do Anfitrião',
    'États des Lieux': 'Inventário de Entrada',
    'Console Superadmin': 'Consola Superadmin',
    'Démo interactive': 'Demonstração interativa',
    'Avantages fondateurs': 'Vantagens de fundador',
    'Légal': 'Legal',
    'Mentions légales': 'Aviso legal',
    'CGU': 'Termos e condições',
    'Confidentialité': 'Privacidade',
    'Réponse sous 24 h, 7j/7': 'Resposta em 24 h, 7 dias por semana',
    '© {year} RoomScan. Tous droits réservés.':
      '© {year} RoomScan. Todos os direitos reservados.',
    'Nouveau — Mode White-Label': 'Novo — Modo White-Label',
    'Transformez chaque séjour en expérience 5 étoiles.':
      'Transforme cada estadia numa experiência 5 estrelas.',
    'Une seule plaque QR élégante : vos invités accèdent au Wi-Fi, au guidebook et à vos services en 1 scan. Vous pilotez tout depuis un dashboard professionnel.':
      'Uma única placa QR elegante: os seus hóspedes acedem ao Wi-Fi, ao guia digital e aos seus serviços em 1 digitalização. Você gere tudo a partir de um dashboard profissional.',
    "Commencer l'essai gratuit": 'Começar o teste grátis',
    'Voir la démo': 'Ver a demonstração',
    'Hôtes actifs': 'Anfitriões ativos',
    'Satisfaction': 'Satisfação',
    'Setup moyen': 'Configuração média',
    'La différence': 'A diferença',
    "Du chaos papier à l'expérience": 'Do caos de papel à experiência',
    '5 étoiles': '5 estrelas',
    'Vos invités ne verront que la version de droite.':
      'Os seus hóspedes só verão a versão da direita.',
    'Avant': 'Antes',
    "La gestion à l'ancienne": 'A gestão à moda antiga',
    'Le Wi-Fi écrit sur un post-it perdu': 'O Wi-Fi escrito num post-it perdido',
    '20 messages « où est la clé ? »': '20 mensagens: «onde está a chave?»',
    'Un guidebook papier périmé': 'Um guia de papel desatualizado',
    'Des avis mitigés, visibles par tous': 'Avaliações mistas, visíveis por todos',
    'Après': 'Depois',
    'Avec RoomScan': 'Com o RoomScan',
    'Wi-Fi auto-connecté en 1 scan': 'Wi-Fi ligado automaticamente em 1 digitalização',
    'Accueil digitalisé, zéro allers-retours': 'Boas-vindas digitais, zero idas e vindas',
    'Guidebook toujours à jour, dans la poche': 'Guia sempre atualizado, no bolso',
    'Problèmes résolus en privé, avant l’avis public':
      'Problemas resolvidos em privado, antes da avaliação pública',
    'Opérationnel en': 'Operacional em',
    '3 minutes': '3 minutos',
    "De la réception de la plaque à l'autonomie de vos invités, c'est simple comme bonjour.":
      'Da receção da placa à autonomia dos seus hóspedes: simples como um bom-dia.',
    'Recevez votre plaque': 'Receba a sua placa',
    'Design premium en aluminium gravé, prête à poser. Livrée chez vous en 48 h.':
      'Design premium em alumínio gravado, pronta a instalar. Entregue em sua casa em 48 h.',
    'Scannez pour configurer': 'Digitalize para configurar',
    'Wizard guidé : Wi-Fi, guidebook, règles, PIN. 2 minutes chrono, sans compétence technique.':
      'Assistente guiado: Wi-Fi, guia digital, regras, PIN. 2 minutos a contar, sem competências técnicas.',
    'Vos invités sont autonomes': 'Os seus hóspedes são autónomos',
    "Ils scannent, commandent, s'informent. Vous pilotez tout à distance, depuis votre dashboard.":
      'Digitalizam, encomendam, informam-se. Você gere tudo à distância, a partir do seu dashboard.',
    'Zéro application à installer — tout fonctionne dans le navigateur':
      'Zero aplicações a instalar — tudo funciona no navegador',
    'Tout votre tableau de bord,': 'Todo o seu painel de gestão,',
    'une seule plaque': 'numa única placa',
    'Une plateforme complète pour gérer vos locations courte durée comme un pro.':
      'Uma plataforma completa para gerir os seus arrendamentos de curta duração como um profissional.',
    'Cœur du produit': 'Coração do produto',
    'Dashboard multi-propriétés': 'Dashboard multi-propriedades',
    'Pilotez villas, studios et appartements depuis un seul écran : séjours, services, équipe et revenus — en temps réel.':
      'Gere villas, estúdios e apartamentos a partir de um só ecrã: estadias, serviços, equipa e receitas — em tempo real.',
    'Upselling automatisé': 'Upselling automatizado',
    'Vendez petit-déjeuner, transfert ou late check-out directement depuis le hub. Revenus passifs, zéro effort.':
      'Venda pequeno-almoço, transferes ou late check-out diretamente no hub. Receitas passivas, zero esforço.',
    'Petit-déjeuner · +12 €': 'Pequeno-almoço · +12 €',
    'Transfert gare · +29 €': 'Transfer estação · +29 €',
    'Late check-out · +45 €': 'Late check-out · +45 €',
    '≈ +340 € / mois': '≈ +340 € / mês',
    'Anti-mauvais avis': 'Escudo anti-avaliações negativas',
    "Un souci ? L'invité le signale en privé depuis le hub. Vous résolvez avant que l'avis public n'existe.":
      'Algum problema? O hóspede sinaliza em privado a partir do hub. Você resolve antes de a avaliação pública existir.',
    'Signalement privé': 'Sinalização privada',
    'Résolution express': 'Resolução express',
    '★★★★★ préservée': '★★★★★ preservada',
    'Votre logo, vos couleurs, votre domaine. Vos invités ne voient que votre marque.':
      'O seu logótipo, as suas cores, o seu domínio. Os seus hóspedes só veem a sua marca.',
    'Équipe': 'Equipa',
    'Ménage, maintenance, co-hôtes : rôles et permissions granulaires.':
      'Limpeza, manutenção, coanfitriões: funções e permissões granulares.',
    'Scans, revenus et engagement de vos invités en temps réel.':
      'Digitalizações, receitas e envolvimento dos hóspedes em tempo real.',
    'Simple. Transparent.': 'Simples. Transparente.',
    'Sans surprise.': 'Sem surpresas.',
    "Choisissez l'offre adaptée à votre activité. 14 jours d'essai, sans engagement.":
      'Escolha a oferta adaptada à sua atividade. 14 dias de teste, sem compromisso.',
    '1 logement': '1 alojamento',
    'Pour les hôtes avec un seul logement.': 'Para anfitriões com um só alojamento.',
    '/ mois': '/ mês',
    '1 Plaque QR Hub': '1 placa QR Hub',
    'Wi-Fi & guidebook illimités': 'Wi-Fi e guia digital ilimitados',
    'Module upselling de base': 'Módulo de upselling básico',
    'Support par email': 'Suporte por email',
    'Analytics essentiels': 'Análises essenciais',
    "Commencer l'essai": 'Começar o teste',
    'Populaire': 'Popular',
    'Pour les conciergeries et multi-hôtes.': 'Para conciergerias e multi-anfitriões.',
    '/ an': '/ ano',
    'Jusqu’à 3 logements inclus': 'Até 3 alojamentos incluídos',
    'Équipe multi-rôles (ménage, maintenance)':
      'Equipa multi-funções (limpeza, manutenção)',
    'White-label complet': 'White-label completo',
    'Analytics avancés multi-biens': 'Análises avançadas multi-propriedades',
    'Support prioritaire 24/7': 'Suporte prioritário 24/7',
    'API & Webhooks': 'API e Webhooks',
    'Passer à Pro': 'Passar a Pro',
    'Au-delà de 3 logements,': 'Mais de 3 alojamentos?',
    'contactez-nous': 'contacte-nos',
    'pour un devis sur mesure.': 'para um orçamento à medida.',
    "Prêt à offrir l'expérience": 'Pronto para proporcionar a experiência',
    'Rejoignez les 500+ hôtes qui automatisent déjà leur conciergerie.':
      'Junte-se aos mais de 500 anfitriões que já automatizam a sua conciergeria.',
    'Sans engagement · Installé en 5 minutes':
      'Sem compromisso · Instalado em 5 minutos',
    'L’invité scanne': 'O hóspede digitaliza',
    'L’invité scanne la plaque et accède instantanément au Hub digital.':
      'O hóspede digitaliza a placa e acede instantaneamente ao Hub digital.',
    'L’expérience Guest': 'A experiência de hóspede',
    'L’invité commande un service en 1 clic — l’hôte est notifié en temps réel.':
      'O hóspede encomenda um serviço em 1 toque — o anfitrião é notificado em tempo real.',
    'Le Dashboard Hôte': 'O dashboard do anfitrião',
    'Vous pilotez tout depuis votre dashboard : séjours, services et équipes.':
      'Você gere tudo a partir do seu dashboard: estadias, serviços e equipas.',
    'Scannez-moi': 'Digitalize-me',
    '✓ Hub ouvert': '✓ Hub aberto',
    '✓ Commande transmise à l’hôte': '✓ Encomenda enviada ao anfitrião',
    'Étape précédente': 'Etapa anterior',
    'Étape suivante': 'Etapa seguinte',
    'Étape {n}': 'Etapa {n}',
    'Mettre la démo en pause': 'Pausar a demo',
    'Reprendre la démo': 'Retomar a demo',
    'Pause': 'Pausa',
    'Lecture': 'Reproduzir',
    'Étapes de la démo': 'Etapas da demo',
    'Lancement': 'Lançamento',
    'Rejoignez les premiers hôtes RoomScan': 'Junte-se aos primeiros anfitriões RoomScan',
    "RoomScan vient d'ouvrir. Les premiers avis hôtes arrivent dès les premiers séjours — soyez parmi ceux qui les écriront.":
      'O RoomScan acaba de abrir. As primeiras avaliações dos anfitriões chegarão com as primeiras estadias — faça parte de quem as escreverá.',
    'Tarif fondateur garanti à vie': 'Tarifa de fundador garantida para sempre',
    "Votre tarif d'inscription est verrouillé pour toujours — même quand de nouvelles fonctionnalités arrivent.":
      'O preço de adesão fica bloqueado para sempre — mesmo à medida que chegam novas funcionalidades.',
    'Accompagnement premium dédié': 'Acompanhamento premium dedicado',
    'Notre équipe configure vos hubs avec vous, de la plaque au guidebook. Réponse sous 24 h, 7j/7.':
      'A nossa equipa configura os seus hubs consigo, da placa ao guia digital. Resposta em 24 h, 7 dias por semana.',
    'Votre voix compte': 'A sua voz conta',
    'Les prochaines fonctionnalités sont votées par les premiers hôtes. Façonnez RoomScan avec nous.':
      'As próximas funcionalidades são votadas pelos primeiros anfitriões. Molde o RoomScan connosco.',
    'Devenir hôte fondateur': 'Tornar-se anfitrião fundador',
    "Places limitées à la première vague d'hôtes — sans engagement.":
      'Lugares limitados à primeira vaga de anfitriões — sem compromisso.',
  },

  // =========================================================
  // العربية (RTL)
  // =========================================================
  ar: {
    'Fonctionnalités': 'المزايا',
    'Comment ça marche': 'كيف يعمل',
    'Tarifs': 'الأسعار',
    'Contact': 'اتصل بنا',
    'Connexion': 'تسجيل الدخول',
    'Essai gratuit': 'تجربة مجانية',
    'RoomScan — retour en haut': 'RoomScan — العودة إلى الأعلى',
    'Fermer le menu': 'إغلاق القائمة',
    'Ouvrir le menu': 'فتح القائمة',
    'Choisir la langue': 'اختيار اللغة',
    'La magie en 1 scan': 'السحر في مسح واحد',
    'Voyez le Hub': 'شاهد الـ Hub',
    'en action': 'أثناء العمل',
    "Observez comment l'expérience bascule fluidement entre le mode Invité (commande de services) et le mode Hôte (dashboard de gestion), le tout sans installer d'application.":
      'شاهد كيف ينتقل بسهولة بين وضع الضيف (طلب الخدمات) ووضع المضيف (لوحة الإدارة)، كل ذلك دون تثبيت أي تطبيق.',
    'Démo en cours de lecture…': 'العرض التوضيحي قيد التشغيل…',
    'La plateforme tout-en-un pour les hôtes Airbnb et conciergeries professionnelles.':
      'المنصة الشاملة للمضيفين على Airbnb وشركات الإيجار المحترفة.',
    'Produit': 'المنتج',
    'Vos espaces': 'مساحاتك',
    'Espace Hôte': 'مساحة المضيف',
    'États des Lieux': 'حالة الأماكن',
    'Console Superadmin': 'لوحة المشرف العام',
    'Démo interactive': 'عرض تفاعلي',
    'Avantages fondateurs': 'مزايا المؤسسين',
    'Légal': 'القانونية',
    'Mentions légales': 'الإشعارات القانونية',
    'CGU': 'الشروط والأحكام',
    'Confidentialité': 'الخصوصية',
    'Réponse sous 24 h, 7j/7': 'رد خلال 24 ساعة، 7 أيام في الأسبوع',
    '© {year} RoomScan. Tous droits réservés.':
      '© {year} RoomScan. جميع الحقوق محفوظة.',
    'Nouveau — Mode White-Label': 'جديد — وضع العلامة البيضاء',
    'Transformez chaque séjour en expérience 5 étoiles.':
      'حوّل كل إقامة إلى تجربة 5 نجوم.',
    'Une seule plaque QR élégante : vos invités accèdent au Wi-Fi, au guidebook et à vos services en 1 scan. Vous pilotez tout depuis un dashboard professionnel.':
      'لوحة QR واحدة أنيقة: يحصل ضيوفكم على الواي فاي والدليل الرقمي وخدماتكم بمسح واحد. تديرون كل شيء من لوحة تحكم احترافية.',
    "Commencer l'essai gratuit": 'ابدأ التجربة المجانية',
    'Voir la démo': 'شاهد العرض التوضيحي',
    'Hôtes actifs': 'مضيفون نشطون',
    'Satisfaction': 'الرضا',
    'Setup moyen': 'متوسط الإعداد',
    'La différence': 'الفرق',
    "Du chaos papier à l'expérience": 'من فوضى الورق إلى تجربة',
    '5 étoiles': '5 نجوم',
    'Vos invités ne verront que la version de droite.':
      'لن يرى ضيوفكم سوى النسخة الجديدة.',
    'Avant': 'قبل',
    "La gestion à l'ancienne": 'الإدارة بالطريقة القديمة',
    'Le Wi-Fi écrit sur un post-it perdu': 'الواي فاي مكتوب على ورقة ملاحظات ضائعة',
    '20 messages « où est la clé ? »': '20 رسالة: «أين المفتاح؟»',
    'Un guidebook papier périmé': 'دليل ورقي قديم',
    'Des avis mitigés, visibles par tous': 'تقييمات متباينة، مرئية للجميع',
    'Après': 'بعد',
    'Avec RoomScan': 'مع RoomScan',
    'Wi-Fi auto-connecté en 1 scan': 'واي فاي يتصل تلقائيًا بمسح واحد',
    'Accueil digitalisé, zéro allers-retours': 'استقبال رقمي، بلا رسائل متبادلة',
    'Guidebook toujours à jour, dans la poche': 'دليل محدث دائمًا، في الجيب',
    'Problèmes résolus en privé, avant l’avis public':
      'مشاكل تُحل على انفراد، قبل التقييم العلني',
    'Opérationnel en': 'جاهز للعمل في',
    '3 minutes': '3 دقائق',
    "De la réception de la plaque à l'autonomie de vos invités, c'est simple comme bonjour.":
      'من استلام اللوحة إلى استقلالية ضيوفكم: بسيط كتحية الصباح.',
    'Recevez votre plaque': 'استلموا لوحتكم',
    'Design premium en aluminium gravé, prête à poser. Livrée chez vous en 48 h.':
      'تصميم فاخر من الألومنيوم المحفور، جاهزة للتركيب. تُسلَّم إلى بابكم خلال 48 ساعة.',
    'Scannez pour configurer': 'امسحوا للإعداد',
    'Wizard guidé : Wi-Fi, guidebook, règles, PIN. 2 minutes chrono, sans compétence technique.':
      'معالج إرشادي: الواي فاي، الدليل، القواعد، رمز PIN. دقيقتان بالضبط، دون أي خبرة تقنية.',
    'Vos invités sont autonomes': 'ضيوفكم يصبحون مستقلين تمامًا',
    "Ils scannent, commandent, s'informent. Vous pilotez tout à distance, depuis votre dashboard.":
      'يمسحون ويطلبون ويتعرفون على كل شيء. تديرون كل شيء عن بُعد من لوحة التحكم.',
    'Zéro application à installer — tout fonctionne dans le navigateur':
      'لا حاجة لأي تطبيق — كل شيء يعمل في المتصفح',
    'Tout votre tableau de bord,': 'لوحة تحكمكم كاملة،',
    'une seule plaque': 'بلاقة واحدة',
    'Une plateforme complète pour gérer vos locations courte durée comme un pro.':
      'منصة كاملة لإدارة إيجارات الإقامات القصيرة كالمحترفين.',
    'Cœur du produit': 'قلب المنتج',
    'Dashboard multi-propriétés': 'لوحة تحكم متعددة العقارات',
    'Pilotez villas, studios et appartements depuis un seul écran : séjours, services, équipe et revenus — en temps réel.':
      'أديروا الفيلات والشقق والاستوديوهات من شاشة واحدة: الإقامات والخدمات والفريق والإيرادات — في الوقت الفعلي.',
    'Upselling automatisé': 'البيع الإضافي الآلي',
    'Vendez petit-déjeuner, transfert ou late check-out directement depuis le hub. Revenus passifs, zéro effort.':
      'بيعوا الفطور أو النقل أو تسجيل الخروج المتأخر مباشرة من الـ Hub. إيرادات إضافية دون أي جهد.',
    'Petit-déjeuner · +12 €': 'الفطور · +12 €',
    'Transfert gare · +29 €': 'نقل من المحطة · +29 €',
    'Late check-out · +45 €': 'تسجيل خروج متأخر · +45 €',
    '≈ +340 € / mois': '≈ +340 € / شهر',
    'Anti-mauvais avis': 'درع ضد التقييمات السلبية',
    "Un souci ? L'invité le signale en privé depuis le hub. Vous résolvez avant que l'avis public n'existe.":
      'هل هناك مشكلة؟ يبلّغ الضيف عنها بسرية من الـ Hub. تحلونها قبل أن يظهر أي تقييم علني.',
    'Signalement privé': 'إبلاغ سري',
    'Résolution express': 'حل فوري',
    '★★★★★ préservée': '★★★★★ محفوظة',
    'Votre logo, vos couleurs, votre domaine. Vos invités ne voient que votre marque.':
      'شعاركم وألوانكم ونطاقكم. ضيوفكم لا يرون سوى علامتكم.',
    'Équipe': 'الفريق',
    'Ménage, maintenance, co-hôtes : rôles et permissions granulaires.':
      'التنظيف والصيانة والمضيفون المشاركون: أدوار وصلاحيات دقيقة.',
    'Scans, revenus et engagement de vos invités en temps réel.':
      'المسحات والإيرادات وتفاعل الضيوف في الوقت الفعلي.',
    'Simple. Transparent.': 'بسيط. شفاف.',
    'Sans surprise.': 'بدون مفاجآت.',
    "Choisissez l'offre adaptée à votre activité. 14 jours d'essai, sans engagement.":
      'اختاروا العرض المناسب لنشاطكم. 14 يومًا من التجربة، دون أي التزام.',
    '1 logement': 'عقار واحد',
    'Pour les hôtes avec un seul logement.': 'للمضيفين الذين يملكون عقارًا واحدًا.',
    '/ mois': '/ شهر',
    '1 Plaque QR Hub': 'لوحة QR Hub واحدة',
    'Wi-Fi & guidebook illimités': 'واي فاي ودليل رقمي غير محدودين',
    'Module upselling de base': 'وحدة البيع الإضافي الأساسية',
    'Support par email': 'دعم عبر البريد الإلكتروني',
    'Analytics essentiels': 'تحليلات أساسية',
    "Commencer l'essai": 'ابدأوا التجربة',
    'Populaire': 'الأكثر شعبية',
    'Pour les conciergeries et multi-hôtes.': 'لشركات الإيجار والمضيفين المتعددين.',
    '/ an': '/ سنة',
    'Jusqu’à 3 logements inclus': 'حتى 3 عقارات مشمولة',
    'Équipe multi-rôles (ménage, maintenance)': 'فريق متعدد الأدوار (تنظيف وصيانة)',
    'White-label complet': 'علامة بيضاء كاملة',
    'Analytics avancés multi-biens': 'تحليلات متقدمة متعددة العقارات',
    'Support prioritaire 24/7': 'دعم ذو أولوية على مدار الساعة',
    'API & Webhooks': 'واجهات API وWebhooks',
    'Passer à Pro': 'الترقية إلى Pro',
    'Au-delà de 3 logements,': 'أكثر من 3 عقارات؟',
    'contactez-nous': 'تواصلوا معنا',
    'pour un devis sur mesure.': 'لعرض سعر مخصص.',
    "Prêt à offrir l'expérience": 'مستعدون لتقديم تجربة',
    'Rejoignez les 500+ hôtes qui automatisent déjà leur conciergerie.':
      'انضموا إلى أكثر من 500 مضيف يؤتمتون إدارتهم بالفعل.',
    'Sans engagement · Installé en 5 minutes': 'دون التزام · جاهز خلال 5 دقائق',
    'L’invité scanne': 'الضيف يمسح',
    'L’invité scanne la plaque et accède instantanément au Hub digital.':
      'يمسح الضيف اللوحة ويصل فورًا إلى الـ Hub الرقمي.',
    'L’expérience Guest': 'تجربة الضيف',
    'L’invité commande un service en 1 clic — l’hôte est notifié en temps réel.':
      'يطلب الضيف خدمة بلمسة واحدة — ويُخطَر المضيف في الوقت الفعلي.',
    'Le Dashboard Hôte': 'لوحة تحكم المضيف',
    'Vous pilotez tout depuis votre dashboard : séjours, services et équipes.':
      'تديرون كل شيء من لوحة التحكم: الإقامات والخدمات والفرق.',
    'Scannez-moi': 'امسحوني',
    '✓ Hub ouvert': '✓ تم فتح الـ Hub',
    '✓ Commande transmise à l’hôte': '✓ تم إرسال الطلب إلى المضيف',
    'Étape précédente': 'الخطوة السابقة',
    'Étape suivante': 'الخطوة التالية',
    'Étape {n}': 'الخطوة {n}',
    'Mettre la démo en pause': 'إيقاف العرض التوضيحي مؤقتًا',
    'Reprendre la démo': 'استئناف العرض التوضيحي',
    'Pause': 'إيقاف مؤقت',
    'Lecture': 'تشغيل',
    'Étapes de la démo': 'خطوات العرض التوضيحي',
    'Lancement': 'الإطلاق',
    'Rejoignez les premiers hôtes RoomScan': 'انضموا إلى أوائل مضيفي RoomScan',
    "RoomScan vient d'ouvrir. Les premiers avis hôtes arrivent dès les premiers séjours — soyez parmi ceux qui les écriront.":
      'افتتح RoomScan أبوابه للتو. أول تقييمات المضيفين ستصل مع أول الإقامات — كونوا ممن سيكتبونها.',
    'Tarif fondateur garanti à vie': 'سعر المؤسسين مضمون مدى الحياة',
    "Votre tarif d'inscription est verrouillé pour toujours — même quand de nouvelles fonctionnalités arrivent.":
      'سعر تسجيلكم يبقى ثابتًا إلى الأبد — حتى مع صدور ميزات جديدة.',
    'Accompagnement premium dédié': 'مرافقة متميزة مخصصة',
    'Notre équipe configure vos hubs avec vous, de la plaque au guidebook. Réponse sous 24 h, 7j/7.':
      'فريقنا يجهز hubs معكم، من اللوحة إلى الدليل الرقمي. رد خلال 24 ساعة، 7 أيام في الأسبوع.',
    'Votre voix compte': 'صوتكم مهم',
    'Les prochaines fonctionnalités sont votées par les premiers hôtes. Façonnez RoomScan avec nous.':
      'الميزات القادمة يصوّت عليها أوائل المضيفين. شكّلوا RoomScan معنا.',
    'Devenir hôte fondateur': 'انضموا كمضيف مؤسِّس',
    "Places limitées à la première vague d'hôtes — sans engagement.":
      'أماكن محدودة للدفعة الأولى من المضيفين — دون أي التزام.',
  },
};

// -------------------------------------------------------------
// Contexte React
// -------------------------------------------------------------

export interface LandingLangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /**
   * Traduit un texte FR : renvoie la traduction de la langue courante
   * si la clé existe, sinon le texte FR d'origine (fallback robuste).
   * Interpolation simple : t('… {x} …', { x: 42 }).
   */
  t: (frText: string, vars?: Record<string, string | number>) => string;
}

const LandingLangContext = createContext<LandingLangContextValue | null>(null);

function translate(
  lang: Lang,
  frText: string,
  vars?: Record<string, string | number>,
): string {
  let out = DICTIONARIES[lang]?.[frText] ?? frText;
  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      out = out.split(`{${key}}`).join(String(value));
    }
  }
  return out;
}

export function LandingLangProvider({ children }: { children: ReactNode }) {
  // useSyncExternalStore : lecture synchrone du store externe
  // (localStorage/navigator) SANS erreur d'hydratation — pendant le
  // SSR/l'hydratation React lit 'fr' (getServerSnapshot), puis re-lit
  // getSnapshot et re-rend immédiatement si l'utilisateur a mémorisé
  // une autre langue. Équivalent sans danger du « useState initializer ».
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLang = useCallback((next: Lang) => setLangGlobal(next), []);

  const t = useCallback(
    (frText: string, vars?: Record<string, string | number>) =>
      translate(lang, frText, vars),
    [lang],
  );

  const value = useMemo(
    () => ({ lang, setLang, t }),
    [lang, setLang, t],
  );

  return (
    <LandingLangContext.Provider value={value}>
      {children}
    </LandingLangContext.Provider>
  );
}

export function useLandingLang(): LandingLangContextValue {
  const ctx = useContext(LandingLangContext);
  if (!ctx) {
    throw new Error(
      'useLandingLang doit être utilisé dans un <LandingLangProvider>.',
    );
  }
  return ctx;
}
