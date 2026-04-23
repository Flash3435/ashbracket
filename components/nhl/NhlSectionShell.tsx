"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navBase =
  "text-sm font-medium transition-colors duration-200 border-b border-transparent pb-0.5";
const navInactive = `${navBase} text-slate-400 hover:text-slate-100`;
const navActive = `${navBase} text-slate-100 border-blue-400/50`;

type NavItem = { href: string; label: string; match?: "exact" | "prefix" };

const NAV_ITEMS: NavItem[] = [
  { href: "/nhl", label: "Home", match: "exact" },
  { href: "/nhl/rules", label: "Rules" },
  { href: "/nhl/standings", label: "Standings" },
  { href: "/nhl/picks", label: "Picks" },
  { href: "/nhl/admin", label: "Admin" },
];

function NavLink({
  href,
  label,
  pathname,
  match = "prefix",
}: NavItem & { pathname: string }) {
  const pathOnly = href.split("?")[0] ?? "";
  const isActive =
    match === "exact"
      ? pathname === pathOnly
      : pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
  return (
    <Link href={href} className={isActive ? navActive : navInactive}>
      {label}
    </Link>
  );
}

export function NhlSectionShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-blue-950/35 via-ash-body to-ash-body">
      <header className="sticky top-0 z-50 border-b border-blue-500/25 bg-slate-950/90 shadow-[0_1px_0_0_rgba(59,130,246,0.12)] backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-3.5">
          <Link
            href="/nhl"
            className="flex shrink-0 items-baseline gap-2 focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400/60"
            aria-label="AshBracket NHL — home"
          >
            <span className="text-lg font-semibold tracking-tight text-ash-text">
              AshBracket
            </span>
            <span className="rounded-md border border-blue-400/35 bg-blue-600/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-blue-100">
              NHL
            </span>
          </Link>
          <nav
            className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end"
            aria-label="NHL section"
          >
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.href} pathname={pathname} {...item} />
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-auto w-full border-t border-blue-500/15 bg-slate-950/40 py-5">
        <p className="text-center text-sm text-slate-500">
          © 2026 AshBracket · NHL section
        </p>
      </footer>
    </div>
  );
}
