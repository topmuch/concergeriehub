// =============================================================
// scripts/pre-generate-audio.ts — v4.112 « TTS PREMIUM DENISE »
//
// PRÉ-GÉNÈRE les MP3 de référence du Hub avec la voix Microsoft
// « Denise » (fr-FR-DeniseNeural, rate -5%, pitch +0Hz — voir
// src/lib/tts-service.ts) pour que l'invité n'ait AUCUN temps de
// chargement : les fichiers sont servis en statique depuis public/.
//
// USAGE :
//   bun scripts/pre-generate-audio.ts
//
// QUAND L'EXÉCUTER :
//   • après un déploiement (ou en post-deploy Coolify) — les fichiers
//     écrits dans public/ ne survivent pas à un rebuild d'image ;
//   • manuellement après avoir changé un texte de référence ;
//   • automatiquement à la CRÉATION d'une propriété :
//     /api/airbnb/properties (POST) appelle ensurePremiumAudio()
//     fire-and-forget pour l'accueil par défaut.
//
// PRÉ-REQUIS RÉSEAU : edge-tts parle en WebSocket à
// speech.platform.bing.com (port 443). Si ce protocole est bloqué
// (sandbox, pare-feu sortant strict), le script l'affiche clairement
// et échoue SANS rien casser — le repli Web Speech API du client
// (AudioPlayer) reste fonctionnel. Sur le serveur de prod (Coolify),
// le WebSocket sortant est autorisé.
// =============================================================

import { generatePremiumAudio } from '../src/lib/tts-service';

const MESSAGES: { file: string; text: string }[] = [
  {
    file: 'hub/welcome-fr',
    text:
      'Bonjour et bienvenue ! Installez-vous confortablement, tout ce dont vous avez besoin est à portée de main. Bon séjour chez nous.',
  },
  {
    file: 'hub/checkout-eve-fr',
    text:
      'Petit rappel : demain est votre jour de départ. Pensez à rassembler vos affaires ce soir, pour un départ en toute sérénité.',
  },
  {
    file: 'hub/checkout-day-fr',
    text:
      'Bonjour ! C’est le jour du départ. Pensez à vérifier que vous n’oubliez rien, puis confirmez votre départ depuis le hub.',
  },
  {
    file: 'hub/checkout-checklist-fr',
    text:
      'Avant de partir, avez-vous vérifié la sous-pente du lit, les chargeurs sur les prises, et le coffre-fort ?',
  },
];

async function main(): Promise<void> {
  console.log('🎙️  Pré-génération des audios Denise (fr-FR-DeniseNeural, rate -5%)…');
  let ok = 0;
  let failed = 0;
  for (const msg of MESSAGES) {
    const url = await generatePremiumAudio(msg.text, msg.file, { overwrite: true });
    if (url) {
      console.log(`  ✅ ${url}`);
      ok++;
    } else {
      console.error(`  ❌ ${msg.file} — génération impossible (WebSocket bloqué ?)`);
      failed++;
    }
  }
  if (failed > 0) {
    console.error(
      `\n⚠️  ${failed}/${MESSAGES.length} fichier(s) non générés. ` +
        'Vérifiez que le WebSocket sortant wss://speech.platform.bing.com est autorisé. ' +
        'Le repli Web Speech API du lecteur AudioPlayer reste actif en attendant.',
    );
    process.exit(1);
  }
  console.log(`\n✅ ${ok}/${MESSAGES.length} audios générés dans public/audio/ (servis en statique).`);
}

main();
