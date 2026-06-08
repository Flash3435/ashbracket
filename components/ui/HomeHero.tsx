import Image from "next/image";
import Link from "next/link";

export function HomeHero() {
  return (
    <section
      className="w-full border-b border-ash-border bg-ash-body px-4 py-14 sm:py-16"
      aria-label="Welcome"
    >
      <div className="mx-auto max-w-3xl text-center">
        <div className="mx-auto flex w-full max-w-xl justify-center sm:max-w-2xl md:max-w-3xl">
          <Image
            src="/ash-bracket-logo.png"
            alt="AshBracket World Cup Football Pool"
            width={677}
            height={369}
            priority
            className="h-auto w-full max-h-[min(42vw,280px)] object-contain object-center sm:max-h-[min(38vw,320px)] md:max-h-80"
          />
        </div>
        <h1 className="mt-6 text-2xl font-bold leading-tight tracking-tight text-ash-text sm:mt-8 sm:text-3xl md:text-4xl">
          Run your own private World Cup pool.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ash-muted sm:mt-5 sm:text-lg">
          Create a pool, invite your group, collect picks, and track the competition in one place.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup/organizer" className="btn-primary">
            Create a Pool
          </Link>
          <Link href="#how-it-works" className="btn-ghost">
            How It Works
          </Link>
        </div>
      </div>
    </section>
  );
}
