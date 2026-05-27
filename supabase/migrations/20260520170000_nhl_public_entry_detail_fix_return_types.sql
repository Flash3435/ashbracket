-- Fix PL/pgSQL RETURN QUERY type mismatch on public NHL entry-detail RPCs.
-- nhl_series.round_order and slot_index are smallint; functions declared integer.

CREATE OR REPLACE FUNCTION public.fetch_nhl_public_entry_picks(p_membership_id uuid)
RETURNS TABLE (
  series_id uuid,
  round_code text,
  round_order integer,
  side_or_conference text,
  slot_index integer,
  higher_team_abbr text,
  higher_team_name text,
  lower_team_abbr text,
  lower_team_name text,
  picked_team_abbr text,
  picked_team_name text,
  scoring_winner_abbr text,
  scoring_winner_name text,
  outcome text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_edition_id uuid;
BEGIN
  SELECT m.user_id, m.edition_id
  INTO v_user_id, v_edition_id
  FROM public.nhl_memberships m
  INNER JOIN public.nhl_editions e ON e.id = m.edition_id AND e.is_active = true
  WHERE m.id = p_membership_id;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH series_for_scoring AS (
    SELECT
      s.id,
      s.edition_id,
      s.round_code,
      s.round_order,
      s.side_or_conference,
      s.slot_index,
      s.higher_seed_team_id,
      s.lower_seed_team_id,
      COALESCE(
        s.winner_team_id,
        CASE
          WHEN s.higher_seed_team_id IS NOT NULL
            AND s.lower_seed_team_id IS NOT NULL
            AND GREATEST(
              COALESCE(s.games_won_by_higher_seed, 0),
              COALESCE(s.games_won_by_lower_seed, 0)
            ) >= 4
            AND COALESCE(s.games_won_by_higher_seed, 0)
              <> COALESCE(s.games_won_by_lower_seed, 0)
          THEN
            CASE
              WHEN COALESCE(s.games_won_by_higher_seed, 0)
                > COALESCE(s.games_won_by_lower_seed, 0)
              THEN s.higher_seed_team_id
              ELSE s.lower_seed_team_id
            END
          ELSE NULL
        END
      ) AS scoring_winner_team_id
    FROM public.nhl_series s
    WHERE s.edition_id = v_edition_id
  ),
  user_picks AS (
    SELECT p.series_id, p.picked_team_id
    FROM public.nhl_r1_series_picks p
    WHERE p.user_id = v_user_id
      AND p.edition_id = v_edition_id
    UNION ALL
    SELECT p.series_id, p.picked_team_id
    FROM public.nhl_r2_series_picks p
    WHERE p.user_id = v_user_id
      AND p.edition_id = v_edition_id
  )
  SELECT
    sfs.id AS series_id,
    sfs.round_code::text,
    sfs.round_order::integer,
    sfs.side_or_conference::text,
    sfs.slot_index::integer,
    th.abbreviation::text AS higher_team_abbr,
    th.team_name::text AS higher_team_name,
    tl.abbreviation::text AS lower_team_abbr,
    tl.team_name::text AS lower_team_name,
    tp.abbreviation::text AS picked_team_abbr,
    tp.team_name::text AS picked_team_name,
    tw.abbreviation::text AS scoring_winner_abbr,
    tw.team_name::text AS scoring_winner_name,
    (
      CASE
        WHEN sfs.scoring_winner_team_id IS NULL THEN 'pending'
        WHEN up.picked_team_id = sfs.scoring_winner_team_id THEN 'correct'
        ELSE 'incorrect'
      END
    )::text AS outcome
  FROM user_picks up
  INNER JOIN series_for_scoring sfs ON sfs.id = up.series_id
  LEFT JOIN public.nhl_teams th ON th.id = sfs.higher_seed_team_id
  LEFT JOIN public.nhl_teams tl ON tl.id = sfs.lower_seed_team_id
  LEFT JOIN public.nhl_teams tp ON tp.id = up.picked_team_id
  LEFT JOIN public.nhl_teams tw ON tw.id = sfs.scoring_winner_team_id
  ORDER BY sfs.round_order ASC, sfs.side_or_conference ASC NULLS LAST, sfs.slot_index ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.fetch_nhl_public_entry_context(p_membership_id uuid)
RETURNS TABLE (
  membership_id uuid,
  user_id uuid,
  edition_id uuid,
  entry_name text,
  edition_name text,
  season_label text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.user_id,
    m.edition_id,
    (
      COALESCE(
        NULLIF(TRIM(m.display_name), ''),
        NULLIF(TRIM(split_part(u.email::text, '@', 1)), ''),
        'NHL participant'
      )
    )::text AS entry_name,
    e.name::text AS edition_name,
    e.season_label::text
  FROM public.nhl_memberships m
  INNER JOIN public.nhl_editions e ON e.id = m.edition_id AND e.is_active = true
  LEFT JOIN auth.users u ON u.id = m.user_id
  WHERE m.id = p_membership_id;
END;
$$;
