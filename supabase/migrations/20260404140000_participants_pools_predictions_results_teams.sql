-- Follow-up: participant contact/payment, pool lock deadline, text pick values, unique country codes

ALTER TABLE public.pools
  ADD COLUMN lock_at timestamptz;

ALTER TABLE public.participants
  ADD COLUMN email text,
  ADD COLUMN is_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN paid_at timestamptz,
  ADD COLUMN notes text;

ALTER TABLE public.predictions
  ADD COLUMN value_text text;

ALTER TABLE public.results
  ADD COLUMN value_text text;

ALTER TABLE public.teams
  ADD CONSTRAINT teams_country_code_unique UNIQUE (country_code);
