import {
  redirectLegacyPoolAdminPath,
  serializeLegacyAdminQuery,
} from "@/lib/admin/redirectLegacyPoolAdminPath";

export default async function LegacyAdminPicksPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : undefined;
  await redirectLegacyPoolAdminPath(
    "/picks",
    serializeLegacyAdminQuery(sp),
  );
}
