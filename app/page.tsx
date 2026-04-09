import { HomeHero } from "@/components/ui/HomeHero";
import { HomeMarketingSections } from "@/components/ui/HomeMarketingSections";
import { PageContainer } from "@/components/ui/PageContainer";

export default function HomePage() {
  return (
    <>
      <HomeHero />
      <PageContainer compactBottom>
        <HomeMarketingSections />
      </PageContainer>
    </>
  );
}
