import { ProductionEnvironmentBanner } from "@/components/admin/ProductionEnvironmentBanner";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ProductionEnvironmentBanner />
      {children}
    </>
  );
}
