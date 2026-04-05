import Link from "next/link";

const navLinkClass =
  "text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900";

export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200/80 bg-white">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-zinc-900"
        >
          AshBracket
        </Link>
        <nav
          className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-right sm:gap-x-6"
          aria-label="Main"
        >
          <Link href="/" className={navLinkClass}>
            Home
          </Link>
          <Link href="/tournament" className={navLinkClass}>
            Tournament
          </Link>
          <Link href="/rules" className={navLinkClass}>
            Rules
          </Link>
          <Link href="/join" className={navLinkClass}>
            Join
          </Link>
          <Link href="/account" className={navLinkClass}>
            Account
          </Link>
          <Link href="/login" className={navLinkClass}>
            Sign in
          </Link>
          <Link href="/signup" className={navLinkClass}>
            Sign up
          </Link>
          <Link
            href="/login?next=/admin"
            className="text-xs font-medium text-zinc-400 hover:text-zinc-600"
          >
            Organizer
          </Link>
        </nav>
      </div>
    </header>
  );
}
