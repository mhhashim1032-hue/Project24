import { createClient } from '@supabase/supabase-js';
// Supabase publishable key is intentionally public and protected by RLS.
const url = 'https://ckresrujdienuqczzyki.supabase.co';
const key = 'sb_publishable_DF1KAMN_dssbRpWxWuBLIw_VdH_Jndm';
export const supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
