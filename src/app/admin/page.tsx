import { redirect } from 'next/navigation';

// /admin → redirige vers la vue d'ensemble du Superadmin
export default function AdminIndexPage() {
  redirect('/admin/dashboard');
}
