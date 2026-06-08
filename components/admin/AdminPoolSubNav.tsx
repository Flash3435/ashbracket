"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  poolId: string;
  /** When false, the Audit log entry is omitted (non-owner pool admins). */
  showAuditLogLink?: boolean;
};

const linkClass = (active: boolean) =>
  [
    "rounded-md px-2 py-1 text-sm transition",
    active
      ? "bg-ash-accent/15 font-medium text-ash-accent"
      : "text-ash-muted hover:bg-ash-body hover:text-ash-text",
  ].join(" ");

/**
 * Minimal horizontal nav for pool-scoped admin sections.
 */
export function AdminPoolSubNav({
  poolId,
  showAuditLogLink = false,
}: Props) {
  const pathname = usePathname() ?? "";
  const base = `/admin/pools/${poolId}`;

  const items: { href: string; label: string }[] = [
    { href: base, label: "Overview" },
    { href: `${base}/settings`, label: "Settings" },
    { href: `${base}/participants`, label: "Participants" },
    { href: `${base}/picks`, label: "Picks" },
    { href: `${base}/payments`, label: "Payments" },
    { href: `${base}/communications`, label: "Email" },
    { href: `${base}/standings`, label: "Standings" },
    { href: `${base}/admins`, label: "Admins" },
    ...(showAuditLogLink
      ? [{ href: `${base}/admins/history`, label: "Audit log" as const }]
      : []),
  ];

  return (
    <nav
      className="flex flex-wrap gap-1 border-b border-ash-border pb-3"
      aria-label="Pool admin sections"
    >
      {items.map((item) => {
        const adminsBase = `${base}/admins`;
        const auditPath = `${base}/admins/history`;
        const active =
          item.href === base
            ? pathname === base
            : item.href === adminsBase
              ? pathname === adminsBase ||
                (pathname.startsWith(`${adminsBase}/`) &&
                  !pathname.startsWith(auditPath))
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} className={linkClass(active)}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
