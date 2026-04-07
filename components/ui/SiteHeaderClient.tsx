"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";

const textNavBase =
  "text-sm font-medium transition-colors duration-200 border-b border-transparent pb-0.5";
const textNavInactive = `${textNavBase} text-ash-muted hover:text-ash-text`;
const textNavActive = `${textNavBase} text-ash-text border-ash-accent/45`;

type TextNavLinkProps = {
  href: string;
  pathname: string;
  children: React.ReactNode;
  match?: "exact" | "prefix";
};

function TextNavLink({
  href,
  pathname,
  children,
  match = "exact",
}: TextNavLinkProps) {
  const pathOnly = href.split("?")[0] ?? "";
  const isActive =
    match === "prefix"
      ? pathname === pathOnly || pathname.startsWith(`${pathOnly}/`)
      : pathname === pathOnly;
  return (
    <Link href={href} className={isActive ? textNavActive : textNavInactive}>
      {children}
    </Link>
  );
}

export type SiteHeaderClientProps = {
  isSignedIn: boolean;
  isAdmin: boolean;
  /** True when the user has at least one pool profile (activity is per-pool, not public). */
  showActivityNav?: boolean;
};

export function SiteHeaderClient({
  isSignedIn,
  isAdmin,
  showActivityNav = false,
}: SiteHeaderClientProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-ash-border bg-ash-body">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="flex shrink-0 items-center focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ash-accent"
          aria-label="Ash Bracket — home"
        >
          <Image
            src="/ash-bracket-logo.png"
            alt="AshBracket World Cup Football Pool"
            width={677}
            height={369}
            className="h-9 w-auto object-contain object-left sm:h-10"
            priority
          />
        </Link>
        <nav
          className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-right sm:gap-x-6"
          aria-label="Main"
        >
          <TextNavLink href="/" pathname={pathname} match="exact">
            Home
          </TextNavLink>
          <TextNavLink href="/tournament" pathname={pathname}>
            Tournament
          </TextNavLink>
          <TextNavLink href="/rules" pathname={pathname}>
            Rules
          </TextNavLink>

          {!isSignedIn && (
            <>
              <TextNavLink href="/join" pathname={pathname}>
                Join
              </TextNavLink>
              <Link
                href="/login"
                className={
                  pathname === "/login"
                    ? "btn-ghost text-sm ring-1 ring-ash-accent/35 rounded-lg"
                    : "btn-ghost text-sm"
                }
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className={
                  pathname === "/signup"
                    ? "btn-primary text-sm ring-2 ring-ash-accent/40 ring-offset-2 ring-offset-ash-body rounded-lg"
                    : "btn-primary text-sm"
                }
              >
                Sign up
              </Link>
            </>
          )}

          {isSignedIn && (
            <>
              <TextNavLink href="/account" pathname={pathname} match="prefix">
                Account
              </TextNavLink>
              {showActivityNav ? (
                <TextNavLink
                  href="/account/activity"
                  pathname={pathname}
                  match="prefix"
                >
                  Activity
                </TextNavLink>
              ) : null}
              {isAdmin ? (
                <TextNavLink href="/admin" pathname={pathname} match="prefix">
                  Admin
                </TextNavLink>
              ) : null}
              <SignOutButton className="btn-ghost px-3 py-1.5 text-sm disabled:opacity-50" />
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
