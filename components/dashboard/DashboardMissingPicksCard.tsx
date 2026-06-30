import Link from "next/link";
import type { DashboardMissingPicksModel } from "@/lib/dashboard/buildDashboardMissingPicks";

type Props = {
  model: DashboardMissingPicksModel;
  picksHref: string;
};

export function DashboardMissingPicksCard({ model, picksHref }: Props) {
  const isAction = model.tone === "action";

  return (
    <section
      className={`rounded-xl border p-4 ${
        isAction
          ? "border-amber-700/50 bg-amber-950/25"
          : "border-emerald-700/40 bg-emerald-950/20"
      }`}
      role="status"
    >
      <h2 className="text-base font-bold text-ash-text">{model.headline}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ash-muted">{model.detail}</p>
      {model.ctaLabel ? (
        <Link href={picksHref} className="btn-primary mt-3 inline-flex text-sm">
          {model.ctaLabel}
        </Link>
      ) : null}
    </section>
  );
}
