'use client';

import { useState } from 'react';
import { Copy, Wifi } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { buildWifiQrString } from '@/lib/wifi-qr';

// =============================================================
// HUB PREMIUM — WifiPremiumCard (VERSION CLAIRE + SOMBRE, SANS ANIMATION)
// Module Wi-Fi du mode invité, style « carte de crédit premium » :
//   • carte blanche bordure slate, ombre douce, puce EMV dorée
//   • variante dark: fond slate-900 → teal-950 (bascule ☀️/🌙 du hub)
//   • SSID en font-serif text-2xl (slate-900 / blanc en sombre)
//   • MOT DE PASSE MASQUÉ par une feuille argentée qui se révèle
//     au clic (rendu conditionnel simple, aucune animation).
//     État révélé mémorisé en state LOCAL (revient au masque à
//     chaque visite du hub).
//   • boutons copier (réseau + mot de passe) et QR d'auto-connexion
//     conservés — même logique métier que l'ancien panneau.
// =============================================================

interface WifiCredentials {
  networkName: string;
  password: string;
  securityType: string;
}

export function WifiPremiumCard({
  wifi,
  copy,
}: {
  wifi: WifiCredentials;
  /** Callback de copie du hub (toast inclus), inchangée. */
  copy: (text: string, label: string) => Promise<void>;
}) {
  // Effet grattage : état révélé mémorisé en state local.
  const [revealed, setRevealed] = useState(false);

  return (
    <section
      aria-label="Carte Wi-Fi — identifiants du logement"
      className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white via-white to-teal-50/70 p-5 text-slate-900 shadow-[0_22px_50px_-22px_rgba(15,23,42,0.25)] sm:p-6 dark:border-white/10 dark:from-slate-900 dark:via-slate-900 dark:to-teal-950/70 dark:text-slate-100 dark:shadow-[0_22px_50px_-22px_rgba(0,0,0,0.7)]"
    >
      {/* Rangée 1 : puce EMV + logo Wi-Fi géant translucide */}
      <div className="relative flex items-start justify-between">
        <span
          aria-hidden="true"
          className="relative mt-1 block h-9 w-12 overflow-hidden rounded-lg border border-amber-700/40 bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-600 shadow-inner"
        >
          <span className="absolute inset-x-0 top-1/2 h-px bg-amber-900/30" />
          <span className="absolute inset-y-0 left-1/2 w-px bg-amber-900/30" />
        </span>
        <Wifi aria-hidden="true" className="-mr-2 -mt-2 h-20 w-20 text-slate-900 opacity-10" strokeWidth={1.5} />
      </div>

      {/* SSID — font-serif explicite */}
      <p className="relative mt-3 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">
        Réseau Wi-Fi
      </p>
      <h3 className="display-title font-serif! relative text-2xl font-bold text-slate-900 dark:text-white">{wifi.networkName}</h3>
      <p className="relative mt-1.5 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:border-white/15 dark:bg-white/10 dark:text-slate-300">
        {wifi.securityType || 'WPA2'}
      </p>

      {/* Mot de passe — zone à gratter (révélation instantanée, sans animation) */}
      <div className="relative mt-4">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">
          Mot de passe
        </p>
        <div className="relative min-h-[56px] rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5">
          {!revealed && (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              aria-label="Révéler le mot de passe Wi-Fi"
              className="absolute inset-0 z-10 flex h-full min-h-[56px] w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl"
            >
              {/* Feuille argentée : gradient gris brillant + trame de points */}
              <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-slate-400 via-slate-200 to-slate-400" />
              <span aria-hidden="true" className="texture-dots absolute inset-0 opacity-30" />
              <span className="relative z-10 inline-flex items-center gap-2 rounded-full bg-slate-900/80 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white">
                👆 Toucher pour révéler
              </span>
            </button>
          )}
          {revealed && (
            <p className="relative flex min-h-[56px] items-center justify-center break-all px-4 py-2 text-center font-mono text-lg font-semibold tracking-widest text-slate-900 sm:text-xl dark:text-white">
              {wifi.password}
            </p>
          )}
        </div>
      </div>

      {/* Actions copie (logique inchangée) */}
      <div className="relative mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void copy(wifi.networkName, 'Nom du réseau')}
          className="inline-flex h-11 min-w-[140px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors duration-300 hover:bg-slate-50 active:scale-[0.98] dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
        >
          <Copy className="h-4 w-4" aria-hidden="true" /> Copier le réseau
        </button>
        <button
          type="button"
          onClick={() => void copy(wifi.password, 'Mot de passe Wi-Fi')}
          className="inline-flex h-11 min-w-[140px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-lg transition-colors duration-300 hover:bg-slate-800 active:scale-[0.98] dark:bg-white dark:text-slate-900 dark:shadow-none dark:hover:bg-slate-200"
        >
          <Copy className="h-4 w-4" aria-hidden="true" /> Copier le mot de passe
        </button>
      </div>

      {/* QR d'auto-connexion (standard WIFI:, générateur partagé) */}
      <div className="relative mt-4 flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-white/10 dark:bg-white/5">
        <span className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <QRCodeSVG
            value={buildWifiQrString(wifi.networkName, wifi.password, wifi.securityType)}
            size={116}
            bgColor="#FFFFFF"
            fgColor="#0F172A"
            level="M"
            aria-hidden="true"
          />
        </span>
        <p className="text-center text-[11px] leading-snug text-slate-500 dark:text-slate-400">
          Scannez ce code avec l&apos;appareil photo pour rejoindre le réseau automatiquement
        </p>
      </div>
    </section>
  );
}
