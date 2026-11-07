import { createClient } from '@supabase/supabase-js';
// Fallback values allow Next.js to prerender during Docker builds where Render
// does not expose runtime environment variables to the build stage. Runtime
// requests use the real Render-provided values.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://build-placeholder.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'build-placeholder-publishable-key';
export const supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
