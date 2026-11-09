import { LegacyMiniApp } from './legacy-page';
import VerifierDemo from '@/components/miniapp/verifier-demo';

export default async function MiniAppPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const params = await searchParams;
  if (params?.demo === '1' || process.env.NODE_ENV === 'development') return <VerifierDemo />;
  return <LegacyMiniApp />;
}
