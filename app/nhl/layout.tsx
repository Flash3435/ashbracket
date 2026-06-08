import type { Metadata } from "next";
import { NhlSectionShell } from "@/components/nhl/NhlSectionShell";
import { isGlobalAdmin } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "NHL Playoffs",
    template: "%s · AshBracket NHL",
  },
  description:
    "NHL playoff pool on AshBracket—read-only bracket preview, rules, and standings context while the section is under active development.",
};

export default async function NhlSectionLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const showNhlAdminNav = user ? await isGlobalAdmin(supabase) : false;

  return (
    <NhlSectionShell isSignedIn={!!user} showNhlAdminNav={showNhlAdminNav}>
      {children}
    </NhlSectionShell>
  );
}
