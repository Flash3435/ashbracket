import { ContactForm } from "@/components/contact/ContactForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { loadContactFormContext } from "@/lib/contact/loadContactFormContext";

export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const ctx = await loadContactFormContext();

  return (
    <PageContainer>
      <PageTitle
        title="Contact us"
        description="Questions, issues, or feedback? Send us a message."
      />
      <p className="mb-6 text-sm text-ash-muted">
        We read every submission. We are a small team, so we cannot promise an
        immediate reply — we will respond by email when we can.
      </p>
      <ContactForm
        defaultEmail={ctx.defaultEmail}
        defaultName={ctx.defaultName}
        defaultRole={ctx.defaultRole}
        poolSuggestions={ctx.poolSuggestions}
      />
    </PageContainer>
  );
}
