import Link from "next/link";

export type AccountPicksProfileLinkItem = {
  id: string;
  displayName: string;
  poolName: string;
};

type AccountPicksProfileLinksProps = {
  profiles: AccountPicksProfileLinkItem[];
  selectedId: string | null;
};

export function AccountPicksProfileLinks({
  profiles,
  selectedId,
}: AccountPicksProfileLinksProps) {
  if (profiles.length <= 1) return null;

  return (
    <div className="mb-8 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900">
        Choose profile to edit
      </h2>
      <ul className="flex flex-col gap-2">
        {profiles.map((p) => {
          const active = selectedId === p.id;
          return (
            <li key={p.id}>
              <Link
                href={`/account/picks?participant=${p.id}`}
                className={`block rounded-md border px-3 py-2 text-sm transition-colors ${
                  active
                    ? "border-emerald-600 bg-emerald-50 font-medium text-emerald-900"
                    : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-zinc-300"
                }`}
              >
                <span className="font-medium">{p.displayName}</span>
                <span className="mt-0.5 block text-xs text-zinc-500">
                  {p.poolName}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
