'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, ExternalLink, Link2 } from 'lucide-react';
import { toast } from 'sonner';

export interface LinkContent {
  url: string;
  title: string;
  description: string;
}

interface LinkConfigProps {
  qrCodeId: string;
  initialContent?: Partial<LinkContent>;
  onSave?: (content: LinkContent) => void;
}

export function LinkConfig({ qrCodeId, initialContent, onSave }: LinkConfigProps) {
  const [url, setUrl] = useState(initialContent?.url || '');
  const [title, setTitle] = useState(initialContent?.title || '');
  const [description, setDescription] = useState(initialContent?.description || '');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!initialContent);

  useEffect(() => {
    if (!initialContent && qrCodeId) {
      fetch(`/api/client/module-content?qrCodeId=${qrCodeId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.content) {
            setUrl(data.content.url || '');
            setTitle(data.content.title || '');
            setDescription(data.content.description || '');
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [qrCodeId, initialContent]);

  const normalizeUrl = (input: string): string => {
    let u = input.trim();
    if (u && !u.startsWith('http://') && !u.startsWith('https://')) {
      u = 'https://' + u;
    }
    return u;
  };

  const handleSave = async () => {
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) {
      toast.error('L\'URL est requise');
      return;
    }
    try {
      new URL(normalizedUrl);
    } catch {
      toast.error('L\'URL n\'est pas valide');
      return;
    }

    const content: LinkContent = { url: normalizedUrl, title: title.trim(), description: description.trim() };

    if (onSave) {
      onSave(content);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/client/module-content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrCodeId, content }),
      });
      if (!res.ok) throw new Error('Erreur serveur');
      toast.success('Lien sauvegardé');
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
          <Link2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Lien Externe</h3>
          <p className="text-sm text-muted-foreground">Redirigez vers un site web ou une ressource</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Détails du lien</CardTitle>
          <CardDescription>Configurez l\'URL et les informations affichées</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="link-url">URL</Label>
            <div className="flex items-center gap-2">
              <Input
                id="link-url"
                placeholder="https://exemple.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              {url && (
                <a
                  href={normalizeUrl(url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0"
                >
                  <Button variant="outline" size="icon" className="h-10 w-10">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </a>
              )}
            </div>
            <p className="text-xs text-muted-foreground">https:// sera ajouté automatiquement si omis</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="link-title">Titre (optionnel)</Label>
            <Input
              id="link-title"
              placeholder="Mon site web"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="link-desc">Description (optionnel)</Label>
            <Textarea
              id="link-desc"
              placeholder="Une brève description du lien..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {url && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aperçu</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <ExternalLink className="h-3.5 w-3.5" />
                {new URL(normalizeUrl(url)).hostname}
              </div>
              {title && <p className="font-semibold">{title}</p>}
              {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Sauvegarder
        </Button>
      </div>
    </div>
  );
}
