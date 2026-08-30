'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import {
  User, Home, Bell, Palette, Shield, Info, Save, Globe,
  Lock, Trash2, Download, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Profil
  const [displayName, setDisplayName] = useState('Utilisateur Demo');

  // Préférences Hub
  const [homeName, setHomeName] = useState('Ma maison');
  const [hubLang, setHubLang] = useState('fr');
  const [guestMode, setGuestMode] = useState(false);

  // Notifications
  const [pushEnabled, setPushEnabled] = useState(true);
  const [dlcAlerts, setDlcAlerts] = useState(true);
  const [lowStockAlerts, setLowStockAlerts] = useState(true);
  const [chatMessages, setChatMessages] = useState(true);

  // Apparence
  const [uiLang, setUiLang] = useState('fr');

  // Sécurité
  const [pinLock, setPinLock] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Stats
  const [stats, setStats] = useState({ qrCount: 0, homeCount: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/client/homes');
        if (res.ok) {
          const data = await res.json();
          const homes = Array.isArray(data) ? data : data.homes || [];
          const totalQr = homes.reduce((acc: number, h: Record<string, unknown>) => {
            const count = (h as { _count?: { qrCodes?: number } })._count?.qrCodes ?? 0;
            return acc + count;
          }, 0);
          setStats({ qrCount: totalQr, homeCount: homes.length });
        }
      } catch {
        // silently ignore
      } finally {
        setStatsLoading(false);
      }
    }
    fetchStats();
  }, []);

  const sectionIcon = (icon: React.ReactNode, title: string, badge?: string) => (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md shadow-violet-500/20">
        {icon}
      </div>
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold">{title}</h3>
        {badge && <Badge variant="secondary" className="text-[10px]">{badge}</Badge>}
      </div>
    </div>
  );

  const cardClass = 'border-l-4 border-l-violet-500';

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 p-6 text-white shadow-lg shadow-violet-500/20">
        <h2 className="text-2xl font-bold tracking-tight">Paramètres</h2>
        <p className="mt-1 text-sm text-violet-100">Gérez votre profil, préférences et sécurité</p>
      </div>

      {/* Cards grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ─── 1. Profil Utilisateur ─── */}
        <Card className={cardClass}>
          <CardHeader className="pb-4">
            {sectionIcon(<User className="h-5 w-5" />, 'Profil Utilisateur')}
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-lg font-bold text-white shadow-md">
                UD
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Avatar</p>
                <p className="text-xs text-muted-foreground">Photo de profil non configurée</p>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="displayName" className="text-sm font-medium">Nom</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Votre nom d'affichage"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <Input id="email" value="dev-user@qrd.dom" readOnly className="bg-muted/50" />
              <p className="text-[11px] text-muted-foreground">L'email ne peut pas être modifié en démo</p>
            </div>

            <Button
              className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
              onClick={() => toast.success('Profil mis à jour')}
            >
              <Save className="mr-2 h-4 w-4" />
              Sauvegarder
            </Button>
          </CardContent>
        </Card>

        {/* ─── 2. Préférences Hub ─── */}
        <Card className={cardClass}>
          <CardHeader className="pb-4">
            {sectionIcon(<Home className="h-5 w-5" />, 'Préférences Hub')}
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="homeName" className="text-sm font-medium">Nom de la maison</Label>
              <Input
                id="homeName"
                value={homeName}
                onChange={(e) => setHomeName(e.target.value)}
                placeholder="Ex: Maison Principale"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                Langue par défaut du Hub
              </Label>
              <Select value={hubLang} onValueChange={setHubLang}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir une langue" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="de">Deutsch</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Mode invité par défaut</Label>
              <Switch
                checked={guestMode}
                onCheckedChange={(checked) => {
                  setGuestMode(checked);
                  toast.info(checked ? 'Mode invité activé' : 'Mode invité désactivé');
                }}
              />
            </div>

            <Button
              className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
              onClick={() => toast.success('Préférences du Hub sauvegardées')}
            >
              <Save className="mr-2 h-4 w-4" />
              Sauvegarder
            </Button>
          </CardContent>
        </Card>

        {/* ─── 3. Notifications ─── */}
        <Card className={cardClass}>
          <CardHeader className="pb-4">
            {sectionIcon(<Bell className="h-5 w-5" />, 'Notifications')}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Activer les notifications push</p>
                  <p className="text-xs text-muted-foreground">Recevez les alertes sur votre appareil</p>
                </div>
                <Switch
                  checked={pushEnabled}
                  onCheckedChange={(checked) => {
                    setPushEnabled(checked);
                    toast.info(checked ? 'Notifications push activées' : 'Notifications push désactivées');
                  }}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Alertes DLC</p>
                  <p className="text-xs text-muted-foreground">Produits proches de la date d'expiration</p>
                </div>
                <Switch
                  checked={dlcAlerts}
                  onCheckedChange={(checked) => {
                    setDlcAlerts(checked);
                    toast.info(checked ? 'Alertes DLC activées' : 'Alertes DLC désactivées');
                  }}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Alertes stock bas</p>
                  <p className="text-xs text-muted-foreground">Produits avec un stock faible</p>
                </div>
                <Switch
                  checked={lowStockAlerts}
                  onCheckedChange={(checked) => {
                    setLowStockAlerts(checked);
                    toast.info(checked ? 'Alertes stock bas activées' : 'Alertes stock bas désactivées');
                  }}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Nouveaux messages chat</p>
                  <p className="text-xs text-muted-foreground">Notifications pour les messages reçus</p>
                </div>
                <Switch
                  checked={chatMessages}
                  onCheckedChange={(checked) => {
                    setChatMessages(checked);
                    toast.info(checked ? 'Notifications chat activées' : 'Notifications chat désactivées');
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── 4. Apparence ─── */}
        <Card className={cardClass}>
          <CardHeader className="pb-4">
            {sectionIcon(<Palette className="h-5 w-5" />, 'Apparence')}
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Thème</Label>
              <Select
                value={mounted ? theme : 'system'}
                onValueChange={(val) => setTheme(val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un thème" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Clair</SelectItem>
                  <SelectItem value="dark">Sombre</SelectItem>
                  <SelectItem value="system">Système</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Le thème s'applique immédiatement à l'interface
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                Langue de l'interface
              </Label>
              <Select value={uiLang} onValueChange={setUiLang}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir une langue" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* ─── 5. Sécurité ─── */}
        <Card className={cardClass}>
          <CardHeader className="pb-4">
            {sectionIcon(<Shield className="h-5 w-5" />, 'Sécurité')}
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Change password dialog */}
            <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Lock className="h-4 w-4" />
                  Changer le mot de passe
                  <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Changer le mot de passe</DialogTitle>
                  <DialogDescription>
                    Entrez votre mot de passe actuel puis le nouveau mot de passe.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Mot de passe actuel</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">Nouveau mot de passe</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>
                    Annuler
                  </Button>
                  <Button
                    className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
                    onClick={() => {
                      setPasswordDialogOpen(false);
                      setCurrentPassword('');
                      setNewPassword('');
                      toast.success('Mot de passe mis à jour');
                    }}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Mettre à jour
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Verrouillage PIN pour le Hub</p>
                <p className="text-xs text-muted-foreground">Protégez l'accès au Hub avec un code PIN</p>
              </div>
              <Switch
                checked={pinLock}
                onCheckedChange={(checked) => {
                  setPinLock(checked);
                  toast.info(checked ? 'Verrouillage PIN activé' : 'Verrouillage PIN désactivé');
                }}
              />
            </div>

            <Separator />

            {/* Delete account */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full gap-2">
                  <Trash2 className="h-4 w-4" />
                  Supprimer mon compte
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Êtes-vous absolument sûr ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cette action est irréversible. Toutes vos données, maisons et QR codes seront supprimés définitivement.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => toast.info('Fonctionnalité désactivée en démo')}
                  >
                    Supprimer définitivement
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        {/* ─── 6. À propos ─── */}
        <Card className={cardClass}>
          <CardHeader className="pb-4">
            {sectionIcon(<Info className="h-5 w-5" />, 'À propos')}
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Version */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Version</p>
              <Badge variant="secondary" className="font-mono">v3.0.0</Badge>
            </div>

            <Separator />

            {/* Stats */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Statistiques</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gradient-to-br from-violet-500/10 to-purple-500/10 p-4 text-center">
                  <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">
                    {statsLoading ? '…' : stats.qrCount}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">QR codes actifs</p>
                </div>
                <div className="rounded-lg bg-gradient-to-br from-violet-500/10 to-purple-500/10 p-4 text-center">
                  <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">
                    {statsLoading ? '…' : stats.homeCount}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Maisons</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Export */}
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => toast.success('Export de données lancé')}
            >
              <Download className="h-4 w-4" />
              Exporter mes données
              <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
