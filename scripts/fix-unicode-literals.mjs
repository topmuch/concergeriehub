// =============================================================
// FIX BUG « TEXTE BRUT \uXXXX » — remplace les séquences d'échappement
// \uXXXX LITTÉRALES (backslash + u + 4 hex, écrites en dur dans la
// source) par les vrais caractères UTF-8.
//
// Pourquoi : JSX n'interprète PAS \uXXXX dans les nœuds texte
// (contrairement aux chaînes JS) → l'UI affichait « \uD83C\uDFA4 »
// au lieu de 🎤 (bloc « Messages vocaux » blanc dans le guidebook).
//
// Le remplacement est sémantiquement équivalent dans les chaînes JS
// ('\u00e9' === 'é') et dans les surrogate pairs (code units
// consécutifs reconstituent le glyphe). Lookbehind (?<!\\) pour ne
// JAMAIS toucher les backslashes échappés (\\u…).
// =============================================================
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const files = execSync(`rg -l -F '\\u' src/`, { cwd: process.cwd(), encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

let touched = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const out = src.replace(/(?<!\\)\\u([0-9a-fA-F]{4})/g, (_m, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  if (out !== src) {
    writeFileSync(file, out, 'utf8');
    touched++;
    console.log(`fixed: ${file}`);
  }
}
console.log(`\n${touched}/${files.length} fichiers corrigés.`);
