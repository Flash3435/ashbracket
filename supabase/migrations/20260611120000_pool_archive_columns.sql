-- Soft-archive empty pools without deleting rows or related data.

ALTER TABLE public.pools
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN archive_reason text;

COMMENT ON COLUMN public.pools.archived_at IS
  'When set, the pool is archived and hidden from normal admin dashboard lists.';
COMMENT ON COLUMN public.pools.archived_by_user_id IS
  'User who archived the pool, when archived from an authenticated session.';
COMMENT ON COLUMN public.pools.archive_reason IS
  'Human-readable reason for archiving (e.g. empty pool cleanup).';

CREATE INDEX pools_archived_at_idx ON public.pools (archived_at)
  WHERE archived_at IS NOT NULL;
