import Link from "next/link";

type ViewMode = "list" | "bracket";

type Props = {
  current: ViewMode;
  listHref: string;
  bracketHref: string;
  /** Defaults: “List view” / “Bracket view”. */
  listLabel?: string;
  bracketLabel?: string;
};

/**
 * Server-friendly list / bracket toggle (uses navigation so picks stay shareable as URLs).
 */
export function PicksViewToggle({
  current,
  listHref,
  bracketHref,
  listLabel = "List view",
  bracketLabel = "Bracket view",
}: Props) {
  const pill =
    "inline-flex items-center rounded-md px-3 py-1.5 text-xs font-semibold transition-colors";
  const active = "bg-ash-accent/25 text-ash-accent ring-1 ring-ash-accent/40";
  const idle =
    "bg-ash-body/40 text-ash-muted ring-1 ring-ash-border/60 hover:bg-ash-body/60 hover:text-ash-text";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
          View
        </span>
        <div className="inline-flex gap-1 rounded-lg border border-ash-border/70 bg-ash-body/25 p-1">
          <Link href={listHref} className={`${pill} ${current === "list" ? active : idle}`}>
            {listLabel}
          </Link>
          <Link
            href={bracketHref}
            className={`${pill} ${current === "bracket" ? active : idle}`}
          >
            {bracketLabel}
          </Link>
        </div>
      </div>
      <p className="max-w-2xl text-xs leading-relaxed text-ash-muted">
        Bracket View shows how your picks fit together across the tournament. Some Round of 32
        slots depend on which third-place groups qualify — fill all eight third-place advancers so
        we can apply the official Annex C routing.
      </p>
    </div>
  );
}
