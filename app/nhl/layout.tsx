import type { Metadata } from "next";
import { NhlSectionShell } from "@/components/nhl/NhlSectionShell";

export const metadata: Metadata = {
  title: {
    default: "NHL Playoffs",
    template: "%s · AshBracket NHL",
  },
  description:
    "NHL playoff pool — picks and standings. This section is under active development.",
};

export default function NhlSectionLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <NhlSectionShell>{children}</NhlSectionShell>;
}
