'use client';

import { useState } from 'react';
import { QRTCard } from './QRTCard';
import { QRTProgressBar } from './QRTProgressBar';
import { QRTButton, QRTActions } from './QRTButton';
import { QRTNumericKeypad } from './QRTNumericKeypad';

/**
 * Preview de tous les composants QRTags.
 * Usage temporaire pour validation visuelle.
 */
export function QRTPreview() {
  const [pin, setPin] = useState('');

  return (
    <div className="min-h-screen bg-[#8B5CF6] p-6">
      <div className="max-w-[520px] mx-auto flex flex-col gap-5">

        {/* Logo QRTags style */}
        <div className="flex justify-center">
          <div className="bg-white border-2 border-black rounded-[12px] px-8 py-2.5 shadow-[3px_3px_0_rgba(0,0,0,0.15)]">
            <span className="text-2xl font-black tracking-tight">
              QR <span className="text-[#6D28D9]">Domotik</span>
            </span>
          </div>
        </div>

        <h2 className="text-center text-2xl font-extrabold text-white">
          ✨ Composants QRTags
        </h2>
        <p className="text-center text-sm text-white/70">
          Fond violet #8B5CF6 — Cartes blanches — Bordures noires
        </p>

        {/* 1. Progress Bar */}
        <QRTProgressBar currentStep={2} totalSteps={5} stepTitle="VOS INFORMATIONS" progressLabel="0/5 champs remplis" />

        {/* 2. Card simple */}
        <QRTCard>
          <p className="text-sm text-gray-600">Carte simple sans header.</p>
        </QRTCard>

        {/* 3. Card avec header */}
        <QRTCard header={{ emoji: '👤', title: 'Votre compte' }} subtitle="Indispensable pour la gestion">
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-[13px] font-bold text-black block mb-1">Prénom *</label>
              <input className="w-full border-2 border-black rounded-[10px] px-4 py-3 text-sm" placeholder="Ex : Ousmane" />
            </div>
            <div>
              <label className="text-[13px] font-bold text-black block mb-1">Email *</label>
              <input className="w-full border-2 border-black rounded-[10px] px-4 py-3 text-sm" placeholder="email@example.com" />
            </div>
          </div>
        </QRTCard>

        {/* 4. Card avec header + badge */}
        <QRTCard header={{ emoji: '📶', title: 'Votre Wi-Fi', badge: 'Facultatif' }}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-[13px] font-bold text-black block mb-1">Nom du reseau</label>
              <input className="w-full border-2 border-black rounded-[10px] px-4 py-3 text-sm" placeholder="Ex : Maison_Dupont_5G" />
            </div>
            <div>
              <label className="text-[13px] font-bold text-black block mb-1">Mot de passe</label>
              <input className="w-full border-2 border-black rounded-[10px] px-4 py-3 text-sm" placeholder="••••••••" />
            </div>
          </div>
        </QRTCard>

        {/* 5. Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <QRTButton variant="secondary">← Précédent</QRTButton>
          <QRTButton>Suivant →</QRTButton>
        </div>

        {/* 6. Button disabled */}
        <QRTButton disabled>Suivant →</QRTButton>

        {/* 7. QRTActions (layout precedent/suivant) */}
        <QRTActions
          onPrevious={() => {}}
          onNext={() => {}}
          nextDisabled
        />

        {/* 8. Numeric Keypad */}
        <QRTCard header={{ emoji: '🔐', title: 'Code secret' }} subtitle="4 chiffres pour protéger l\'espace Famille">
          {pin && <p className="text-center text-sm font-bold text-[#6D28D9] mb-4">PIN saisi : {pin}</p>}
          <QRTNumericKeypad onComplete={(p) => setPin(p)} />
        </QRTCard>

        {/* 9. Carte profil (grille 3 colonnes) */}
        <p className="text-center text-xs font-bold text-white/50 uppercase mt-2">Grille de selection de profil</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border-2 border-black rounded-[12px] shadow-[4px_4px_0_rgba(0,0,0,0.08)] p-4 text-center cursor-pointer hover:scale-[1.02] transition-transform">
            <span className="text-3xl block mb-2">🏠</span>
            <p className="text-sm font-extrabold text-black">Famille</p>
            <p className="text-xs text-gray-500 mt-1">49 €/an</p>
          </div>
          <div className="bg-white border-2 border-black rounded-[12px] shadow-[4px_4px_0_rgba(0,0,0,0.08)] p-4 text-center cursor-pointer hover:scale-[1.02] transition-transform">
            <span className="text-3xl block mb-2">🏨</span>
            <p className="text-sm font-extrabold text-black">Airbnb</p>
            <p className="text-xs text-gray-500 mt-1">9,90 €/mois</p>
          </div>
          <div className="bg-white border-2 border-black rounded-[12px] shadow-[4px_4px_0_rgba(0,0,0,0.08)] p-4 text-center cursor-pointer hover:scale-[1.02] transition-transform">
            <span className="text-3xl block mb-2">🏢</span>
            <p className="text-sm font-extrabold text-black">Airbnb Pro</p>
            <p className="text-xs text-gray-500 mt-1">199 €/an</p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-white/60 font-semibold py-6">
          Propulse par <span className="font-extrabold text-white">QR Domotik</span> 🏠
        </p>
      </div>
    </div>
  );
}
