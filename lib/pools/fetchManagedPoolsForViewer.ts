import type { SupabaseClient } from "@supabase/supabase-js";

/** Row shape returned by `ashbracket_list_managed_pools` (full `public.pools` row). */
export type ManagedPoolRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  lock_at: string | null;
  is_public: boolean;
  show_public_rules: boolean;
  ashbot_enabled: boolean;
  join_code: string | null;
  created_by_user_id: string | null;
  entry_fee_cents: number | null;
  payment_type: string;
  entry_fee_label: string | null;
  entry_fee_amount: number | string | null;
  payment_instructions: string | null;
  currency_code: string;
  show_pot_to_participants: boolean;
  prize_distribution_json: unknown;
  group_advance_exact_points: string | number | null;
  group_advance_wrong_slot_points: string | number | null;
  tie_break_note: string | null;
  tournament_edition_id: string;
  is_simulation: boolean;
};

/**
 * Pools the current session may manage (global admins: all pools; pool admins: assigned only).
 */
export async function fetchManagedPoolsForCurrentUser(
  supabase: SupabaseClient,
): Promise<{ data: ManagedPoolRow[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc("ashbracket_list_managed_pools");
  if (error) {
    return { data: null, error: error.message };
  }
  return { data: (data as ManagedPoolRow[] | null) ?? [], error: null };
}
