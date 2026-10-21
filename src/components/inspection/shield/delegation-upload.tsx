'use client';

// =============================================================
// DÉLÉGATION ONBOARDING (TASK 39, v4.154) — APP ÉQUIPE
//
// L'équipe sur place (ménage / collab) ouvre le lien magique
// /upload/[token] et photographie, pièce par pièce puis appareil
// par appareil, les photos de référence du logement. Même
// composant de capture native que le wizard + l'app cleaner
// (ShieldPhotoCapture → caméra de l'appareil, pas de getUserMedia).
//
//   · progression X/N visible en permanence ;
//   · envoi possible UNIQUEMENT quand les N photos sont prises
//     (bibliothèque verrouillée = zéro case vide) ;
//   · succès : « Le propriétaire a été notifié. Merci. »
// =============================================================

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, RotateCcw } from 'lucide-react';
import { ShieldPhotoCapture } from '@/components/inspection/shield/shield-capture';
import type { DelegationUploadData } from '@/lib/shield-delegation';

interface Props {
  data: DelegationUploadData;
}

/** Un item photo (pièce ou équipement) : capture → aperçu → reprise. */
function PhotoItem({
  label,
  kindLabel,
  hint,
  photo,
  onPhoto,
}: {
  label: string;
  kindLabel: string;
  hint: string;
  photo: string | undefined;
  onPhoto: (photo: string | null) => void;
}) {
  const [version, setVersion] = useState(0);

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#C21F26]">{kindLabel}</p>
          <h3 className="mt-0.5 truncate text-lg font-black">{label}</h3>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${
            photo
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-gray-200 bg-gray-50 text-gray-500'
          }`}
        >
          {photo ? '✓ Validée' : 'À photographier'}
        </span>
      </div>

      {photo ? (
        <div className="mt-3">
          <img
            src={photo}
            alt={`Photo de référence — ${label}`}
            className="max-h-72 w-full rounded-2xl border border-gray-200 object-cover"
          />
          <button
            type="button"
            onClick={() => {
              onPhoto(null);
              setVersion((v) => v + 1);
            }}
            className="mt-2.5 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-gray-300 bg-white px-4 font-bold text-gray-700 transition-colors hover:bg-gray-50"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reprendre la photo
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <ShieldPhotoCapture key={version} hint={hint} onConfirmed={(p) => onPhoto(p)} />
        </div>
      )}
    </div>
  );
}

export default function DelegationUpload({ data }: Props) {
  const [zonePhotos, setZonePhotos] = useState<Record<string, string>>({});
  const [devicePhotos, setDevicePhotos] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ nbPhotos: number } | null>(null);

  const total = data.zones.length + data.devices.length;
  const done = useMemo(
    () =>
      data.zones.filter((z) => zonePhotos[z.id]).length +
      data.devices.filter((d) => devicePhotos[d.id]).length,
    [data.zones, data.devices, zonePhotos, devicePhotos],
  );
  const allDone = done === total;
  const pct = Math.round((done / Math.max(total, 1)) * 100);
  const expiresLabel = data.expiresAt
    ? new Date(data.expiresAt).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  const submit = async () => {
    if (!allDone || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/delegation/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: window.location.pathname.split('/').pop() ?? '',
          zonePhotos,
          devicePhotos,
        }),
      });
      if (res.status === 410) {
        setError('Ce lien a expiré — demandez un nouveau lien au propriétaire.');
        setSubmitting(false);
        return;
      }
      if (res.status === 409) {
        setError('Les photos ont déjà été envoyées pour ce logement.');
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        setError(
          json.error === 'rate_limited'
            ? 'Trop de tentatives — réessayez dans une minute.'
            : json.message ||
                "Erreur lors de l'envoi — vérifiez les photos puis réessayez.",
        );
        setSubmitting(false);
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { nbPhotos?: number };
      setSuccess({ nbPhotos: json.nbPhotos ?? total });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('Connexion interrompue — vérifiez votre réseau puis réessayez.');
      setSubmitting(false);
    }
  };

  // ── Écran de succès ──
  if (success) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50 text-gray-900">
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-12 text-center">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 16 }}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-600 shadow-lg"
          >
            <Check className="h-10 w-10 text-white" strokeWidth={3} aria-hidden="true" />
          </motion.div>
          <h1 className="mt-6 text-2xl font-black sm:text-3xl">✅ Photos envoyées avec succès !</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            Le propriétaire a été notifié. Merci.
          </p>
          <div className="mt-6 w-full rounded-3xl border border-gray-200 bg-white p-5 text-left shadow-sm">
            <p className="text-sm leading-relaxed">
              <strong>{success.nbPhotos} photos</strong> reçues et sécurisées pour
              «&nbsp;{data.propertyName}&nbsp;».
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-gray-600">
              <li>✅ Hash SHA-256 généré pour chaque image.</li>
              <li>✅ Bibliothèque de référence verrouillée.</li>
              <li>✅ PDF de conformité (ONB) généré pour le propriétaire.</li>
            </ul>
            <p className="mt-3 font-mono text-xs font-bold text-gray-500">
              Référence : {data.onboardingRef}
            </p>
          </div>
          <p className="mt-6 text-xs text-gray-500">
            Vous pouvez fermer cette page — plus rien à faire de votre côté.
          </p>
        </main>
        <footer className="mt-auto border-t border-gray-200 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-xs text-gray-500">
          © RoomScan — Certificat Anti-Dégâts • Document sécurisé SHA-256
        </footer>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-gray-900">
      {/* ── Header + progression ── */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div className="mx-auto w-full max-w-2xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-sm font-black uppercase tracking-[0.18em]">
              Room<span className="text-[#C21F26]">Scan</span> — Photos de référence
            </h1>
            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#C21F26]">
              {done}/{total} photos
            </span>
          </div>
          <div
            className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-200"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <motion.div
              className="h-full rounded-full bg-[#C21F26]"
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-8">
        {/* Contexte du logement */}
        <div className="rounded-3xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-[15px] leading-relaxed">
            Vous photographiez <strong className="text-[#C21F26]">{data.propertyName}</strong>
            {data.propertyAddress ? <> — {data.propertyAddress}</> : null}
            {data.city ? <> ({data.city})</> : null}.
          </p>
          <p className="mt-2 text-sm text-gray-600">
            Prenez chaque photo depuis l&apos;entrée de la pièce, à hauteur d&apos;épaule, bien
            éclairé. {expiresLabel ? <>Lien valable jusqu&apos;au {expiresLabel}.</> : null}
          </p>
        </div>

        {/* Pièces */}
        <h2 className="mt-7 text-lg font-black">🏠 Les pièces ({data.zones.length})</h2>
        <div className="mt-3 space-y-4">
          {data.zones.map((z) => (
            <PhotoItem
              key={z.id}
              label={z.name}
              kindLabel="Pièce"
              hint="Cadrez la pièce depuis l'entrée, à hauteur d'épaule."
              photo={zonePhotos[z.id]}
              onPhoto={(p) =>
                setZonePhotos((prev) => {
                  const next = { ...prev };
                  if (p) next[z.id] = p;
                  else delete next[z.id];
                  return next;
                })
              }
            />
          ))}
        </div>

        {/* Équipements */}
        <h2 className="mt-7 text-lg font-black">📦 Les équipements ({data.devices.length})</h2>
        <div className="mt-3 space-y-4">
          {data.devices.map((d) => (
            <PhotoItem
              key={d.id}
              label={d.name}
              kindLabel="Équipement"
              hint="Cadrez l'équipement en entier, bien éclairé."
              photo={devicePhotos[d.id]}
              onPhoto={(p) =>
                setDevicePhotos((prev) => {
                  const next = { ...prev };
                  if (p) next[d.id] = p;
                  else delete next[d.id];
                  return next;
                })
              }
            />
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {/* CTA final — actif seulement quand TOUTES les photos sont prises */}
        <div className="mt-7 pb-4">
          <button
            type="button"
            disabled={!allDone || submitting}
            onClick={submit}
            className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#C21F26] px-8 text-lg font-bold text-white shadow-sm transition-all hover:bg-[#a81a20] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Envoi en cours…
              </>
            ) : (
              <>
                <Check className="h-5 w-5" aria-hidden="true" /> Envoyer les {total} photos ✓
              </>
            )}
          </button>
          {!allDone && !submitting && (
            <p className="mt-2 text-center text-xs text-gray-500">
              Il reste {total - done} photo{total - done > 1 ? 's' : ''} à prendre avant l&apos;envoi.
            </p>
          )}
        </div>
      </main>

      <footer className="mt-auto border-t border-gray-200 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-xs text-gray-500">
        © RoomScan — Certificat Anti-Dégâts • Document sécurisé SHA-256
      </footer>
    </div>
  );
}
