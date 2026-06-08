import Link from "next/link";

export type AccountPicksProfileLinkItem = {
  id: string;
  displayName: string;
  poolName: string;
};

type AccountPicksProfileLinksProps = {
  profiles: AccountPicksProfileLinkItem[];
  selectedId: string | null;
  /** When set, each profile row also links to this summary path with `?participant=`. */
  summaryBasePath?: string;
  /** When set, each profile row also links to pool activity with `?participant=`. */
  activityBasePath?: string;
  /** Heading when multiple profiles (defaults to edit-oriented copy). */
  multiProfileHeading?: string;
};

export function AccountPicksProfileLinks({
  profiles,
  selectedId,
  summaryBasePath,
  activityBasePath,
  multiProfileHeading = "Choose profile to edit",
}: AccountPicksProfileLinksProps) {
  if (profiles.length <= 1) return null;

  return (
    <div className="ash-surface mb-8 p-4">
      <h2 className="mb-3 text-sm font-bold text-ash-text">
        {multiProfileHeading}
      </h2>
      <ul className="flex flex-col gap-2">
        {profiles.map((p) => {
          const active = selectedId === p.id;
          return (
            <li key={p.id}>
              <div
                className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                  active
                    ? "border-ash-accent bg-ash-accent/15 text-ash-text"
                    : "border-ash-border bg-ash-body/40 text-ash-muted"
                }`}
              >
                <span className="font-medium text-ash-text">{p.displayName}</span>
                <span className="mt-0.5 block text-xs text-ash-muted">
                  {p.poolName}
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    href={`/account/picks?participant=${p.id}`}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium underline-offset-2 hover:underline ${
                      active
                        ? "bg-ash-accent text-white hover:bg-ash-accent-hover"
                        : "bg-ash-body text-ash-accent ring-1 ring-ash-border hover:bg-ash-surface"
                    }`}
                  >
                    Edit picks
                  </Link>
                  {summaryBasePath ? (
                    <Link
                      href={`${summaryBasePath}?participant=${p.id}`}
                      className="rounded-md bg-ash-body px-2.5 py-1 text-xs font-medium text-ash-text ring-1 ring-ash-border hover:bg-ash-surface"
                    >
                      Summary
                    </Link>
                  ) : null}
                  {activityBasePath ? (
                    <Link
                      href={`${activityBasePath}?participant=${p.id}`}
                      className="rounded-md bg-ash-body px-2.5 py-1 text-xs font-medium text-ash-text ring-1 ring-ash-border hover:bg-ash-surface"
                    >
                      Activity
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
