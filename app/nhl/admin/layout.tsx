import Link from "next/link";
import { requireNhlGlobalAdminPage } from "@/lib/nhl/requireNhlGlobalAdmin";

const SUBNAV = [
  { href: "/nhl/admin", label: "Overview" },
  { href: "/nhl/admin/editions", label: "Editions" },
  { href: "/nhl/admin/teams", label: "Teams" },
  { href: "/nhl/admin/series", label: "Series" },
];

export default async function NhlAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireNhlGlobalAdminPage("/nhl/admin");

  return (
    <div className="space-y-6">
      <nav
        className="flex flex-wrap gap-x-4 gap-y-2 border-b border-blue-500/20 pb-3 text-sm"
        aria-label="NHL admin sections"
      >
        {SUBNAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="font-medium text-blue-200/90 underline-offset-4 hover:text-slate-50 hover:underline"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
