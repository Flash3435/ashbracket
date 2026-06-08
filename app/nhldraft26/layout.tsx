import { NhlDraft26SectionShell } from "@/components/nhldraft26/NhlDraft26SectionShell";
import { isGlobalAdmin } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "NHL Draft 2026 Pick'em",
    template: "%s · NHL Draft '26",
  },
  description:
    "Predict the top 10 picks in the 2026 NHL Draft — isolated Pick'em game on AshBracket.",
};

export default async function NhlDraft26SectionLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const showAdminNav = user ? await isGlobalAdmin(supabase) : false;

  return (
    <NhlDraft26SectionShell isSignedIn={!!user} showAdminNav={showAdminNav}>
      {children}
    </NhlDraft26SectionShell>
  );
}
