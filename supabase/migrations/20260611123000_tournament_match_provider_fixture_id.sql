-- Optional external provider fixture id for deterministic live-score matching.
alter table public.tournament_matches
  add column if not exists provider_fixture_id text;

comment on column public.tournament_matches.provider_fixture_id is
  'External live-scores provider fixture id (e.g. API-Football). Used for one-to-one match mapping when set.';

create unique index if not exists tournament_matches_edition_provider_fixture_id_uidx
  on public.tournament_matches (edition_id, provider_fixture_id)
  where provider_fixture_id is not null;
