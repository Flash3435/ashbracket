-- Read-only reconciliation checks for local-only migrations (after 20260505140000).
-- Run: supabase db query --linked -f scripts/verify-migration-reconciliation.sql -o json --agent=no

SELECT migration, check_name, ok, detail
FROM (
  -- 20260506193000
  SELECT '20260506193000' AS migration, 'table:wc_pool_ledger_recompute_status' AS check_name,
    to_regclass('public.wc_pool_ledger_recompute_status') IS NOT NULL AS ok, NULL::text AS detail
  UNION ALL SELECT '20260506193000', 'policy:wc_pool_ledger_recompute_status_select',
    EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='wc_pool_ledger_recompute_status' AND policyname='wc_pool_ledger_recompute_status_select'), NULL

  -- 20260518120000
  UNION ALL SELECT '20260518120000', 'column:tournament_editions.is_simulation',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tournament_editions' AND column_name='is_simulation'), NULL
  UNION ALL SELECT '20260518120000', 'column:pools.tournament_edition_id',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pools' AND column_name='tournament_edition_id'), NULL
  UNION ALL SELECT '20260518120000', 'column:pools.is_simulation',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pools' AND column_name='is_simulation'), NULL
  UNION ALL SELECT '20260518120000', 'column:results.edition_id',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='results' AND column_name='edition_id'), NULL
  UNION ALL SELECT '20260518120000', 'function:clone_tournament_edition_for_simulation',
    to_regprocedure('public.clone_tournament_edition_for_simulation(text,text,text)') IS NOT NULL, NULL
  UNION ALL SELECT '20260518120000', 'function:bootstrap_simulation_pool',
    to_regprocedure('public.bootstrap_simulation_pool(text,text,text,boolean)') IS NOT NULL, NULL
  UNION ALL SELECT '20260518120000', 'trigger:pools_simulation_edition_consistency',
    EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='pools' AND t.tgname='pools_simulation_edition_consistency'), NULL

  -- 20260518140000
  UNION ALL SELECT '20260518140000', 'function:join_nhl_active_edition',
    to_regprocedure('public.join_nhl_active_edition()') IS NOT NULL, NULL

  -- 20260519120000
  UNION ALL SELECT '20260519120000', 'table:admin_pilot_standings_snapshots',
    to_regclass('public.admin_pilot_standings_snapshots') IS NOT NULL, NULL
  UNION ALL SELECT '20260519120000', 'table:admin_pilot_verification_events',
    to_regclass('public.admin_pilot_verification_events') IS NOT NULL, NULL

  -- 20260520120000
  UNION ALL SELECT '20260520120000', 'table:contact_submissions',
    to_regclass('public.contact_submissions') IS NOT NULL, NULL

  -- 20260520140000
  UNION ALL SELECT '20260520140000', 'function:fetch_nhl_edition_standings',
    to_regprocedure('public.fetch_nhl_edition_standings(uuid)') IS NOT NULL, NULL

  -- 20260520150000
  UNION ALL SELECT '20260520150000', 'policy:nhl_series_select_own_pick_editions',
    EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='nhl_series' AND policyname='nhl_series_select_own_pick_editions'), NULL
  UNION ALL SELECT '20260520150000', 'policy:nhl_teams_select_own_pick_editions',
    EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='nhl_teams' AND policyname='nhl_teams_select_own_pick_editions'), NULL

  -- 20260520160000
  UNION ALL SELECT '20260520160000', 'function:fetch_nhl_public_entry_picks',
    to_regprocedure('public.fetch_nhl_public_entry_picks(uuid)') IS NOT NULL, NULL
  UNION ALL SELECT '20260520160000', 'function:fetch_nhl_public_entry_context',
    to_regprocedure('public.fetch_nhl_public_entry_context(uuid)') IS NOT NULL, NULL

  -- 20260520170000 (function body refresh; presence covered by 201600 signatures)
  UNION ALL SELECT '20260520170000', 'function:fetch_nhl_public_entry_picks (post-fix)',
    to_regprocedure('public.fetch_nhl_public_entry_picks(uuid)') IS NOT NULL, NULL

  -- 20260520180000
  UNION ALL SELECT '20260520180000', 'table:nhl_cf_series_picks',
    to_regclass('public.nhl_cf_series_picks') IS NOT NULL, NULL
  UNION ALL SELECT '20260520180000', 'table:nhl_scf_series_picks',
    to_regclass('public.nhl_scf_series_picks') IS NOT NULL, NULL
  UNION ALL SELECT '20260520180000', 'function:sync_nhl_cf_slots_from_r2',
    to_regprocedure('public.sync_nhl_cf_slots_from_r2(uuid)') IS NOT NULL, NULL
  UNION ALL SELECT '20260520180000', 'function:sync_nhl_scf_slots_from_cf',
    to_regprocedure('public.sync_nhl_scf_slots_from_cf(uuid)') IS NOT NULL, NULL

  -- 20260526193000
  UNION ALL SELECT '20260526193000', 'function:official_round_of_32_complete(uuid,uuid)',
    to_regprocedure('public.official_round_of_32_complete(uuid,uuid)') IS NOT NULL, NULL

  -- 20260527003000 data backfill heuristic
  UNION ALL SELECT '20260527003000', 'data:simulation_pools_missing_scoring',
    (SELECT COUNT(*) = 0 FROM public.pools p JOIN public.tournament_editions e ON e.id=p.tournament_edition_id
      WHERE p.is_simulation AND e.is_simulation AND p.group_advance_exact_points IS NULL AND p.group_advance_wrong_slot_points IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.scoring_rules sr WHERE sr.pool_id=p.id)),
    (SELECT CASE WHEN COUNT(*) = 0 THEN 'backfill_complete_or_n/a' ELSE COUNT(*)::text || ' pools still need backfill' END
      FROM public.pools p JOIN public.tournament_editions e ON e.id=p.tournament_edition_id
      WHERE p.is_simulation AND e.is_simulation AND p.group_advance_exact_points IS NULL AND p.group_advance_wrong_slot_points IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.scoring_rules sr WHERE sr.pool_id=p.id))

  -- 20260530120000
  UNION ALL SELECT '20260530120000', 'table:wc_live_daily_update_status',
    to_regclass('public.wc_live_daily_update_status') IS NOT NULL, NULL

  -- 20260530140000
  UNION ALL SELECT '20260530140000', 'table:activity_reactions',
    to_regclass('public.activity_reactions') IS NOT NULL, NULL
  UNION ALL SELECT '20260530140000', 'function:ashbracket_private_is_pool_participant',
    to_regprocedure('public.ashbracket_private_is_pool_participant(uuid)') IS NOT NULL, NULL
  UNION ALL SELECT '20260530140000', 'constraint:pool_activity includes announcement',
    EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace
      WHERE ns.nspname='public' AND t.relname='pool_activity' AND c.conname='pool_activity_type_check' AND pg_get_constraintdef(c.oid) LIKE '%announcement%'), NULL

  -- 20260601120000
  UNION ALL SELECT '20260601120000', 'column:pools.payment_type',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pools' AND column_name='payment_type'), NULL

  -- 20260601140000
  UNION ALL SELECT '20260601140000', 'column:pools.currency_code',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pools' AND column_name='currency_code'), NULL
  UNION ALL SELECT '20260601140000', 'function:ashbracket_pool_pot_summary_for_member',
    to_regprocedure('public.ashbracket_pool_pot_summary_for_member(uuid)') IS NOT NULL, NULL

  -- 20260601150000
  UNION ALL SELECT '20260601150000', 'function:peek_unclaimed_participants_for_join',
    to_regprocedure('public.peek_unclaimed_participants_for_join(uuid,text,text)') IS NOT NULL, NULL
  UNION ALL SELECT '20260601150000', 'function:is_joined_display_name_taken',
    to_regprocedure('public.is_joined_display_name_taken(uuid,text)') IS NOT NULL, NULL

  -- 20260602120000
  UNION ALL SELECT '20260602120000', 'table:nhl_draft26_entries',
    to_regclass('public.nhl_draft26_entries') IS NOT NULL, NULL
  UNION ALL SELECT '20260602120000', 'table:nhl_draft26_picks',
    to_regclass('public.nhl_draft26_picks') IS NOT NULL, NULL

  -- 20260603120000
  UNION ALL SELECT '20260603120000', 'function:fetch_nhl_draft26_public_entries',
    to_regprocedure('public.fetch_nhl_draft26_public_entries()') IS NOT NULL, NULL
  UNION ALL SELECT '20260603120000', 'function:nhl_draft26_save_picks(text[],text)',
    to_regprocedure('public.nhl_draft26_save_picks(text[],text)') IS NOT NULL, NULL

  -- 20260604120000
  UNION ALL SELECT '20260604120000', 'column:pools.ashbot_enabled',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pools' AND column_name='ashbot_enabled'), NULL

  -- 20260604140000
  UNION ALL SELECT '20260604140000', 'index:pool_activity_milestone_one_per_pool_source_key',
    to_regclass('public.pool_activity_milestone_one_per_pool_source_key') IS NOT NULL, NULL

  -- 20260605120000
  UNION ALL SELECT '20260605120000', 'data:sample_pool_lock_at',
    EXISTS (SELECT 1 FROM public.pools WHERE id='a0000001-0000-4000-8000-000000000001' AND lock_at='2026-06-11 03:59:00+00'),
    CASE WHEN EXISTS (SELECT 1 FROM public.pools WHERE id='a0000001-0000-4000-8000-000000000001') THEN 'sample_pool_exists' ELSE 'sample_pool_absent_noop' END

  -- 20260605140000
  UNION ALL SELECT '20260605140000', 'index:pool_activity_insight_one_per_pool_source_key',
    to_regclass('public.pool_activity_insight_one_per_pool_source_key') IS NOT NULL, NULL

  -- 20260606120000
  UNION ALL SELECT '20260606120000', 'table:pool_reminder_sends',
    to_regclass('public.pool_reminder_sends') IS NOT NULL, NULL

  -- 20260606130000
  UNION ALL SELECT '20260606130000', 'function:create_pool_for_current_user has wc lock',
    position('v_wc_lock' in pg_get_functiondef(p.oid)) > 0,
    CASE WHEN position('2026-06-11 16:00:00+00' in pg_get_functiondef(p.oid)) > 0 THEN 'extended_lock' WHEN position('2026-06-11 03:59:00+00' in pg_get_functiondef(p.oid)) > 0 THEN 'old_lock' ELSE 'no_lock_constant' END
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_pool_for_current_user'

  -- 20260610120000
  UNION ALL SELECT '20260610120000', 'function:move_world_cup_participant_to_pool',
    to_regprocedure('public.move_world_cup_participant_to_pool(uuid,uuid,uuid)') IS NOT NULL, NULL

  -- 20260610130000
  UNION ALL SELECT '20260610130000', 'function:ashbracket_list_directly_managed_pools',
    to_regprocedure('public.ashbracket_list_directly_managed_pools()') IS NOT NULL, NULL
  UNION ALL SELECT '20260610130000', 'move_rpc uses direct manager not global admin',
    NOT (position('ashbracket_can_manage_pool' in pg_get_functiondef(p.oid)) > 0),
    CASE WHEN position('ashbracket_private_pool_membership' in pg_get_functiondef(p.oid)) > 0 THEN 'uses_pool_membership' WHEN position('ashbracket_is_direct_pool_manager' in pg_get_functiondef(p.oid)) > 0 THEN 'uses_direct_pool_manager' ELSE 'unknown_auth' END
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='move_world_cup_participant_to_pool'

  -- 20260610140000
  UNION ALL SELECT '20260610140000', 'function:create_pool extended lock 16:00 UTC',
    position('2026-06-11 16:00:00+00' in pg_get_functiondef(p.oid)) > 0, NULL
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_pool_for_current_user'

  -- 20260610150000
  UNION ALL SELECT '20260610150000', 'function:ashbracket_is_direct_pool_manager',
    to_regprocedure('public.ashbracket_is_direct_pool_manager(uuid)') IS NOT NULL, NULL
  UNION ALL SELECT '20260610150000', 'data:creators_missing_pool_admin',
    (SELECT COUNT(*) = 0 FROM public.pools p WHERE p.created_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.pool_admins pa WHERE pa.pool_id=p.id AND pa.user_id=p.created_by_user_id)),
    (SELECT COALESCE(COUNT(*)::text, '0') FROM public.pools p WHERE p.created_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.pool_admins pa WHERE pa.pool_id=p.id AND pa.user_id=p.created_by_user_id))

  -- 20260610160000
  UNION ALL SELECT '20260610160000', 'move_rpc no display_name duplicate',
    NOT (position('d.display_name' in pg_get_functiondef(p.oid)) > 0), NULL
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='move_world_cup_participant_to_pool'

  -- 20260610170000
  UNION ALL SELECT '20260610170000', 'move_rpc service_role bypass',
    position('service_role' in pg_get_functiondef(p.oid)) > 0, NULL
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='move_world_cup_participant_to_pool'
  UNION ALL SELECT '20260610170000', 'grant:move_rpc to service_role',
    has_function_privilege('service_role', 'public.move_world_cup_participant_to_pool(uuid,uuid,uuid)', 'EXECUTE'), NULL
) checks
ORDER BY migration, check_name;
