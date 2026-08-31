import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { DashboardShell } from '@/components/airbnb/dashboard-shell';

// Layout commun à l'Espace Hôte : /airbnb/dashboard/*
export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getServerSession(authOptions);
  const userName = session?.user?.name ?? null;

  return <DashboardShell userName={userName}>{children}</DashboardShell>;
}
