'use client';

// =============================================================
// Formulaire d'activation post-paiement EDL (client).
// POST /api/edl/activate → compte créé (ou rattaché) →
// connexion automatique (signIn credentials) →
// /payment/success (v4.122 — demande client : la page post-paiement
// « Certificat Anti-Dégâts » doit s'afficher APRÈS le paiement PayPal,
// exactement comme pour Stripe ; son gros bouton rouge mène au wizard).
// =============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Check, Eye, EyeOff, Loader2 } from 'lucide-react';

export function EdlActivationForm({ token }: { token: string }) {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
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
      const res = await fetch('/api/edl/activate', {
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
        router.push('/?connexion=edl');
        return;
      }
      router.push('/payment/success'); // v4.122 — PayPal atterrit sur la page post-paiement (comme Stripe)
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
        <label htmlFor="edl-fullname" className="mb-1.5 block text-sm font-medium text-slate-700">
          Nom complet
        </label>
        <input
          id="edl-fullname"
          type="text"
          autoComplete="name"
          required
          minLength={2}
          maxLength={80}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Ex. Ousmane Diop"
          className={inputClass}
          disabled={phase !== 'idle'}
        />
      </div>

      <div>
        <label htmlFor="edl-email" className="mb-1.5 block text-sm font-medium text-slate-700">
          Adresse email
        </label>
        <input
          id="edl-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@exemple.com"
          className={inputClass}
          disabled={phase !== 'idle'}
        />
      </div>

      <div>
        <label htmlFor="edl-password" className="mb-1.5 block text-sm font-medium text-slate-700">
          Mot de passe
        </label>
        <div className="relative">
          <input
            id="edl-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8 caractères minimum, lettres + chiffres"
            className={`${inputClass} pr-11`}
            disabled={phase !== 'idle'}
            aria-describedby="edl-password-hint"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        <p id="edl-password-hint" className="mt-1.5 text-xs text-slate-500">
          8 caractères minimum, avec au moins une lettre et un chiffre.
        </p>
      </div>

      <button
        type="submit"
        disabled={phase !== 'idle'}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#055492,#033a66)] py-4 font-semibold text-white shadow-[0_8px_24px_rgba(4, 70, 122,0.30)] transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-80 disabled:hover:scale-100"
      >
        {phase === 'idle' ? (
          <>
            <Check className="h-5 w-5" aria-hidden="true" />
            Activer mon accès
          </>
        ) : (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            {phase === 'creating' ? 'Création de votre compte…' : 'Ouverture de votre espace…'}
          </>
        )}
      </button>

      <p className="text-center text-xs text-slate-500">
        Vous avez déjà un compte avec cet email ? Saisissez son mot de passe actuel : votre accès
        EDL sera rattaché à votre compte existant.
      </p>
    </form>
  );
}
