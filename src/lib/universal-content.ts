// =============================================================
// universal-content — CONTENU UNIVERSEL PLATEFORME (v4.48)
// -------------------------------------------------------------
// Demande client : « les guides des appareils — comment remplir ces
// guides pour que ça apparaisse pour tout le monde » + « créer un
// guidebook universel pour toutes les maisons ».
//
// → Un CONTENU DE RÉFÉRENCE partagé par toutes les maisons :
//   1. 📖 Guidebook universel  : guide de bienvenue générique
//      (arrivée, équipements, règles, tri des déchets, départ)
//      affiché dans les hubs dont l'hôte n'a pas encore rédigé son
//      propre guidebook (fallback payload), importable en 1 clic
//      dans l'éditeur du Guidebook (Mode Hôte).
//   2. 🛠️ Pack universel d'appareils : catalogue d'appareils
//      courants avec instructions génériques — affiché comme Guide
//      des appareils dans les hubs sans appareils renseignés
//      (fallback payload), importable en 1 clic dans l'éditeur
//      Conciergerie (l'hôte retire/ajuste ce qui ne s'applique pas).
//
// Stockage : PlatformSetting (clé 'universal_content', JSON) —
// éditable par le Superadmin (/admin/content, API /api/admin/
// universal-content). Les DÉFAUTS ci-dessous s'appliquent tant que
// le Superadmin n'a rien personnalisé → le contenu apparaît pour
// « tout le monde » immédiatement, sans aucune action.
//
// Module SANS dépendance hors db : importable client (types) ET
// serveur (routes).
// =============================================================
import { db } from '@/lib/db';

/** Shape d'un appareil (identique à GuestAppliance de concierge.ts —
 *  dupliqué volontairement pour rester sans import côté client). */
export interface UniversalAppliance {
  id: string;
  name: string;
  emoji?: string;
  instructions: string;
  videoUrl?: string;
  imageUrl?: string;
}

export interface UniversalGuidebook {
  title: string;
  sections: string[];
}

export interface UniversalContent {
  guidebook: UniversalGuidebook;
  appliances: UniversalAppliance[];
}

/** 📖 Guidebook universel par défaut — écrit pour convenir à TOUTES
 *  les maisons (pas de code/prix spécifiques — les codes exacts
 *  restent dans « Accès & codes » de chaque bien). Le Superadmin peut
 *  le personnaliser depuis /admin/content. v4.48 : 9 sections. */
export const DEFAULT_UNIVERSAL_GUIDEBOOK: UniversalGuidebook = {
  title: 'Guide universel de la maison',
  sections: [
    '👋 Bienvenue !\nNous sommes ravis de vous accueillir ! Ce guide rassemble tout ce qu\'il faut savoir sur la maison : l\'arrivée, le Wi-Fi, les équipements, les règles de vie et le départ. Gardez-le sous la main pendant tout le séjour.',
    '🔑 À votre arrivée\nLes codes d\'accès exacts et les instructions pas à pas se trouvent dans les sections « Accès & codes » et « Arrivée » du Hub. En cas de difficulté, utilisez « SOS Logement » : votre hôte est prévenu immédiatement.',
    '📶 Wi-Fi & connexion\nLe réseau et le mot de passe sont dans la carte « Wi-Fi » du Hub (révélés d\'un simple clic). En cas de coupure : vérifiez les voyants de la box, redémarrez-la si besoin, et prévenez votre hôte via « SOS Logement » si le problème persiste.',
    '🏠 Les équipements\nChaque appareil de la maison (cafetière, four, lave-linge, TV, chauffage…) est expliqué en détail dans le « Guide des appareils » du Hub, avec photos, astuces et vidéos. Utilisez chaque équipement avec soin — en cas de panne ou de casse, signalez-le via « SOS Logement ».',
    '🧻 Produits de base\nUn kit de démarrage vous attend : papier toilette, savon, sacs poubelle, éponges, produit vaisselle, sel, poivre et huile. Les recharges se trouvent dans le placard sous l\'évier ou celui de la salle de bain — inutile de racheter ce qui serait entamé.',
    '🧯 Sécurité & urgences\nUrgences 24 h/24 (gratuit) : 112 (Europe), 15 (SAMU), 18 (pompiers), 17 (police). L\'extincteur et la trousse de secours se trouvent près de l\'entrée ou de la cuisine. En cas d\'absence : fermez fenêtres et portes, éteignez les appareils de cuisson.',
    '📋 Règles de vie\nPour le confort de tous : pas de fête ni de bruit fort après 22 h, pas de fumée à l\'intérieur, animaux non autorisés sauf accord écrit de l\'hôte. Respectez le voisinage comme s\'il était le vôtre.',
    '♻️ Tri des déchets\nPensez à trier : emballages/papier dans le bac jaune, verre dans la colonne prévue, restes alimentaires dans les ordures ménagères. Les sacs de rechange se trouvent sous l\'évier ou dans le placard d\'entrée.',
    '🧳 Au moment de partir\nLaissez les clés à l\'endroit indiqué par votre hôte, la vaisselle faite (ou le lave-vaisselle lancé) et les fenêtres fermées. Déconnectez vos comptes de streaming et jetez vos déchets. Un départ tardif ? Vérifiez l\'option « Départ tardif » dans le Hub. Merci et bon voyage !',
  ],
};

/** 🛠️ Pack universel d'appareils par défaut — instructions génériques
 *  valables pour l'immense majorité des équipements domestiques.
 *  v4.48 : chaque appareil embarque une photo produit universelle
 *  (/public/universal/…). L'hôte importe le pack en 1 clic puis
 *  retire/ajuste — et peut remplacer la photo par celle de SON appareil. */
export const DEFAULT_UNIVERSAL_APPLIANCES: UniversalAppliance[] = [
  {
    id: 'ua-coffee',
    name: 'Machine à café',
    emoji: '☕',
    imageUrl: '/universal/ua-coffee.jpg',
    instructions:
      '1. Remplissez le réservoir d\'eau fraîche (jusqu\'au repère MAX).\n2. Placez une dosette/capsule ou du café moulu dans le porte-filtre.\n3. Posez une tasse sous la sortie, appuyez sur le bouton de mise en marche.\n4. Après usage, videz et rincez le bac à capsules ou le porte-filtre.\nAstuce : le détartrage régulier (1×/mois) prolonge la vie de la machine.',
  },
  {
    id: 'ua-kettle',
    name: 'Bouilloire & grille-pain',
    emoji: '🫖',
    imageUrl: '/universal/ua-kettle.jpg',
    instructions:
      'Bouilloire : remplissez entre MIN et MAX, fermez le couvercle, appuyez sur l\'interrupteur — elle s\'arrête seule à ébullition.\nGrille-pain : choisissez le niveau de dorage (1 = clair, 5 = foncé), enfoncez le levier ; le bouton d\'annulation éjecte à tout moment.',
  },
  {
    id: 'ua-oven',
    name: 'Four & micro-ondes',
    emoji: '🔥',
    imageUrl: '/universal/ua-oven.jpg',
    instructions:
      'Four : tournez le sélecteur sur le mode souhaité (chaleur tournante conseillée), réglez la température, préchauffez 10 min avant d\'enfourner dans un plat compatible.\nMicro-ondes : sélectionnez la puissance puis le temps, appuyez sur Start. Jamais de métal ni de capsule fermée à l\'intérieur.',
  },
  {
    id: 'ua-hob',
    name: 'Plaque de cuisson',
    emoji: '🍳',
    imageUrl: '/universal/ua-hob.jpg',
    instructions:
      'Induction/gaz : allumez la zone choisie (bouton ou tactile +/−) et ajustez la puissance. Utilisez des plats à fond plat adaptés.\nAprès usage, éteignez complètement et laissez refroidir avant de nettoyer avec une éponge douce (pas de grattoir métallique sur le verre).',
  },
  {
    id: 'ua-dishwasher',
    name: 'Lave-vaisselle',
    emoji: '🍽️',
    imageUrl: '/universal/ua-dishwasher.jpg',
    instructions:
      '1. Rincez grossièrement la vaisselle, chargez paniers ouverts vers le centre, sans surcharger.\n2. Ajoutez une pastille dans le compartiment (rechange sous l\'évier si fournis).\n3. Choisissez le programme « Éco » ou « Normal », fermez et lancez.\n4. En fin de cycle, laissez entrouvrir la porte pour le séchage.',
  },
  {
    id: 'ua-washer',
    name: 'Lave-linge & sèche-linge',
    emoji: '🧺',
    imageUrl: '/universal/ua-washer.jpg',
    instructions:
      'Lave-linge : triez le linge (blanc/couleur), chargez à 80 % max, ajoutez la lessive dans le bac (rechange si fourni), choisissez 30–40° coton/couleurs et lancez.\nSèche-linge : videz le bac à peluches avant chaque cycle, programme « Standard » conseillé.\nLe lave-linge doit rester entrouvert entre deux lessives.',
  },
  {
    id: 'ua-tv',
    name: 'Télévision & streaming',
    emoji: '📺',
    imageUrl: '/universal/ua-tv.jpg',
    instructions:
      'Allumez avec la télécommande (bouton en haut à droite). Utilisez la touche « Source/Home » pour accéder aux applications (Netflix, YouTube…).\nConnexion Wi-Fi : le réseau et le mot de passe sont dans la carte « Wi-Fi » du Hub.\nMerci de vous déconnecter de VOS comptes de streaming avant de partir.',
  },
  {
    id: 'ua-ac',
    name: 'Chauffage & climatisation',
    emoji: '🌡️',
    imageUrl: '/universal/ua-ac.jpg',
    instructions:
      'Télécommande : bouton ON/OFF, mode « ❄️ Cool » pour climatiser ou « ☀️ Heat » pour chauffer, réglez 21–24° pour un confort optimal.\nEn cas d\'inversion saisonnière, activez/désactivez le mode « chauffage » plutôt que d\'éteindre l\'unité.\nFermez fenêtres et portes pendant le fonctionnement pour garder l\'efficacité.',
  },
  {
    id: 'ua-robot',
    name: 'Aspirateur robot',
    emoji: '🤖',
    imageUrl: '/universal/ua-robot.jpg',
    instructions:
      'Dégagez câbles et petits objets du sol, posez le robot sur sa base et appuyez sur « Clean » (ou lancez-le depuis son application).\nIl revient seul se recharger. Videz le bac à poussière après usage si besoin.\nNe le déplacez pas dans une autre pièce fermée pendant le cycle.',
  },
  {
    id: 'ua-safe',
    name: 'Coffre-fort',
    emoji: '🔐',
    imageUrl: '/universal/ua-safe.jpg',
    instructions:
      'Coffre à code : ouvrez le tiroir/porte, programmez votre code personnel (bouton « Set » ou « Reset » selon le modèle), refermez et vérifiez que le verrou a bien tourné.\nLaissez le coffre OUVERT et vide au départ. Le code exact du bien (si différent) est dans « Accès & codes » du Hub.',
  },
  {
    id: 'ua-hairdryer',
    name: 'Sèche-cheveux',
    emoji: '💨',
    imageUrl: '/universal/ua-hairdryer.jpg',
    instructions:
      'Le sèche-cheveux se trouve dans le tiroir de la salle de bain (ou l\'armoire). Vitesse et chaleur se règlent sur la poignée.\nAstuce : le bouton air froid fixe la coiffure. Débranchez-le après usage et laissez-le refroidir avant de le ranger.',
  },
  {
    id: 'ua-bbq',
    name: 'Barbecue & plancha',
    emoji: '🍖',
    imageUrl: '/universal/ua-bbq.jpg',
    instructions:
      'Barbecue à gaz : ouvrez le couvercle, ouvrez la bouteille de gaz, appuyez sur l\'allumage et préchauffez 10 min à puissance max.\nPlancha : laissez chauffer 5 min avant de déposer les aliments.\n⚠️ Utilisez-le à l\'extérieur uniquement, loin des murs et des plantes. Nettoyez la plaque encore tiède (spatule + papier absorbant).',
  },
  {
    id: 'ua-pool',
    name: 'Piscine & jacuzzi',
    emoji: '🏊',
    imageUrl: '/universal/ua-pool.jpg',
    instructions:
      'Piscine : la bâche se roule avec l\'enrouleur et se remet en place le soir pour garder l\'eau propre et chaude. Ne touchez pas au local technique (filtration gérée par l\'hôte).\nJacuzzi : vérifiez le niveau d\'eau puis lancez les jets avec le bouton « Jets ».\n⚠️ Douche avant d\'y entrer (crèmes et sables abîment l\'eau), jamais de verre près du bassin, enfants sous surveillance.',
  },
  {
    id: 'ua-gate',
    name: 'Portail & alarme',
    emoji: '🚪',
    imageUrl: '/universal/ua-gate.jpg',
    instructions:
      'Portail automatique : la télécommande (tiroir d\'entrée ou porte-clés fourni) ouvre le portail — il se referme seul après quelques instants. En cas de panne, la clé de déverrouillage manuel se trouve dans le boîtier près du portail.\nAlarme : le code (si activé) est dans « Accès & codes » du Hub — saisissez-le dans les 60 secondes après l\'entrée.\n⚠️ Ne laissez pas la télécommande dans un véhicule visible.',
  },
];

const KEY = 'universal_content';

/** Lit le contenu universel (fusion avec les défauts — tolérant). */
export async function getUniversalContent(): Promise<UniversalContent> {
  try {
    const row = await db.platformSetting.findUnique({ where: { key: KEY } });
    if (!row) {
      return {
        guidebook: { ...DEFAULT_UNIVERSAL_GUIDEBOOK },
        appliances: DEFAULT_UNIVERSAL_APPLIANCES.map((a) => ({ ...a })),
      };
    }
    const stored = JSON.parse(row.value) as Partial<UniversalContent>;
    const guidebook: UniversalGuidebook =
      stored.guidebook && typeof stored.guidebook.title === 'string'
        ? {
            title: stored.guidebook.title.slice(0, 120),
            sections: Array.isArray(stored.guidebook.sections)
              ? stored.guidebook.sections
                  .filter((s): s is string => typeof s === 'string')
                  .slice(0, 20)
              : DEFAULT_UNIVERSAL_GUIDEBOOK.sections,
          }
        : { ...DEFAULT_UNIVERSAL_GUIDEBOOK };
    const appliances: UniversalAppliance[] = Array.isArray(stored.appliances)
      ? stored.appliances
          .filter(
            (a): a is UniversalAppliance =>
              !!a &&
              typeof a === 'object' &&
              typeof (a as UniversalAppliance).name === 'string' &&
              typeof (a as UniversalAppliance).instructions === 'string',
          )
          .slice(0, 40)
      : [];
    return {
      guidebook,
      appliances: appliances.length > 0 ? appliances : DEFAULT_UNIVERSAL_APPLIANCES.map((a) => ({ ...a })),
    };
  } catch (error) {
    console.error('[universal-content] Lecture impossible, défauts utilisés:', error);
    return {
      guidebook: { ...DEFAULT_UNIVERSAL_GUIDEBOOK },
      appliances: DEFAULT_UNIVERSAL_APPLIANCES.map((a) => ({ ...a })),
    };
  }
}

/** Sauvegarde le contenu universel (validation + persist + audit par appelant). */
export async function saveUniversalContent(
  next: Partial<UniversalContent>,
  updatedBy: string,
): Promise<UniversalContent> {
  const current = await getUniversalContent();

  const guidebook: UniversalGuidebook = next.guidebook
    ? {
        title: String(next.guidebook.title ?? current.guidebook.title).trim().slice(0, 120) || current.guidebook.title,
        sections: Array.isArray(next.guidebook.sections)
          ? next.guidebook.sections
              .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
              .map((s) => s.trim().slice(0, 2000))
              .slice(0, 20)
          : current.guidebook.sections,
      }
    : current.guidebook;

  const appliances: UniversalAppliance[] = Array.isArray(next.appliances)
    ? next.appliances
        .filter(
          (a): a is UniversalAppliance =>
            !!a &&
            typeof a === 'object' &&
            typeof a.name === 'string' &&
            a.name.trim().length > 0 &&
            typeof a.instructions === 'string',
        )
        .slice(0, 40)
        .map((a, i) => ({
          id: typeof a.id === 'string' && a.id.trim() ? a.id.trim().slice(0, 60) : `ua-${i + 1}`,
          name: a.name.trim().slice(0, 80),
          emoji: typeof a.emoji === 'string' && a.emoji.trim() ? a.emoji.trim().slice(0, 4) : '🛠️',
          instructions: a.instructions.trim().slice(0, 4000) || '—',
          videoUrl: typeof a.videoUrl === 'string' && /^https?:\/\//.test(a.videoUrl.trim()) ? a.videoUrl.trim().slice(0, 500) : undefined,
          imageUrl: typeof a.imageUrl === 'string' && /^(https?:\/\/|\/|data:image\/)/.test(a.imageUrl.trim()) ? a.imageUrl.trim().slice(0, 500) : undefined,
        }))
    : current.appliances;

  const merged: UniversalContent = { guidebook, appliances };
  await db.platformSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(merged), updatedBy },
    update: { value: JSON.stringify(merged), updatedBy },
  });
  return merged;
}
