import {
  redirectLegacyPoolAdminPath,
  serializeLegacyAdminQuery,
} from "@/lib/admin/redirectLegacyPoolAdminPath";

export default async function LegacyAdminPaymentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : undefined;
  await redirectLegacyPoolAdminPath(
    "/payments",
    serializeLegacyAdminQuery(sp),
  );
}
