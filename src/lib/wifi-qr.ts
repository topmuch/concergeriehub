// =============================================================
// FIX-16 — Génération de la chaîne QR d'auto-connexion Wi-Fi
// (standard WIFI: utilisé par iOS/Android — « WIFI:S:<ssid>;T:<WPA>;
//  P:<password>;; »). Partagé entre la page /view (guidebook) et le
// Hub invité (carte Wi-Fi) — source unique de vérité.
// =============================================================

/** Échappe les caractères spéciaux du format WIFI: (\ ; , : " '). */
function escapeWifiValue(value: string): string {
  return value.replace(/([\\;,:"'])/g, '\\$1');
}

/**
 * Construit la payload « WIFI: » scannable par l'appareil photo.
 * @param ssid      Nom du réseau (requis)
 * @param password  Mot de passe (vide → réseau ouvert T:nopass)
 * @param security  'WPA' | 'WPA2' | 'WPA3' | 'WEP' | 'nopass'… (défaut WPA)
 */
export function buildWifiQrString(ssid: string, password: string, security: string = 'WPA'): string {
  if (!password) return `WIFI:T:nopass;S:${escapeWifiValue(ssid)};;`;
  const t = security.toUpperCase().includes('WEP') ? 'WEP' : 'WPA';
  return `WIFI:T:${t};S:${escapeWifiValue(ssid)};P:${escapeWifiValue(password)};;`;
}
