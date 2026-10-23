'use client';

// =============================================================
// CONTACT SECTION (v5.18 — page /contact) — demande client :
// « la page contact doit avoir un formulaire et une carte ».
//
//   • Formulaire public : nom, email, téléphone (optionnel),
//     sujet, message + consentement. POST /api/public/contact
//     (rate-limit 5/min, honeypot anti-spam) → table
//     ContactMessage + email dans l'outbox (contact@roomscan.pro).
//   • Carte : iframe OpenStreetMap (siège Paris) — frame-src
//     autorisé dans le middleware (v5.18).
//   • Colonne info : email direct, délai de réponse, espaces.
// =============================================================

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Send,
  User,
} from 'lucide-react';
import { Reveal } from '@/components/premium/reveal';
import { useLandingLang } from '@/lib/landing-i18n';

const SUBJECTS = [
  { value: 'demo', label: 'Demander une démonstration' },
  { value: 'tarifs', label: 'Tarifs & abonnements' },
  { value: 'etats-des-lieux', label: 'Module États des Lieux' },
  { value: 'partenariat', label: 'Partenariat / conciergerie' },
  { value: 'support', label: 'Support technique' },
  { value: 'autre', label: 'Autre demande' },
] as const;

type Status = 'idle' | 'sending' | 'success' | 'error';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-[#055492] focus:outline-none focus:ring-2 focus:ring-[#055492]/20';

export function ContactSection() {
  const { t } = useLandingLang();
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === 'sending') return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get('name') ?? ''),
      email: String(data.get('email') ?? ''),
      phone: String(data.get('phone') ?? ''),
      subject: String(data.get('subject') ?? ''),
      message: String(data.get('message') ?? ''),
      consent: data.get('consent') === 'on',
      website: String(data.get('website') ?? ''), // honeypot
    };

    setStatus('sending');
    setErrorMessage('');
    try {
      const res = await fetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (res.ok && json?.ok) {
        setStatus('success');
        form.reset();
        return;
      }
      setErrorMessage(
        json?.error && json.error !== 'invalid'
          ? json.error
          : t("Une erreur est survenue. Vérifiez vos champs puis réessayez."),
      );
      setStatus('error');
    } catch {
      setErrorMessage(
        t('Connexion impossible. Vérifiez votre réseau puis réessayez.'),
      );
      setStatus('error');
    }
  };

  return (
    <section className="relative px-4 pb-28 pt-6 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-5">
        {/* ── Colonne formulaire ── */}
        <Reveal className="lg:col-span-3">
          <div className="air-shadow-lg rounded-3xl border border-slate-200/80 bg-white p-6 md:p-9">
            <h2 className="display-title font-serif! mb-2 text-2xl font-bold text-slate-900">
              {t('Écrivez-nous')}
            </h2>
            <p className="mb-8 text-sm text-slate-600">
              {t(
                'Démonstration, tarifs, états des lieux ou support : nous répondons sous 24 h, 7 j/7.',
              )}
            </p>

            {status === 'success' ? (
              <div
                role="status"
                className="flex flex-col items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-10 text-center"
              >
                <CheckCircle2 className="h-12 w-12 text-emerald-600" aria-hidden="true" />
                <div>
                  <p className="text-lg font-bold text-emerald-900">
                    {t('Message envoyé !')}
                  </p>
                  <p className="mt-1 text-sm text-emerald-800">
                    {t(
                      'Merci — notre équipe vous répond sous 24 h à l’adresse indiquée.',
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStatus('idle')}
                  className="rounded-xl border border-emerald-300 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
                >
                  {t('Envoyer un autre message')}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate={false}>
                {/* Honeypot anti-spam (champ invisible aux humains) */}
                <div className="hidden" aria-hidden="true">
                  <label>
                    {t('Ne pas remplir')}
                    <input
                      type="text"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                    />
                  </label>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="contact-name"
                      className="mb-2 block text-sm font-semibold text-slate-800"
                    >
                      {t('Nom complet')} <span className="text-[#c81e42]">*</span>
                    </label>
                    <input
                      id="contact-name"
                      name="name"
                      type="text"
                      required
                      minLength={2}
                      maxLength={80}
                      autoComplete="name"
                      placeholder={t('Marie Dupont')}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="contact-email"
                      className="mb-2 block text-sm font-semibold text-slate-800"
                    >
                      {t('Email')} <span className="text-[#c81e42]">*</span>
                    </label>
                    <input
                      id="contact-email"
                      name="email"
                      type="email"
                      required
                      maxLength={120}
                      autoComplete="email"
                      placeholder="marie@exemple.com"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="contact-phone"
                      className="mb-2 block text-sm font-semibold text-slate-800"
                    >
                      {t('Téléphone (optionnel)')}
                    </label>
                    <input
                      id="contact-phone"
                      name="phone"
                      type="tel"
                      maxLength={30}
                      autoComplete="tel"
                      placeholder="+33 6 12 34 56 78"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="contact-subject"
                      className="mb-2 block text-sm font-semibold text-slate-800"
                    >
                      {t('Sujet')} <span className="text-[#c81e42]">*</span>
                    </label>
                    <select
                      id="contact-subject"
                      name="subject"
                      required
                      defaultValue="demo"
                      className={inputClass}
                    >
                      {SUBJECTS.map((subject) => (
                        <option key={subject.value} value={subject.value}>
                          {t(subject.label)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-5">
                  <label
                    htmlFor="contact-message"
                    className="mb-2 block text-sm font-semibold text-slate-800"
                  >
                    {t('Votre message')} <span className="text-[#c81e42]">*</span>
                  </label>
                  <textarea
                    id="contact-message"
                    name="message"
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={6}
                    placeholder={t(
                      'Décrivez votre besoin : nombre de biens, villes, questions…',
                    )}
                    className={`${inputClass} resize-y`}
                  />
                  <p className="mt-1.5 text-xs text-slate-400">
                    {t('10 à 2000 caractères.')}
                  </p>
                </div>

                <div className="mt-5 flex items-start gap-3">
                  <input
                    id="contact-consent"
                    name="consent"
                    type="checkbox"
                    required
                    className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-[#055492]"
                  />
                  <label htmlFor="contact-consent" className="text-xs leading-relaxed text-slate-500">
                    {t(
                      'J’accepte que mes informations soient utilisées pour traiter ma demande, conformément à la',
                    )}{' '}
                    <Link
                      href="/legal#confidentialite"
                      className="font-medium text-[#04467a] underline underline-offset-2"
                    >
                      {t('politique de confidentialité')}
                    </Link>
                    .
                  </label>
                </div>

                {status === 'error' ? (
                  <div
                    role="alert"
                    className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p>{errorMessage}</p>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={status === 'sending'}
                  className="mt-7 inline-flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[linear-gradient(135deg,#055492,#033a66)] px-8 py-4 font-semibold text-white shadow-[0_8px_24px_rgba(4,70,122,0.30)] transition-all hover:scale-[1.01] hover:shadow-[0_12px_32px_rgba(4,70,122,0.38)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 sm:w-auto"
                >
                  {status === 'sending' ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                      {t('Envoi en cours…')}
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5" aria-hidden="true" />
                      {t('Envoyer le message')}
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </Reveal>

        {/* ── Colonne infos + carte ── */}
        <Reveal delay={0.15} className="lg:col-span-2">
          <div className="flex h-full flex-col gap-6">
            {/* Infos directes */}
            <div className="rounded-3xl border border-slate-200/80 bg-white p-6">
              <h2 className="display-title font-serif! mb-5 text-xl font-bold text-slate-900">
                {t('Contact direct')}
              </h2>
              <ul className="space-y-4 text-sm">
                <li className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#055492]/10 text-[#04467a]"
                  >
                    <Mail className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">Email</p>
                    <a
                      href="mailto:contact@roomscan.pro"
                      className="text-slate-600 transition-colors hover:text-[#04467a]"
                    >
                      contact@roomscan.pro
                    </a>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#055492]/10 text-[#04467a]"
                  >
                    <Clock className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">{t('Délai de réponse')}</p>
                    <p className="text-slate-600">{t('Sous 24 h, 7 j/7')}</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#055492]/10 text-[#04467a]"
                  >
                    <User className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">{t('Vous êtes déjà client ?')}</p>
                    <Link
                      href="/?auth=login"
                      className="text-slate-600 transition-colors hover:text-[#04467a]"
                    >
                      {t('Ouvrir votre espace hôte')}
                    </Link>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#055492]/10 text-[#04467a]"
                  >
                    <MapPin className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">{t('Siège')}</p>
                    <p className="text-slate-600">Paris, France</p>
                  </div>
                </li>
              </ul>
            </div>

            {/* Carte OpenStreetMap */}
            <div className="flex-1 overflow-hidden rounded-3xl border border-slate-200/80 bg-white">
              <iframe
                title={t('Carte — siège RoomScan à Paris')}
                src="https://www.openstreetmap.org/export/embed.html?bbox=2.2587%2C48.8156%2C2.4457%2C48.9022&layer=mapnik&marker=48.8566%2C2.3522"
                className="h-72 w-full border-0 lg:h-full lg:min-h-64"
                loading="lazy"
              />
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5">
                <p className="flex items-center gap-2 text-xs text-slate-500">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('Paris, France — interventions en Europe & Afrique de l’Ouest')}
                </p>
                <a
                  href="https://www.openstreetmap.org/?mlat=48.8566&mlon=2.3522#map=12/48.8566/2.3522"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#04467a] transition-colors hover:text-[#033a66]"
                >
                  {t('Agrandir')}
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
