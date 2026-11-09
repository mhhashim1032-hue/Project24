-- Remove anonymous/public execution from administrative inventory RPCs.
-- Authenticated access remains for the admin dashboard; each function enforces private.is_admin().
revoke all on function public.admin_assign_plan_credentials(uuid) from public, anon;
revoke all on function public.admin_import_plan_credentials(uuid, jsonb) from public, anon;
