type AshBotCommentaryLineProps = {
  text: string;
};

/** Secondary AshBot line nested under an activity card (not a separate feed item). */
export function AshBotCommentaryLine({ text }: AshBotCommentaryLineProps) {
  return (
    <p
      className="mt-2 rounded-md border border-emerald-500/20 bg-emerald-950/25 px-2.5 py-1.5 text-xs leading-snug text-slate-400"
      aria-label={`AshBot: ${text}`}
    >
      <span className="font-semibold text-emerald-400/90" aria-hidden>
        🤖 AshBot:
      </span>{" "}
      {text}
    </p>
  );
}
