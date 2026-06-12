import { loadPicksDeadlineBannerContext } from "@/lib/pool/loadPicksDeadlineBannerContext";
import { createClient } from "@/lib/supabase/server";
import { PicksDeadlineBanner } from "./PicksDeadlineBanner";

type Props = {
  poolId: string;
  className?: string;
};

/** Server wrapper: loads pool deadline context and renders the banner when applicable. */
export async function PicksDeadlineBannerFromPool({
  poolId,
  className,
}: Props) {
  const supabase = await createClient();
  const model = await loadPicksDeadlineBannerContext(supabase, poolId);
  if (!model) return null;
  return <PicksDeadlineBanner {...model} className={className} />;
}
