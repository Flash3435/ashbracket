type Props = {
  variant: "live" | "simulation";
  editionLabel?: string;
  poolName?: string;
  className?: string;
  /** Public pool pages use participant-facing copy instead of admin editing language. */
  audience?: "admin" | "public";
};

export function SimulationModeBanner({
  variant,
  editionLabel,
  poolName,
  className = "",
  audience = "admin",
}: Props) {
  const isSimulation = variant === "simulation";
  const isPublic = audience === "public";

  return (
    <div
      role="status"
      className={`rounded-lg border px-4 py-3 text-sm ${
        isSimulation
          ? "border-amber-600/50 bg-amber-950/35 text-amber-100"
          : "border-emerald-800/50 bg-emerald-950/30 text-emerald-100"
      } ${className}`}
    >
      <p className="font-semibold">
        {isSimulation
          ? isPublic
            ? "Test pool · simulated scores"
            : "Simulation · test data"
          : "Live tournament data"}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed opacity-90">
        {isSimulation ? (
          isPublic ? (
            <>
              Standings on this page come from <strong>simulated match results</strong>{" "}
              for practice — not the live World Cup tournament.
              {poolName ? (
                <>
                  {" "}
                  Pool: <span className="font-medium">{poolName}</span>.
                </>
              ) : null}
            </>
          ) : (
            <>
              You are editing outcomes for a <strong>simulation edition</strong>.
              Changes here affect only simulation pools tied to this edition — not
              real money pools or the live official bracket.
              {poolName ? (
                <>
                  {" "}
                  Pool: <span className="font-medium">{poolName}</span>.
                </>
              ) : null}
            </>
          )
        ) : (
          <>
            You are editing the <strong>live official</strong> tournament results
            used by production pools. Do not use this page for practice or test
            scores.
          </>
        )}
        {editionLabel ? (
          <>
            {" "}
            Edition: <span className="font-mono text-xs">{editionLabel}</span>.
          </>
        ) : null}
      </p>
    </div>
  );
}
