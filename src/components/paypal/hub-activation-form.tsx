'use client';

// =============================================================
// Formulaire d'activation post-paiement HUB (client, v5.17).
// POST /api/paypal/public-activate → compte hôte créé (ou rattaché)
// → connexion automatique (signIn credentials) → /airbnb/dashboard.
// =============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export function HubActivationForm({
  token,
  defaultEmail = '',
}: {
  token: string;
  defaultEmail?: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'creating' | 'signing'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError('Mot de passe : 8 caractères minimum, avec au moins une lettre et un chiffre.');
      return;
    }
    setPhase('creating');
    try {
      const res = await fetch('/api/paypal/public-activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, password, fullName }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "L'activation a échoué. Réessayez.");
        setPhase('idle');
        return;
      }
      // Connexion automatique avec les identifiants choisis.
      setPhase('signing');
      const login = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (login?.error) {
        // Compte créé mais connexion auto échouée → login manuel.
        router.push('/?connexion=hub');
        return;
      }
      router.push('/airbnb/dashboard');
      router.refresh();
    } catch {
      setError('Connexion impossible. Vérifiez votre réseau et réessayez.');
      setPhase('idle');
    }
  };

  const inputClass =
    'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-[15px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#055492] focus:ring-2 focus:ring-[#055492]/25';

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div>
        <label htmlFor="hub-fullname" className="mb-1.5 block text-sm font-medium text-slate-700">
          Nom complet
        </label>
        <input
          id="hub-fullname"
          type="text"
          autoComplete="name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Ex. Awa Diop"
          className={inputClass}
          maxLength={80}
        />
      </div>

      <div>
        <label htmlFor="hub-email" className="mb-1.5 block text-sm font-medium text-slate-700">
          Adresse email
        </label>
        <input
          id="hub-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@exemple.com"
          className={inputClass}
        />
        {defaultEmail && (
          <p className="mt-1 text-xs text-slate-400">
            Email de votre paiement PayPal pré-rempli — vous pouvez le modifier.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="hub-password" className="mb-1.5 block text-sm font-medium text-slate-700">
          Mot de passe
        </label>
        <div className="relative">
          <input
            id="hub-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8 caractères min., lettres + chiffres"
            className={`${inputClass} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Eye className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={phase !== 'idle'}
        className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[linear-gradient(135deg,#055492,#033a66)] py-4 font-semibold text-white shadow-[0_8px_24px_rgba(4,70,122,0.30)] transition-all hover:scale-[1.01] hover:shadow-[0_12px_32px_rgba(4,70,122,0.35)] disabled:cursor-not-allowed disabled:opacity-80 disabled:hover:scale-100"
      >
        {phase === 'idle' && 'Activer mon accès'}
        {phase === 'creating' && (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Création de votre compte…
          </>
        )}
        {phase === 'signing' && (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Ouverture de votre Hub…
          </>
        )}
      </button>

      <p className="text-center text-xs text-slate-400">
        Votre paiement PayPal est déjà confirmé — aucune nouvelle facturation ici.
      </p>
    </form>
  );
}
