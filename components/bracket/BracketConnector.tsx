import { POSTER_BRACKET_ROWS } from "../../lib/bracket/posterBracketLayout";

type Props = {
  /** Number of feeder pairs (e.g. 4 for R32→R16). */
  pairCount: number;
  side: "left" | "right";
  /** Highlight each pair segment when the participant pick path is still alive. */
  highlightPairs?: readonly boolean[];
};

function lineColor(highlighted: boolean): string {
  return highlighted ? "bg-ash-accent/55" : "bg-ash-border/55";
}

/**
 * CSS connector lines between bracket rounds.
 * Sits in an 8-row grid aligned with match cards on each half.
 */
export function BracketConnector({ pairCount, side, highlightPairs = [] }: Props) {
  const rowsPerPair = POSTER_BRACKET_ROWS / pairCount;
  const edge = side === "left" ? "right-0" : "left-0";
  const hStubOrigin = side === "left" ? "right-0" : "left-0";

  return (
    <div
      className="relative hidden w-5 shrink-0 lg:grid"
      style={{ gridTemplateRows: `repeat(${POSTER_BRACKET_ROWS}, minmax(0, 1fr))` }}
      aria-hidden
    >
      {Array.from({ length: pairCount }, (_, pairIdx) => {
        const startRow = pairIdx * rowsPerPair + 1;
        const endRow = startRow + rowsPerPair;
        const highlighted = highlightPairs[pairIdx] ?? false;
        const color = lineColor(highlighted);

        return (
          <div
            key={pairIdx}
            className="relative"
            style={{ gridRow: `${startRow} / ${endRow}` }}
          >
            {/* Horizontal stub toward the next round */}
            <div
              className={`absolute top-1/2 h-px w-1/2 -translate-y-1/2 ${color} ${hStubOrigin}`}
            />
            {/* Vertical line joining the pair */}
            <div
              className={`absolute top-[14%] bottom-[14%] w-px ${color} ${edge}`}
            />
            {/* Top feeder horizontal */}
            <div className={`absolute top-[14%] h-px w-1/2 ${color} ${hStubOrigin}`} />
            {/* Bottom feeder horizontal */}
            <div className={`absolute bottom-[14%] h-px w-1/2 ${color} ${hStubOrigin}`} />
          </div>
        );
      })}
    </div>
  );
}
