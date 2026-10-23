'use client';

// =============================================================
// ÉTAPE 1 (V4) — Pages de connexion SÉPARÉES par espace (demande
// client) : chaque dashboard a désormais SA propre porte d'entrée
// avec ses propres couleurs, au lieu du formulaire générique de la
// landing.
//
//  • hote        → Espace Hôte       (luxe sombre : rouge #c81e42 + or #ffd76a)
//  • edl         → États des Lieux   (clair pro : rouge signature #C21F26)
//  • superadmin  → Console Superadmin (bleu nuit + or #e9c47c)
//
// Le formulaire poste sur le même endpoint NextAuth credentials
// (redirect:false) puis redirige vers LE dashboard de l'espace.
// Aucun identifiant n'est pré-rempli (contrairement à la démo
// landing) : chaque porte est une vraie page produit.
// =============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import {
  KeyRound,
  ClipboardCheck,
  ShieldCheck,
  Eye,
  EyeOff,
  Loader2,
  AlertTriangle,
  ArrowLeft,
  Home,
} from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export type SpaceKey = 'hote' | 'edl' | 'superadmin';

interface SpaceTheme {
  /** Titre affiché sous le logo. */
  title: string;
  /** Sous-titre (une ligne). */
  subtitle: string;
  /** Icône badge de l'espace. */
  icon: typeof Home;
  /** Libellé du bouton de connexion. */
  cta: string;
  /** Destination après connexion réussie. */
  destination: string;
  /** Variante du logo : 'light' = wordmark blanc (fonds sombres), 'dark' = couleurs d'origine (fonds clairs). */
  logoVariant: 'dark' | 'light';
  /** Fond plein écran (dégradé propre à l'espace). */
  shellClass: string;
  /** Carte du formulaire. */
  cardClass: string;
  /** Classes du titre principal. */
  titleClass: string;
  /** Classes du sous-titre. */
  subtitleClass: string;
  /** Badge icône de l'espace. */
  badgeClass: string;
  /** Classes des labels. */
  labelClass: string;
  /** Classes de l'input (fond, bordure, focus accent) — doublons dark: OBLIGATOIRES car l'app
   *  applique .dark sur <html> : le dark:bg-input/30 du composant Input shadcn écraserait sinon
   *  les classes claires (spécificité :is(.dark *)). */
  inputClass: string;
  /** Bouton principal. */
  buttonClass: string;
  /** Lien secondaire (retour accueil). */
  backClass: string;
  /** Texte du lien retour. */
  backLabel: string;
}

const THEMES: Record<SpaceKey, SpaceTheme> = {
  hote: {
    title: 'Espace Hôte',
    subtitle: 'Pilotez vos biens, vos plaques QR et vos séjours.',
    icon: Home,
    cta: 'Se connecter à mon espace',
    destination: '/airbnb/dashboard',
    logoVariant: 'light',
    shellClass:
      'min-h-screen bg-[#12040a] bg-[radial-gradient(1200px_600px_at_15%_-10%,rgba(200,30,66,0.35),transparent_60%),radial-gradient(900px_500px_at_110%_110%,rgba(233,196,124,0.18),transparent_55%)]',
    cardClass:
      'w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8 shadow-[0_30px_80px_-30px_rgba(200,30,66,0.45)] backdrop-blur-xl',
    titleClass: 'text-2xl font-bold tracking-tight text-white',
    subtitleClass: 'mt-1 text-sm text-white/60',
    badgeClass:
      'flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#c81e42] to-[#8f1230] text-white shadow-[0_14px_34px_-12px_rgba(200,30,66,0.8)]',
    labelClass: 'text-white/80',
    inputClass:
      'min-h-[44px] border-white/15 bg-white/[0.06] text-white placeholder:text-white/35 focus-visible:border-[#ffd76a] focus-visible:ring-[#ffd76a]/25 dark:border-white/15 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-white/35 dark:focus-visible:border-[#ffd76a] dark:focus-visible:ring-[#ffd76a]/25',
    buttonClass:
      'min-h-[48px] bg-[#c81e42] text-white hover:bg-[#a81937] shadow-[0_16px_40px_-14px_rgba(200,30,66,0.9)]',
    backClass: 'text-white/60 hover:text-[#ffd76a]',
    backLabel: "Retour à l'accueil",
  },
  edl: {
    title: 'États des Lieux',
    subtitle: 'Réalisez et partagez vos états des lieux signés.',
    icon: ClipboardCheck,
    cta: 'Accéder au module',
    destination: '/inspection/dashboard',
    logoVariant: 'dark',
    shellClass:
      'min-h-screen bg-gray-50 bg-[radial-gradient(1000px_520px_at_10%_-10%,rgba(194,31,38,0.10),transparent_55%),radial-gradient(800px_460px_at_105%_105%,rgba(194,31,38,0.08),transparent_50%)]',
    cardClass:
      'w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 sm:p-8 shadow-[0_30px_80px_-40px_rgba(194,31,38,0.35)]',
    titleClass: 'text-2xl font-bold tracking-tight text-gray-900',
    subtitleClass: 'mt-1 text-sm text-gray-500',
    badgeClass:
      'flex h-14 w-14 items-center justify-center rounded-2xl bg-[#C21F26] text-white shadow-[0_14px_34px_-12px_rgba(194,31,38,0.7)]',
    labelClass: 'text-gray-700 dark:text-gray-700',
    inputClass:
      'min-h-[44px] border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus-visible:border-[#C21F26] focus-visible:ring-[#C21F26]/30 dark:border-gray-300 dark:bg-white dark:text-gray-900 dark:placeholder:text-gray-400 dark:focus-visible:border-[#C21F26] dark:focus-visible:ring-[#C21F26]/30',
    buttonClass:
      'min-h-[48px] bg-[#C21F26] text-white hover:bg-[#a81a20] shadow-[0_16px_40px_-16px_rgba(194,31,38,0.7)]',
    backClass: 'text-gray-500 hover:text-[#C21F26]',
    backLabel: "Retour à l'accueil",
  },
  superadmin: {
    title: 'Console Superadmin',
    subtitle: 'Accès restreint — pilotage de la plateforme.',
    icon: ShieldCheck,
    cta: 'Ouvrir la console',
    destination: '/admin/dashboard',
    logoVariant: 'light',
    shellClass:
      'min-h-screen bg-[#070d1a] bg-[radial-gradient(1100px_560px_at_20%_-10%,rgba(233,196,124,0.14),transparent_55%),radial-gradient(900px_520px_at_105%_110%,rgba(59,91,152,0.30),transparent_55%)]',
    cardClass:
      'w-full max-w-md rounded-3xl border border-[#e9c47c]/20 bg-[#0d1526]/90 p-6 sm:p-8 shadow-[0_30px_80px_-30px_rgba(233,196,124,0.25)] backdrop-blur-xl',
    titleClass: 'text-2xl font-bold tracking-tight text-white',
    subtitleClass: 'mt-1 text-sm text-[#8fabc2]',
    badgeClass:
      'flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e9c47c] text-[#1a1206] shadow-[0_14px_34px_-12px_rgba(233,196,124,0.6)]',
    labelClass: 'text-[#c7d2e8]',
    inputClass:
      'min-h-[44px] border-[#e9c47c]/25 bg-white/[0.05] text-white placeholder:text-white/35 focus-visible:border-[#e9c47c] focus-visible:ring-[#e9c47c]/25 dark:border-[#e9c47c]/25 dark:bg-white/[0.05] dark:text-white dark:placeholder:text-white/35 dark:focus-visible:border-[#e9c47c] dark:focus-visible:ring-[#e9c47c]/25',
    buttonClass:
      'min-h-[48px] bg-[#e9c47c] text-[#1a1206] hover:bg-[#dcb565] shadow-[0_16px_40px_-16px_rgba(233,196,124,0.6)]',
    backClass: 'text-[#8fabc2] hover:text-[#e9c47c]',
    backLabel: "Retour à l'accueil",
  },
};

export function SpaceLogin({ space }: { space: SpaceKey }) {
  const theme = THEMES[space];
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Bandeau « session expirée » (superadmin) : le layout /admin détecte
  // un cookie de session présent mais rejeté → ?expired=1 sur l'URL.
  const [expired] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('expired') === '1',
  );

  const Icon = theme.icon;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signIn('credentials', {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (result?.error) {
        setError('Identifiants incorrects ou compte sans accès à cet espace.');
        setLoading(false);
        return;
      }
      // Session posée : recharge serveur (les gardes relisent la session)
      // puis entrée directe dans LE dashboard de l'espace.
      router.push(theme.destination);
      router.refresh();
    } catch {
      setError('Erreur de connexion au serveur. Réessayez.');
      setLoading(false);
    }
  };

  return (
    <div
      className={`${theme.shellClass} flex min-h-screen flex-col items-center justify-center px-4 py-10`}
    >
      <div className='mb-6 flex flex-col items-center gap-3'>
        <BrandLogo variant={theme.logoVariant} size='lg' />
      </div>

      <section className={theme.cardClass} aria-label={`Connexion ${theme.title}`}>
        <div className='flex items-start gap-4'>
          <div className={theme.badgeClass} aria-hidden='true'>
            <Icon className='h-7 w-7' />
          </div>
          <div className='min-w-0'>
            <h1 className={theme.titleClass}>{theme.title}</h1>
            <p className={theme.subtitleClass}>{theme.subtitle}</p>
          </div>
        </div>

        {expired && (
          <div
            role='status'
            className='mt-4 flex items-start gap-2 rounded-xl border border-[#e9c47c]/30 bg-[#e9c47c]/10 px-3 py-2 text-xs text-[#e9c47c]'
          >
            <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' aria-hidden='true' />
            <span>
              Votre session a expiré. Vos données sont intactes —
              reconnectez-vous pour retrouver votre console.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className='mt-6 space-y-4' noValidate>
          <div className='space-y-1.5'>
            <Label htmlFor={`${space}-email`} className={theme.labelClass}>
              Email
            </Label>
            <Input
              id={`${space}-email`}
              type='email'
              autoComplete='email'
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder='vous@exemple.com'
              className={theme.inputClass}
              aria-describedby={error ? `${space}-error` : undefined}
            />
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor={`${space}-password`} className={theme.labelClass}>
              Mot de passe
            </Label>
            <div className='relative'>
              <Input
                id={`${space}-password`}
                type={showPassword ? 'text' : 'password'}
                autoComplete='current-password'
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder='••••••••'
                className={`${theme.inputClass} pr-11`}
              />
              <button
                type='button'
                onClick={() => setShowPassword((v) => !v)}
                className='absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 opacity-60 transition-opacity hover:opacity-100'
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? (
                  <EyeOff className='h-4 w-4' aria-hidden='true' />
                ) : (
                  <Eye className='h-4 w-4' aria-hidden='true' />
                )}
              </button>
            </div>
          </div>

          {error && (
            <p
              id={`${space}-error`}
              role='alert'
              className='flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500 dark:text-red-400'
            >
              <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' aria-hidden='true' />
              <span>{error}</span>
            </p>
          )}

          <Button
            type='submit'
            disabled={loading || !email.trim() || !password}
            className={`w-full font-semibold ${theme.buttonClass}`}
          >
            {loading ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' aria-hidden='true' />
                Connexion…
              </>
            ) : (
              <>
                <KeyRound className='mr-2 h-4 w-4' aria-hidden='true' />
                {theme.cta}
              </>
            )}
          </Button>
        </form>
      </section>

      <a
        href='/'
        className={`mt-6 inline-flex min-h-[44px] items-center gap-1.5 text-sm transition-colors ${theme.backClass}`}
      >
        <ArrowLeft className='h-4 w-4' aria-hidden='true' />
        {theme.backLabel}
      </a>
    </div>
  );
}
