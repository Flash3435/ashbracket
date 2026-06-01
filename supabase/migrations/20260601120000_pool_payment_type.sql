-- Free vs paid pools: organizer payment instructions and entry fee display.

ALTER TABLE public.pools
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS entry_fee_label text,
  ADD COLUMN IF NOT EXISTS entry_fee_amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS payment_instructions text;

ALTER TABLE public.pools
  DROP CONSTRAINT IF EXISTS pools_payment_type_check;

ALTER TABLE public.pools
  ADD CONSTRAINT pools_payment_type_check
  CHECK (payment_type IN ('free', 'paid'));

ALTER TABLE public.pools
  DROP CONSTRAINT IF EXISTS pools_entry_fee_amount_check;

ALTER TABLE public.pools
  ADD CONSTRAINT pools_entry_fee_amount_check
  CHECK (entry_fee_amount IS NULL OR entry_fee_amount >= 0);

COMMENT ON COLUMN public.pools.payment_type IS
  'Whether the pool collects an entry fee outside AshBracket (free or paid).';
COMMENT ON COLUMN public.pools.entry_fee_label IS
  'Short label shown to participants for the entry fee (e.g. Entry fee).';
COMMENT ON COLUMN public.pools.entry_fee_amount IS
  'Optional entry fee amount in pool currency units for participant display.';
COMMENT ON COLUMN public.pools.payment_instructions IS
  'How participants should pay the organizer; visible to pool members when unpaid.';

-- Existing rows default to free via column default.
