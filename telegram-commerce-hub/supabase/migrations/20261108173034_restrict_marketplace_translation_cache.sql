-- Translation cache is an internal service-managed table, not a client-facing resource.
revoke all on table public.marketplace_translation_cache from public, anon, authenticated;
drop policy if exists "service role manages marketplace translation cache" on public.marketplace_translation_cache;
create policy "service role manages marketplace translation cache"
on public.marketplace_translation_cache
for all
to service_role
using (true)
with check (true);
