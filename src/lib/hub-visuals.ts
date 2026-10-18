// =============================================================
// v4.24 « HUB RÉEL — PAGE D'ACCUEIL INVITÉ » — Visuels curated
// partagés entre le Hub QR (/hub/[slug] → hub-content.tsx) et la
// PWA invitée (guest-app → tab-home.tsx).
//
// Objectif client : « un vrai hub, pas des icônes » — chaque tuile
// de la page d'accueil invité porte une VRAIE photo au lieu d'un
// emoji. Toutes les URLs distantes sont hébergées sur le CDN OSS
// (z-cdn.chatglm.cn, stable + hotlink autorisé, CSP img-src https:)
// et ont été VÉRIFIÉES VISUELLEMENT (aucun watermark / logo / collage).
//
// Chaque usage reste progressif : si une photo échoue à charger
// (onError → display:none), l'UI retombe sur le visuel emoji
// historique — jamais de carte vide.
//
// NB : une future fonctionnalité « photos du bien par l'hôte »
// remplacera simplement ces constantes par des URLs servies du
// payload (même mécanisme que ServiceOffer.imageUrl, v4.23).
// =============================================================

/** Photo d'accueil du logement — servie en LOCAL (public/).
 *  Même image que la landing du hub + le hero « Espace Invité »
 *  (continuité visuelle assumée, cf. hero-landing.tsx / GuestView). */
export const HUB_PROPERTY_HERO = '/hub-hero-villa.jpg';

/** Photos curated des tuiles / modules de la page d'accueil invité. */
export const HUB_VISUALS = {
  /** 🔑 Accès & Codes — serrure connectée sur porte + intérieur lumineux. */
  access: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/cefde39b74ee.jpg',
  /** 📶 Wi-Fi — routeur design sur étagère (intérieur chaleureux). */
  wifi: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/5b225322c2a4.jpg',
  /** 💬 Contacter l'hôte — cloche de conciergerie dorée (5 étoiles). */
  host: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/c83a0b01aa53.jpeg',
  /** 🚨 Signaler un problème — boîte à outils ouverte (flat lay). */
  issue: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/cd397e27cbed.jpg',
  /** 📖 Guidebook — intérieur design (guide de la maison). */
  guidebook: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/0e93e11bc7b1.jpg',
  /** 🎬 Vidéo de bienvenue — suite chaleureuse, plateau d'accueil. */
  welcome: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/4c4f707615ba.jpg',
  /** 🛠️ Guide des appareils — coin café complet (machine expresso, moulin). */
  appliances: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/847be760d52f.jpg',
  /** 🧰 Kit de survie — entrée rangée : patères, parapluie, bottes. */
  survival: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/7fa7b9e830bc.jpg',
  /** ⏱️ Départ tardif — chambre lumineuse, lit frais (matin tranquille). */
  lateCheckout: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/62d89f90c6d7.jpg',
  /** 📍 Bonnes adresses — terrasse de café ombragée (planq. secret). */
  spots: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/d07f319e2629.jpg',
  /** 🥐 Commander un service — viennoiseries (fallback statique ;
   *  la TUILE utilise en priorité la photo réelle du 1er service
   *  du payload — services.find(s => s.imageUrl)?.imageUrl). */
  breakfast: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/8a94b10bd483.jpg',
  // ── v4.28 « PHOTO PLEINE CARTE » (Espace Invité du hub, Option A) ──
  /** 🆘 SOS & Urgences — bouée de sauvetage orange (symbole d'urgence). */
  sos: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/38716264acae.jpeg',
  /** ⭐ Bouclier d'avis — salon chaleureux, lumière dorée (séjour 5 étoiles). */
  review: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/dff77351f2be.jpeg',
  // ── v4.33 « SHOP THE STAY » — boutique de la maison ──
  /** 🛍️ Shop the Stay — flat lay produits maison (café, savon, lin) ;
   *  image générée servie en LOCAL (public/hub-shop.jpg), comme le hero. */
  shop: '/hub-shop.jpg',
  // ── v4.33 « SOS LOGEMENT » — alerte urgence 1 clic ──
  /** 🚨 SOS Logement — bouton d'urgence rouge sur mur d'appartement
   *  (image générée locale, distincte de la bouée « SOS & Urgences »). */
  sosHome: '/hub-sos-home.jpg',
  // ── v4.71 « TUILE CHECK-IN / CHECK-OUT » + visuels immersifs générés
  // (public/hub-visuals/, style photo premium cohérent) ──
  /** 📆 Check-in / Check-out — couloir d'hôtel au crépuscule, porte de
   *  suite chaleureuse + carte-clé sur console (image générée locale). */
  stay: '/hub-visuals/hub-stay-checkin.jpg',
  /** 🧺 Middle-Stay Care — serviettes pliées + panier de soin (spa). */
  middlestay: '/hub-visuals/hub-middlestay.jpg',
  /** 📖 Livre d'or — polaroïds + cartes postales sur liège doré. */
  memories: '/hub-visuals/hub-memories.jpg',
  /** 🚪 Départ définitif — valise prête près de la porte, lumière du matin. */
  departure: '/hub-visuals/hub-departure.jpg',
  /** 🍷 Minibar — étagère rétroéclairée, bouteilles et en-cas. */
  minibar: '/hub-visuals/hub-minibar.jpg',
  /** 🆘 Besoin d'aide / messages — cloche de conciergerie dorée le soir. */
  help: '/hub-visuals/hub-help.jpg',
  // ── v4.74 « BOUTIQUE DE SOUVENIRS » ──
  /** 🛍️ Souvenirs — étagère en bois, produits artisanaux locaux, lumière chaude. */
  souvenirs: '/hub-visuals/hub-souvenirs.jpg',
} as const;

/** v4.25 « ARRIVÉE PAS À PAS — PHOTOS RÉELLES » — photos curated
 *  des étapes du guide visuel d'arrivée (carrousel Accueil).
 *  Utilisées par le seed (backfill imageUrl des étapes démo) et
 *  comme repli déterministe côté UI. Vérifiées visuellement :
 *  villa blanche + portail, serrure à code, clés remises devant la porte. */
export const HUB_ARRIVAL_PHOTOS = {
  /** Étape 1 — la façade / le bâtiment. */
  facade: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/39d676194a7d.jpeg',
  /** Étape 2 — le portail / digicode / clavier à code. */
  gate: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/347cedc220e2.jpg',
  /** Étape 3 — la porte / les clés / la boîte à clés. */
  keys: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/862c9abc3cde.jpeg',
} as const;
