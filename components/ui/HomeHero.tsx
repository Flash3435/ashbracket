import Image from "next/image";
import Link from "next/link";

type HomeHeroProps = {
  primaryCtaHref: string;
  primaryCtaLabel: string;
};

export function HomeHero({ primaryCtaHref, primaryCtaLabel }: HomeHeroProps) {
  return (
    <section
      className="w-full border-b border-ash-border bg-ash-body px-4 py-14 sm:py-16"
      aria-label="Welcome"
    >
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="mx-auto flex w-full max-w-xl justify-center sm:max-w-2xl md:max-w-3xl">
          <Image
            src="/ash-bracket-logo.png"
            alt="AshBracket World Cup Football Pool"
            width={677}
            height={369}
            priority
            className="h-auto w-full max-h-[min(42vw,280px)] object-contain object-center sm:max-h-[min(38vw,320px)] md:max-h-80"
          />
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-ash-muted sm:mt-6 sm:text-lg">
          Run your own World Cup pool. Track standings. Crown a winner.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href={primaryCtaHref} className="btn-primary">
            {primaryCtaLabel}
          </Link>
          <Link href="/rules" className="btn-ghost">
            View Rules
          </Link>
        </div>
      </div>
    </section>
  );
}
