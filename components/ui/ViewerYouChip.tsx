type Props = {
  className?: string;
};

/** Subtle badge for signed-in viewers on public pool / participant pages. */
export function ViewerYouChip({ className = "" }: Props) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border border-sky-500/35 bg-sky-950/45 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-200 ${className}`}
    >
      You
    </span>
  );
}
