type AshBotCommentaryLineProps = {
  text: string;
};

/** Subtle nested AshBot commentary (not a separate feed item). */
export function AshBotCommentaryLine({ text }: AshBotCommentaryLineProps) {
  return (
    <p
      className="mt-1.5 border-l-2 border-emerald-500/35 pl-2 text-[11px] leading-snug text-ash-muted sm:text-xs"
      aria-label={`AshBot: ${text}`}
    >
      <span className="font-medium text-emerald-400/75" aria-hidden>
        🤖 AshBot:
      </span>{" "}
      {text}
    </p>
  );
}
