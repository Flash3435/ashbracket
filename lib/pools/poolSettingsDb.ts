/** Row shape from `pools` for the admin settings form. */
export type PoolSettingsRow = {
  id: string;
  name: string;
  is_public: boolean;
  show_public_rules: boolean;
  lock_at: string | null;
};

export type PoolSettingsEditable = {
  name: string;
  isPublic: boolean;
  showPublicRules: boolean;
  lockAt: string | null;
};

export function mapPoolSettingsRow(row: PoolSettingsRow): PoolSettingsEditable {
  return {
    name: row.name,
    isPublic: row.is_public,
    showPublicRules: row.show_public_rules,
    lockAt: row.lock_at,
  };
}
