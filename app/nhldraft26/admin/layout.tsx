import Link from "next/link";
import { requireNhlDraft26GlobalAdminPage } from "@/lib/nhldraft26/requireNhlDraft26GlobalAdmin";

const SUBNAV = [
  { href: "/nhldraft26/admin", label: "Overview" },
  { href: "/nhldraft26/admin/prospects", label: "Prospects" },
  { href: "/nhldraft26/admin/results", label: "Results" },
];

export default async function NhlDraft26AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireNhlDraft26GlobalAdminPage("/nhldraft26/admin");

  return (
    <div className="space-y-6">
      <nav
        className="flex flex-wrap gap-x-4 gap-y-2 border-b border-amber-500/20 pb-3 text-sm"
        aria-label="NHL Draft 2026 admin"
      >
        {SUBNAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="font-medium text-amber-200/90 underline-offset-4 hover:text-slate-50 hover:underline"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
