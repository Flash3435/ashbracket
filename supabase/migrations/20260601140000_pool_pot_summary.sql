-- Paid pool pot display: currency and optional participant-visible pot summary.

ALTER TABLE public.pools
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'CAD',
  ADD COLUMN IF NOT EXISTS show_pot_to_participants boolean NOT NULL DEFAULT false;

ALTER TABLE public.pools
  DROP CONSTRAINT IF EXISTS pools_currency_code_check;

ALTER TABLE public.pools
  ADD CONSTRAINT pools_currency_code_check
  CHECK (char_length(trim(currency_code)) BETWEEN 3 AND 3);

COMMENT ON COLUMN public.pools.currency_code IS
  'ISO 4217 currency code for entry fee and pot display (default CAD).';
COMMENT ON COLUMN public.pools.show_pot_to_participants IS
  'When true, pool members may see aggregate current/potential pot (not individual payment status).';

-- Aggregate pot for a pool member (no per-participant payment leakage).
CREATE OR REPLACE FUNCTION public.ashbracket_pool_pot_summary_for_member(p_pool_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_payment_type text;
  v_show_pot boolean;
  v_fee numeric;
  v_currency text;
  v_paid int;
  v_total int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.participants p
    WHERE p.pool_id = p_pool_id
      AND p.user_id = v_uid
  ) THEN
    RETURN NULL;
  END IF;

  SELECT
    pl.payment_type,
    pl.show_pot_to_participants,
    pl.entry_fee_amount,
    pl.currency_code
  INTO v_payment_type, v_show_pot, v_fee, v_currency
  FROM public.pools pl
  WHERE pl.id = p_pool_id;

  IF v_payment_type IS DISTINCT FROM 'paid' OR v_show_pot IS NOT TRUE THEN
    RETURN jsonb_build_object('show_pot', false);
  END IF;

  SELECT
    count(*) FILTER (WHERE p.is_paid),
    count(*)::int
  INTO v_paid, v_total
  FROM public.participants p
  WHERE p.pool_id = p_pool_id;

  RETURN jsonb_build_object(
    'show_pot', true,
    'currency_code', coalesce(v_currency, 'CAD'),
    'entry_fee_amount', v_fee,
    'current_pot', CASE
      WHEN v_fee IS NULL THEN NULL::numeric
      ELSE (v_paid::numeric * v_fee)
    END,
    'potential_pot', CASE
      WHEN v_fee IS NULL THEN NULL::numeric
      ELSE (v_total::numeric * v_fee)
    END
  );
END;
$$;

COMMENT ON FUNCTION public.ashbracket_pool_pot_summary_for_member(uuid) IS
  'Pool member: aggregate current/potential pot when pool is paid and show_pot_to_participants is enabled.';

REVOKE ALL ON FUNCTION public.ashbracket_pool_pot_summary_for_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ashbracket_pool_pot_summary_for_member(uuid) TO authenticated;
