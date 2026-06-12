import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Player goal-scorer entry was replaced by team-level match stats. */
export default function AdminMatchGoalsRedirectPage() {
  redirect("/admin/tournament/match-stats");
}
