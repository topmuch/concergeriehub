'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Grid3x3, LayoutList, Eye, Layers, Star, ChevronRight, X } from 'lucide-react';
import { MODULE_DESCRIPTORS, getModulesByVersion, getAllCategories, ModuleRenderer } from './module-registry';
import type { QrModuleType } from '@/types/database';

export function ModuleExplorer() {
  const [search, setSearch] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [previewModule, setPreviewModule] = useState<QrModuleType | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const categories = useMemo(() => getAllCategories(), []);

  const filteredModules = useMemo(() => {
    let modules = Object.values(MODULE_DESCRIPTORS);
    if (search) {
      const q = search.toLowerCase();
      modules = modules.filter(m => m.label.toLowerCase().includes(q) || m.description.toLowerCase().includes(q) || m.type.toLowerCase().includes(q) || m.category.toLowerCase().includes(q));
    }
    if (selectedVersion !== null) {
      modules = modules.filter(m => m.version === selectedVersion);
    }
    if (selectedCategory) {
      modules = modules.filter(m => m.category === selectedCategory);
    }
    return modules;
  }, [search, selectedVersion, selectedCategory]);

  const versionCounts = { 1: getModulesByVersion(1).length, 2: getModulesByVersion(2).length, 3: getModulesByVersion(3).length };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Catalogue des modules</h2>
        <p className="text-muted-foreground">{Object.keys(MODULE_DESCRIPTORS).length} modules disponibles pour vos QR codes</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un module..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          {[null, 1, 2, 3].map(v => (
            <Button
              key={v ?? 'all'}
              variant={selectedVersion === v ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedVersion(v)}
            >
              {v ? `V${v} (${versionCounts[v]})` : 'Tous'}
            </Button>
          ))}
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="ghost" size="icon" className={viewMode === 'grid' ? 'bg-accent' : ''} onClick={() => setViewMode('grid')}>
            <Grid3x3 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className={viewMode === 'list' ? 'bg-accent' : ''} onClick={() => setViewMode('list')}>
            <LayoutList className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${!selectedCategory ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
        >
          Toutes
        </button>
        {categories.map(cat => {
          const count = Object.values(MODULE_DESCRIPTORS).filter(m => m.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${cat === selectedCategory ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Results count */}
      <p className="text-sm text-muted-foreground">{filteredModules.length} module(s) affiché(s)</p>

      {/* Modules grid/list */}
      {viewMode === 'grid' ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredModules.map(mod => (
            <Card
              key={mod.type}
              className="group cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5"
              onClick={() => setPreviewModule(mod.type)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${mod.color} transition-transform group-hover:scale-110`}>
                    <mod.icon className="h-5 w-5" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">V{mod.version}</Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <h3 className="text-sm font-semibold mb-1">{mod.label}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{mod.description}</p>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-[10px]">{mod.category}</Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-2 max-h-[70vh] overflow-y-auto">
          {filteredModules.map(mod => (
            <div
              key={mod.type}
              className="flex items-center gap-4 rounded-lg border p-3 cursor-pointer hover:bg-accent transition-colors"
              onClick={() => setPreviewModule(mod.type)}
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${mod.color}`}>
                <mod.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{mod.label}</p>
                  <Badge variant="outline" className="text-[10px]">V{mod.version}</Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">{mod.description}</p>
              </div>
              <Badge variant="secondary" className="text-[10px] hidden sm:block">{mod.category}</Badge>
              <Button variant="ghost" size="sm" className="shrink-0 gap-1.5">
                <Eye className="h-3.5 w-3.5" />Aperçu
              </Button>
            </div>
          ))}
        </div>
      )}

      {filteredModules.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <Search className="h-8 w-8" />
          <p className="text-sm">Aucun module trouvé pour « {search} »</p>
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewModule} onOpenChange={(open) => !open && setPreviewModule(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {previewModule && (() => {
                const desc = MODULE_DESCRIPTORS[previewModule];
                return (
                  <>
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${desc.color}`}>
                      <desc.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <DialogTitle>{desc.label}</DialogTitle>
                      <p className="text-xs text-muted-foreground">{desc.description}</p>
                    </div>
                  </>
                );
              })()}
            </div>
          </DialogHeader>
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="py-4">
              {previewModule && (
                <ModuleRenderer
                  type={previewModule}
                  content={{}}
                  onSave={() => {}}
                  mode="demo"
                />
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
