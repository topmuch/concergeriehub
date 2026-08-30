'use client';

import { useState, useCallback, useEffect, Suspense, useRef } from 'react';
import { useSession, SessionProvider } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { LandingPage } from '@/components/landing/hero-section';
import { RoleSelector } from '@/components/role-selector';
import { AuthForm } from '@/components/auth/login-form';
import { SuperAdminLayout, type SuperAdminPage } from '@/components/admin/super-admin-layout';
import { ClientLayout, type ClientPage } from '@/components/client/client-layout';

import { ErrorBoundary } from '@/components/error-boundary';
import { SetupDemoView, HubDemoView } from '@/components/demo-views';

// Superadmin pages
import { StatsOverview } from '@/components/admin/stats-overview';
import { GenerateBatch } from '@/components/admin/generate-batch';
import { ManageBatches } from '@/components/admin/manage-batches';
// ManagePhysicalQr removed - 1 plaque model
import { AdminUsers } from '@/components/admin/admin-users';
import { AdminStats } from '@/components/admin/admin-stats';

// Client pages
import { ClientDashboard } from '@/components/client/client-dashboard';
// PhysicalQrCodes removed - activation now via setup wizard
import { HomesManager } from '@/components/client/homes-manager';
import { RoomsManager } from '@/components/client/rooms-manager';
import { ActivityLogViewer } from '@/components/client/activity-log-viewer';

import { ChoresManager } from '@/components/client/chores-manager';
import { NotificationCenter } from '@/components/client/notifications-center';
import { ScanAnalytics } from '@/components/client/scan-analytics';
import { AutomationsManager } from '@/components/client/automations-manager';
import { WebhooksManager } from '@/components/client/webhooks-manager';
import { ArtisanManager } from '@/components/client/artisan-manager';
import { MonetizationManager } from '@/components/client/monetization-manager';
import { StockManager } from '@/components/client/stock-manager';
import { PackManager } from '@/components/client/pack-manager';
import { MarketplaceManager } from '@/components/client/marketplace-manager';
import { SettingsPage } from '@/components/client/settings-page';
import { HubManager } from '@/components/client/hub-manager';

// Admin pages (marketplace & B2B)
import { AdminArtisans } from '@/components/admin/admin-artisans';
import { AdminMarketplace } from '@/components/admin/admin-marketplace';
import { AdminPacks } from '@/components/admin/admin-packs';

// ── Demo Navigator Bar ──
import { ArrowLeft, Smartphone, Home, QrCode } from 'lucide-react';

function DemoNavBar({ currentView, onNavigate }: { currentView: string; onNavigate: (view: string) => void }) {
  const tabs = [
    { id: 'landing', label: 'Landing', icon: <Home className="h-3.5 w-3.5" /> },
    { id: 'setup-demo', label: 'Onboarding', icon: <Smartphone className="h-3.5 w-3.5" /> },
    { id: 'hub-demo', label: 'Hub QR', icon: <QrCode className="h-3.5 w-3.5" /> },
  ];

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5, type: 'spring', stiffness: 200, damping: 25 }}
      className="fixed bottom-0 left-0 right-0 z-[100] p-3 pointer-events-none"
    >
      <div className="mx-auto max-w-md">
        <div className="pointer-events-auto bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-1.5 shadow-2xl shadow-black/40 flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                currentView === tab.id
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ── Phone Frame Wrapper for demo views ──
function PhoneFrame({ children, onBack, title }: { children: React.ReactNode; onBack: () => void; title: string }) {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-900/80 backdrop-blur-xl border-b border-white/5">
        <button
          onClick={onBack}
          className="h-9 w-9 rounded-xl bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4 text-white/80" />
        </button>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white/90">{title}</p>
          <p className="text-[10px] text-white/40">Aperçu démo</p>
        </div>
        <div className="flex items-center gap-1.5 bg-violet-500/15 border border-violet-500/30 px-2.5 py-1 rounded-full">
          <div className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
          <span className="text-[10px] font-bold text-violet-300">DÉMO</span>
        </div>
      </div>

      {/* Phone frame centered on desktop */}
      <div className="flex-1 flex items-start justify-center">
        <div className="w-full max-w-[430px] h-full relative">
          {children}
        </div>
      </div>
    </div>
  );
}

function ScanAnalyticsWrapper() {
  const [homeId, setHomeId] = useState('');
  useEffect(() => {
    async function fetchHomes() {
      try {
        const res = await fetch('/api/client/homes');
        const data = await res.json();
        if (data.homes?.length > 0) setHomeId(data.homes[0].id);
      } catch { /* empty */ }
    }
    fetchHomes();
  }, []);
  if (!homeId) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  return <ScanAnalytics homeId={homeId} />;
}

type AppView = 'landing' | 'auth' | 'select' | 'superadmin' | 'client' | 'setup-demo' | 'hub-demo';

function AppContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const isActivateFlow = searchParams.get('action') === 'activate';
  const [view, setView] = useState<AppView>(isActivateFlow ? 'auth' : 'landing');
  const [adminPage, setAdminPage] = useState<SuperAdminPage>('overview');
  const [clientPage, setClientPage] = useState<ClientPage>('client-home');
  const initialRegister = isActivateFlow;
  const hasCheckedPending = useRef(false);
  // Once user manually switches view (admin ↔ client), stop auto-overriding from role
  const [sessionOverride, setSessionOverride] = useState(false);

  // Redirect to activate page after auth if coming from QR scan
  useEffect(() => {
    if (!hasCheckedPending.current && session && sessionStorage.getItem('pendingActivationCode')) {
      hasCheckedPending.current = true;
      const code = sessionStorage.getItem('pendingActivationCode');
      sessionStorage.removeItem('pendingActivationCode');
      window.location.href = `/activate/${code}`;
    }
  }, [session]);

  const handleAuthSuccess = useCallback((role: string) => {
    const pendingCode = sessionStorage.getItem('pendingActivationCode');
    if (pendingCode) {
      sessionStorage.removeItem('pendingActivationCode');
      window.location.href = `/activate/${pendingCode}`;
      return;
    }
    setSessionOverride(false);
    setView(role === 'superadmin' ? 'superadmin' : 'client');
  }, []);

  const handleLogout = useCallback(() => {
    setSessionOverride(false);
    setView('landing');
  }, []);

  const handleDemoNavigate = useCallback((target: string) => {
    setView(target as AppView);
  }, []);

  // Determine effective view
  // Only auto-set from role on FIRST session load (not on every render,
  // otherwise onSwitchToAdmin / onSwitchToClient buttons would be overridden)
  let effectiveView: AppView = view;
  if (session?.user && !sessionOverride) {
    effectiveView = session.user.role === 'superadmin' ? 'superadmin' : 'client';
  } else if (!session?.user && status !== 'loading' && view !== 'landing' && view !== 'auth' && view !== 'setup-demo' && view !== 'hub-demo') {
    effectiveView = 'auth';
  }

  // === LOADING ===
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0f1e]">
        <div className="h-8 w-8 border-2 border-[#2563EB]/30 border-t-[#2563EB] rounded-full animate-spin" />
      </div>
    );
  }

  // === AUTH (not logged in) ===
  if (!session) {
    // SETUP DEMO VIEW
    if (view === 'setup-demo') {
      return (
        <>
          <PhoneFrame onBack={() => setView('landing')} title="Onboarding (Setup)">
            <SetupDemoView />
          </PhoneFrame>
          <DemoNavBar currentView="setup-demo" onNavigate={handleDemoNavigate} />
        </>
      );
    }

    // HUB DEMO VIEW
    if (view === 'hub-demo') {
      return (
        <>
          <PhoneFrame onBack={() => setView('landing')} title="Hub QR (Invité / Famille)">
            <HubDemoView />
          </PhoneFrame>
          <DemoNavBar currentView="hub-demo" onNavigate={handleDemoNavigate} />
        </>
      );
    }

    if (effectiveView === 'landing') {
      return (
        <>
          <LandingPage
            onGoToDashboard={() => setView('auth')}
            onGoToSetup={() => setView('setup-demo')}
            onGoToHub={() => setView('hub-demo')}
          />
          <DemoNavBar currentView="landing" onNavigate={handleDemoNavigate} />
        </>
      );
    }
    return <AuthForm onSuccess={handleAuthSuccess} initialRegister={initialRegister} />;
  }

  // === ROLE SELECTOR ===
  if (effectiveView === 'select') {
    return (
      <RoleSelector
        onSelectAdmin={() => setView('superadmin')}
        onSelectClient={() => setView('client')}
      />
    );
  }

  // === SUPER ADMIN DASHBOARD ===
  if (effectiveView === 'superadmin') {
    const renderAdminPage = () => {
      switch (adminPage) {
        case 'overview': return <StatsOverview />;
        case 'generate': return <GenerateBatch />;
        case 'batches': return <ManageBatches />;
        case 'users': return <AdminUsers />;
        case 'stats': return <AdminStats />;
        case 'admin-artisans': return <AdminArtisans />;
        case 'admin-marketplace': return <AdminMarketplace />;
        case 'admin-packs': return <AdminPacks />;
        default: return <StatsOverview />;
      }
    };
    return (
      <SuperAdminLayout
        activePage={adminPage}
        onPageChange={setAdminPage}
        onSwitchToClient={() => { setSessionOverride(true); setView('client'); }}
        onLogout={handleLogout}
      >
        <ErrorBoundary key={adminPage}>{renderAdminPage()}</ErrorBoundary>
      </SuperAdminLayout>
    );
  }

  // === CLIENT DASHBOARD ===
  const renderClientPage = () => {
    switch (clientPage) {
      case 'client-home': return <ClientDashboard />;
      // @ts-expect-error 'client-hub' added to ClientPage type in a separate task
      case 'client-hub': return <HubManager />;
      case 'client-homes': return <HomesManager />;
      case 'client-rooms': return <RoomsManager />;
      case 'client-activity': return <ActivityLogViewer />;
      case 'client-chores': return <ChoresManager />;
      case 'client-artisans': return <ArtisanManager />;
      case 'client-stock': return <StockManager />;
      case 'client-packs': return <PackManager />;
      case 'client-marketplace': return <MarketplaceManager />;
      case 'client-monetization': return <MonetizationManager />;
      case 'client-notifications': return <NotificationCenter />;
      case 'client-analytics': return <ScanAnalyticsWrapper />;
      case 'client-automations': return <AutomationsManager />;
      case 'client-webhooks': return <WebhooksManager />;

      case 'client-settings': return <SettingsPage />;
      default: return <ClientDashboard />;
    }
  };
  return (
    <ClientLayout
      activePage={clientPage}
      onPageChange={setClientPage}
      onSwitchToAdmin={() => { setSessionOverride(true); setView('superadmin'); }}
      onLogout={handleLogout}
    >
      <ErrorBoundary key={clientPage}>{renderClientPage()}</ErrorBoundary>
    </ClientLayout>
  );
}

function AuthLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0f1e]">
      <div className="h-8 w-8 border-2 border-[#2563EB]/30 border-t-[#2563EB] rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <Suspense fallback={<AuthLoadingFallback />}>
        <AppContent />
      </Suspense>
    </SessionProvider>
  );
}
