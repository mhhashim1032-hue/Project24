import { createClient } from '@supabase/supabase-js';
// The publishable/anon key is intentionally public and protected by Supabase RLS.
// Environment variables allow separate Preview and Production configuration on Vercel.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckresrujdienuqczzyki.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_DF1KAMN_dssbRpWxWuBLIw_VdH_Jndm';
export const supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
