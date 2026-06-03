"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navBase =
  "text-sm font-medium transition-colors duration-200 border-b border-transparent pb-0.5";
const navInactive = `${navBase} text-slate-400 hover:text-slate-100`;
const navActive = `${navBase} text-slate-100 border-amber-400/50`;

type NavItem = {
  href: string;
  label: string;
  match?: "exact" | "prefix";
  requiresGlobalAdmin?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/nhldraft26", label: "Home", match: "exact" },
  { href: "/nhldraft26/picks", label: "My picks" },
  { href: "/nhldraft26/rules", label: "Rules" },
  { href: "/nhldraft26/leaderboard", label: "Leaderboard" },
  { href: "/nhldraft26/admin", label: "Admin", requiresGlobalAdmin: true },
];

function NavLink({
  href,
  label,
  pathname,
  match = "prefix",
}: Omit<NavItem, "requiresGlobalAdmin"> & { pathname: string }) {
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

export function NhlDraft26SectionShell({
  children,
  isSignedIn,
  showAdminNav,
}: {
  children: React.ReactNode;
  isSignedIn: boolean;
  showAdminNav: boolean;
}) {
  const pathname = usePathname();
  const navItems = NAV_ITEMS.filter(
    (item) => !item.requiresGlobalAdmin || showAdminNav,
  );
  const returnPath =
    pathname &&
    (pathname === "/nhldraft26" || pathname.startsWith("/nhldraft26/"))
      ? pathname
      : "/nhldraft26";
  const loginHref = `/nhldraft26/login?next=${encodeURIComponent(returnPath)}`;
  const signupHref = `/nhldraft26/signup?next=${encodeURIComponent(returnPath)}`;

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-amber-950/25 via-ash-body to-ash-body">
      <header className="sticky top-0 z-50 border-b border-amber-500/25 bg-slate-950/90 shadow-[0_1px_0_0_rgba(245,158,11,0.12)] backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-3.5">
          <Link
            href="/nhldraft26"
            className="flex shrink-0 items-baseline gap-2 focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400/60"
            aria-label="NHL Draft 2026 Pick'em — home"
          >
            <span className="text-lg font-semibold tracking-tight text-ash-text">
              AshBracket
            </span>
            <span className="rounded-md border border-amber-400/35 bg-amber-600/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-100">
              Draft &apos;26
            </span>
          </Link>
          <nav
            className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end"
            aria-label="NHL Draft 2026"
          >
            {navItems.map((item) => (
              <NavLink key={item.href} pathname={pathname} {...item} />
            ))}
            {!isSignedIn ? (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 border-l border-amber-500/25 pl-3 text-sm sm:pl-4">
                <Link
                  href={loginHref}
                  className="font-medium text-slate-400 no-underline transition-colors hover:text-slate-100"
                >
                  Sign in
                </Link>
                <span className="text-slate-600" aria-hidden>
                  ·
                </span>
                <Link
                  href={signupHref}
                  className="font-medium text-slate-400 no-underline transition-colors hover:text-slate-100"
                >
                  Sign up
                </Link>
              </span>
            ) : null}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-auto w-full border-t border-amber-500/15 bg-slate-950/40 py-5">
        <p className="text-center text-sm text-slate-500">
          © 2026 AshBracket · NHL Draft 2026 Pick&apos;em
        </p>
      </footer>
    </div>
  );
}
