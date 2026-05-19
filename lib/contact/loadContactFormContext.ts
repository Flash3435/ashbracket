import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import type { ContactRoleValue } from "./contactFormConstants";

export type ContactPoolSuggestion = {
  label: string;
  value: string;
};

export type ContactFormContext = {
  defaultEmail: string;
  defaultName: string;
  defaultRole: ContactRoleValue | "";
  poolSuggestions: ContactPoolSuggestion[];
  userId: string | null;
};

export async function loadContactFormContext(): Promise<ContactFormContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      defaultEmail: "",
      defaultName: "",
      defaultRole: "",
      poolSuggestions: [],
      userId: null,
    };
  }

  const site = getSiteUrl();
  const poolSuggestions: ContactPoolSuggestion[] = [];
  const seen = new Set<string>();

  const { data: orgAdminRows } = await supabase
    .from("pool_admins")
    .select("pools (id, name, join_code)")
    .eq("user_id", user.id);

  const organizedPools = (
    (orgAdminRows as { pools: { id: string; name: string; join_code: string | null } | null }[] | null) ??
    []
  )
    .map((r) => r.pools)
    .filter(
      (p): p is { id: string; name: string; join_code: string | null } =>
        p != null,
    );

  for (const pool of organizedPools) {
    const adminUrl = `${site}/admin/pools/${pool.id}`;
    const label = pool.join_code
      ? `${pool.name} (organizer) — ${adminUrl}`
      : `${pool.name} (organizer) — ${adminUrl}`;
    if (!seen.has(pool.id)) {
      seen.add(pool.id);
      poolSuggestions.push({ label: pool.name, value: label });
    }
  }

  const { data: participantRows } = await supabase
    .from("participants")
    .select("id, pool_id")
    .eq("user_id", user.id);

  const participants = participantRows ?? [];
  const participantByPoolId = new Map(
    participants.map((p) => [p.pool_id as string, p.id as string]),
  );
  const participantPoolIds = [
    ...new Set(participants.map((p) => p.pool_id as string)),
  ].filter((id) => !seen.has(id));

  if (participantPoolIds.length > 0) {
    const { data: participantPools } = await supabase
      .from("pools")
      .select("id, name, join_code")
      .in("id", participantPoolIds);

    for (const pool of participantPools ?? []) {
      if (seen.has(pool.id)) continue;
      seen.add(pool.id);
      const participantId = participantByPoolId.get(pool.id);
      const accountUrl = participantId
        ? `${site}/account?participant=${encodeURIComponent(participantId)}`
        : `${site}/account`;
      poolSuggestions.push({
        label: pool.name,
        value: `${pool.name} (participant) — ${accountUrl}`,
      });
    }
  }

  let defaultRole: ContactRoleValue | "" = "";
  if (organizedPools.length > 0) {
    defaultRole = "organizer";
  } else if (participants.length > 0) {
    defaultRole = "participant";
  }

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const metaName =
    typeof meta?.full_name === "string"
      ? meta.full_name.trim()
      : typeof meta?.name === "string"
        ? meta.name.trim()
        : "";

  return {
    defaultEmail: user.email ?? "",
    defaultName: metaName,
    defaultRole,
    poolSuggestions,
    userId: user.id,
  };
}
