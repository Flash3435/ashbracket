import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto w-full border-t border-ash-border bg-ash-body py-6">
      <p className="text-center text-sm text-ash-footer">
        © 2026 AshBracket
        <span className="mx-2 text-ash-border" aria-hidden>
          ·
        </span>
        <Link href="/contact" className="ash-link">
          Contact
        </Link>
      </p>
      <div className="clicky-badge" aria-hidden="true">
        <a
          title="GDPR-compliant Web Analytics"
          href="https://clicky.com/101504073"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            alt="Clicky"
            src="https://static.getclicky.com/media/links/badge.gif"
            className="border-0"
          />
        </a>
      </div>
    </footer>
  );
}
