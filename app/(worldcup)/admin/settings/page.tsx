import {
  redirectLegacyPoolAdminPath,
  serializeLegacyAdminQuery,
} from "@/lib/admin/redirectLegacyPoolAdminPath";

export default async function LegacyAdminSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : undefined;
  await redirectLegacyPoolAdminPath(
    "/settings",
    serializeLegacyAdminQuery(sp),
  );
}
