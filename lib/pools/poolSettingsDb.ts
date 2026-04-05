/** Row shape from `pools` for the admin settings form. */
export type PoolSettingsRow = {
  id: string;
  name: string;
  is_public: boolean;
  lock_at: string | null;
};

export type PoolSettingsEditable = {
  name: string;
  isPublic: boolean;
  lockAt: string | null;
};

export function mapPoolSettingsRow(row: PoolSettingsRow): PoolSettingsEditable {
  return {
    name: row.name,
    isPublic: row.is_public,
    lockAt: row.lock_at,
  };
}
