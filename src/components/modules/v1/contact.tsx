'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, Phone, Mail, MapPin, Globe, MessageCircle } from 'lucide-react';
import type { ModuleProps } from '../types';

const DEFAULT_CONTENT = {
  name: 'Pierre et Marie Dupont',
  role: 'Propriétaires',
  phone: '+33 6 12 34 56 78',
  email: 'dupont@email.com',
  address: '12 Rue de la Paix, 75002 Paris',
  website: 'https://maison-dupont.fr',
  languages: ['Français', 'English', 'Español'],
  responseTime: 'En général sous 1 heure',
  avatar: null,
  secondaryContacts: [
    { name: 'Concierge - M. Bernard', phone: '+33 6 98 76 54 32', role: 'Conciergerie' },
  ],
};

export default function ContactModule({ content }: ModuleProps) {
  const data = { ...DEFAULT_CONTENT, ...content } as typeof DEFAULT_CONTENT & { secondaryContacts: { name: string; phone: string; role: string }[] };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 text-xl font-bold">
              {data.name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
            </div>
            <div className="flex-1">
              <CardTitle className="text-lg">{data.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{data.role}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Contact methods */}
          <div className="grid gap-2">
            <Button variant="outline" className="justify-start gap-3 h-12" onClick={() => window.open(`tel:${data.phone.replace(/\s/g, '')}`)}>
              <Phone className="h-4 w-4 text-green-600" />
              <div className="text-left">
                <p className="text-sm font-medium">Téléphone</p>
                <p className="text-xs text-muted-foreground">{data.phone}</p>
              </div>
            </Button>
            <Button variant="outline" className="justify-start gap-3 h-12" onClick={() => window.open(`mailto:${data.email}`)}>
              <Mail className="h-4 w-4 text-blue-600" />
              <div className="text-left">
                <p className="text-sm font-medium">E-mail</p>
                <p className="text-xs text-muted-foreground">{data.email}</p>
              </div>
            </Button>
            <Button variant="outline" className="justify-start gap-3 h-12" onClick={() => window.open(`sms:${data.phone.replace(/\s/g, '')}`)}>
              <MessageCircle className="h-4 w-4 text-purple-600" />
              <div className="text-left">
                <p className="text-sm font-medium">SMS</p>
                <p className="text-xs text-muted-foreground">{data.phone}</p>
              </div>
            </Button>
            {data.website && (
              <Button variant="outline" className="justify-start gap-3 h-12" onClick={() => window.open(data.website, '_blank')}>
                <Globe className="h-4 w-4 text-orange-600" />
                <div className="text-left">
                  <p className="text-sm font-medium">Site web</p>
                  <p className="text-xs text-muted-foreground">{data.website}</p>
                </div>
              </Button>
            )}
          </div>

          {/* Address */}
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
            <p className="text-sm">{data.address}</p>
          </div>

          {/* Languages & Response time */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Langues :</span>
            {data.languages.map((lang) => (
              <Badge key={lang} variant="secondary" className="text-xs">{lang}</Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">⏱️ {data.responseTime}</p>

          {/* Secondary contacts */}
          {data.secondaryContacts && data.secondaryContacts.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Autres contacts</p>
              {data.secondaryContacts.map((c, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border p-2.5 mb-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.role}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => window.open(`tel:${c.phone.replace(/\s/g, '')}`)}>
                    <Phone className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
