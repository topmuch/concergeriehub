'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { ArrowLeft, Printer } from 'lucide-react';
import { B2BCard } from '@/components/ui/b2b-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';

// =============================================================
// PlaquePrint — ÉTAPE 6 / H4 : fiche plaque imprimable (sticker).
//  - QR code généré côté client (qrcode → data URL) pointant
//    vers {origin}/hub/{slug}
//  - Aperçu écran + bouton "Imprimer / Enregistrer en PDF"
//    (window.print(), l'utilisateur choisit "PDF" dans la boîte
//    d'impression du navigateur)
//  - @media print : seule la zone #plaque-print-area est imprimée
//  - backHref : lien de retour (nouvelle route /airbnb/plates ;
//    défaut : ancienne route /airbnb/dashboard/plaques)
// =============================================================

interface PlaqueDetail {
  id: string;
  hubSlug: string | null;
  status: string;
  activationCode: string;
  createdAt: string;
  claimedAt: string | null;
  property: { id: string; name: string } | null;
}

export function PlaquePrint({
  params,
  backHref = '/airbnb/plates',
}: {
  params: Promise<{ id: string }>;
  /** Lien "Retour" (défaut : ancienne route dashboard/plaques). */
  backHref?: string;
}) {
  const { id } = use(params);
  const [plaque, setPlaque] = useState<PlaqueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [hubUrl, setHubUrl] = useState('');

  // ── Chargement de la plaque ──
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/airbnb/plaques/${id}`);
        if (!res.ok) throw new Error('http');
        const json = (await res.json()) as { plaque: PlaqueDetail };
        setPlaque(json.plaque);
      } catch {
        setError('Plaque introuvable ou accès refusé.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // ── Génération du QR (client uniquement : URL absolue = origin) ──
  useEffect(() => {
    if (!plaque?.hubSlug) return;
    const url = `${window.location.origin}/hub/${plaque.hubSlug}`;
    setHubUrl(url);
    void QRCode.toDataURL(url, {
      width: 640,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((dataUrl) => setQrDataUrl(dataUrl))
      .catch(() => toast.error('Impossible de générer le QR code.'));
  }, [plaque?.hubSlug]);

  // ── Rendus intermédiaires ──
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto w-full px-4 py-8 space-y-4" aria-busy="true" aria-label="Chargement de la plaque">
        <Skeleton className="h-10 w-72 rounded-xl" />
        <Skeleton className="h-[520px] max-w-sm mx-auto rounded-2xl" />
      </div>
    );
  }

  if (error || !plaque) {
    return (
      <div className="max-w-4xl mx-auto w-full px-4 py-16 flex justify-center">
        <B2BCard className="max-w-md w-full text-center">
          <p className="text-3xl" aria-hidden="true">🔒</p>
          <p className="mt-2 font-semibold text-slate-900">Plaque introuvable</p>
          <p className="text-sm text-slate-600 mt-1">{error || 'Cette plaque n\u2019existe pas ou ne vous appartient pas.'}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={backHref}>← Retour aux plaques</Link>
          </Button>
        </B2BCard>
        <Toaster position="top-center" richColors />
      </div>
    );
  }

  const isActive = plaque.status === 'active';
  const propertyName = plaque.property?.name ?? 'Votre logement';

  return (
    <div className="max-w-4xl mx-auto w-full px-4 py-8 space-y-6">
      <Toaster position="top-center" richColors />

      {/* ----- Barre d'actions (masquée à l'impression) ----- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <span aria-hidden="true">🖨️</span> Fiche plaque
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            {propertyName} · <span className="font-mono text-xs">/hub/{plaque.hubSlug ?? '—'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" asChild>
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour
            </Link>
          </Button>
          <Button
            onClick={() => window.print()}
            disabled={!qrDataUrl}
            className="bg-slate-900 hover:bg-slate-800 text-white font-semibold"
          >
            <Printer className="h-4 w-4" aria-hidden="true" /> Imprimer / Enregistrer en PDF
          </Button>
        </div>
      </div>

      {/* ----- Avertissement si plaque non active ----- */}
      {!isActive && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 print:hidden">
          ⚠️ Cette plaque est{' '}
          <strong>{plaque.status === 'lost' ? 'signalée perdue' : 'désactivée'}</strong> : le QR
          mènera les visiteurs vers un Hub indisponible. Réactivez-la depuis la liste avant de
          l&apos;imprimer.
        </div>
      )}

      {/* ----- Aperçu écran ----- */}
      <p className="text-xs text-slate-500 print:hidden">
        Aperçu (format A6, prêt pour une feuille autocollante) :
      </p>

      {/* =============================================================
          ZONE IMPRIMABLE — seule cette zone sort à l'impression
         ============================================================= */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #plaque-print-area, #plaque-print-area * { visibility: visible; }
          #plaque-print-area {
            position: fixed;
            inset: 0;
            margin: 0;
            width: 100vw;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #ffffff;
          }
          #plaque-print-card { box-shadow: none !important; border: 1px dashed #cbd5e1 !important; }
        }
      `}</style>

      <div id="plaque-print-area" className="flex justify-center">
        <div
          id="plaque-print-card"
          className="w-[340px] bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex flex-col items-center text-center"
        >
          {/* Marque */}
          <p className="text-sm font-bold text-slate-900">
            🗝️ Conciergerie <span className="text-emerald-600">Hub</span>
          </p>

          {/* Accueil */}
          <p className="mt-4 text-2xl font-extrabold text-slate-900 leading-tight">
            Bienvenue chez vous&nbsp;!
          </p>
          <p className="mt-1 text-base font-bold text-slate-800">{propertyName}</p>

          {/* QR */}
          <div className="mt-5 rounded-xl border-2 border-slate-900 p-3 bg-white">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR code du Hub ${propertyName}`}
                className="h-44 w-44 block"
              />
            ) : (
              <div className="h-44 w-44 flex items-center justify-center text-xs text-slate-400">
                Génération du QR…
              </div>
            )}
          </div>

          <p className="mt-3 text-sm font-semibold text-slate-700">
            Scannez ce QR avec l&apos;appareil photo
          </p>

          {/* Contenu du hub */}
          <p className="mt-3 text-xs text-slate-600 leading-relaxed">
            📶 Wi-Fi &nbsp;·&nbsp; 📖 Guide du logement &nbsp;·&nbsp; 🥐 Services
            <br />
            🚨 Contacter l&apos;hôte
          </p>

          {/* URL de secours */}
          <p className="mt-4 text-[11px] text-slate-400 break-all px-2">{hubUrl}</p>

          <p className="mt-3 text-[10px] uppercase tracking-widest text-slate-400">
            Propulsé par Conciergerie Hub
          </p>
        </div>
      </div>

      {/* ----- Conseils (masqués à l'impression) ----- */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 print:hidden">
        <p className="font-semibold text-slate-900">💡 Conseils d&apos;impression</p>
        <ul className="mt-1.5 list-disc list-inside space-y-1">
          <li>
            Dans la boîte d&apos;impression, choisissez <strong>« Enregistrer en PDF »</strong> ou
            imprimez directement sur une feuille autocollante A6.
          </li>
          <li>Idéal : plastifier la plaque ou la coller sous un cache sur le frigo / près de l&apos;entrée.</li>
          <li>
            Une fois la plaque posée, testez le scan avec un téléphone : le Hub doit s&apos;ouvrir
            sur le nom du logement.
          </li>
        </ul>
      </div>
    </div>
  );
}
