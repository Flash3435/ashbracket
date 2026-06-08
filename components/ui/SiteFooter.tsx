export function SiteFooter() {
  return (
    <footer className="mt-auto w-full border-t border-ash-border bg-ash-body py-6">
      <p className="text-center text-sm text-ash-footer">© 2026 AshBracket</p>
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
