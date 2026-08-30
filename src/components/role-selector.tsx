'use client';

import { Shield, QrCode, ArrowRight } from 'lucide-react';

interface RoleSelectorProps {
  onSelectAdmin: () => void;
  onSelectClient: () => void;
}

export function RoleSelector({ onSelectAdmin, onSelectClient }: RoleSelectorProps) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-muted/50 via-background to-muted/50">
      {/* Header */}
      <header className="w-full border-b bg-card/80 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl flex h-16 items-center justify-center gap-3 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <QrCode className="h-5 w-5 text-primary-foreground" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">QR Domotik</h1>
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl space-y-8 text-center">
          {/* Title */}
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Bienvenue sur QR Domotik
            </h2>
            <p className="text-muted-foreground text-base">
              Choisissez votre espace pour continuer
            </p>
          </div>

          {/* Role cards */}
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Super Admin Card */}
            <button
              onClick={onSelectAdmin}
              className="group relative flex flex-col items-center gap-4 rounded-2xl border-2 border-border bg-card p-8 transition-all hover:border-destructive/50 hover:shadow-lg hover:shadow-destructive/5"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 transition-colors group-hover:bg-destructive/20">
                <Shield className="h-8 w-8 text-destructive" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">Super Admin</h3>
                <p className="text-sm text-muted-foreground">
                  Gestion des QR codes, lots, utilisateurs et statistiques
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-destructive" />
            </button>

            {/* Client Card */}
            <button
              onClick={onSelectClient}
              className="group relative flex flex-col items-center gap-4 rounded-2xl border-2 border-border bg-card p-8 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 transition-colors group-hover:bg-primary/20">
                <QrCode className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">Espace Client</h3>
                <p className="text-sm text-muted-foreground">
                  Mes QR codes, maisons, modules et marketplace
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary" />
            </button>
          </div>

          {/* Info */}
          <p className="text-xs text-muted-foreground">
            Mode demo &middot; Changez d&apos;espace a tout moment depuis le menu
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card/80 backdrop-blur-sm px-4 py-3">
        <p className="text-center text-xs text-muted-foreground">
          QR Domotik v1.0.0 &middot; Plateforme SaaS de QR codes domotiques
        </p>
      </footer>
    </div>
  );
}
