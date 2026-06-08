-- Phase 5: restrict pool_admin_audit_log reads to pool owners and global admins
-- (non-owner pool admins can manage day-to-day pool ops but not view membership audit).

DROP POLICY IF EXISTS pool_admin_audit_log_select_manage ON public.pool_admin_audit_log;

CREATE POLICY pool_admin_audit_log_select_owner
  ON public.pool_admin_audit_log
  FOR SELECT
  TO authenticated
  USING (public.ashbracket_is_pool_owner(pool_id));
