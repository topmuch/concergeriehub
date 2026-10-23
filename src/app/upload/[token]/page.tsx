import type { Metadata } from 'next';
import { loadDelegationUpload } from '@/lib/shield-delegation';
import { UploadTokenPage } from '@/components/upload/upload-token-page';

// FIX-CSP-PROD (v4.151) : rendu dynamique exigé par la CSP à nonce.
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const result = await loadDelegationUpload(token);
  return {
    title: result.ok
      ? `Photos de référence — ${result.data.propertyName}`
      : 'Photos de référence — lien invalide',
    robots: { index: false, follow: false },
  };
}

// v4.164 — le CODE de la page vit dans src/components/upload/ (à
// l'abri des resync sandbox qui suppriment récurrentuellement le
// dossier src/app/upload/ — piège .gitignore /upload/). Ce shim de
// route est trivialement restaurable : 1 import + 1 return.
export default async function DelegationUploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <UploadTokenPage params={params} />;
}
