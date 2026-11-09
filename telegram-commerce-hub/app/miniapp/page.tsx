import { LegacyMiniApp } from './legacy-page';

export default function MiniAppPage() {
  // The production route always uses the authenticated, Supabase-backed customer app.
  // The standalone VerifierDemo remains a design reference only; it is never served to customers.
  return <LegacyMiniApp />;
}
