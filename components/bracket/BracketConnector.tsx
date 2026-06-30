import { POSTER_BRACKET_ROWS } from "../../lib/bracket/posterBracketLayout";

type Props = {
  /** Number of feeder pairs (e.g. 4 for R32→R16). */
  pairCount: number;
  side: "left" | "right";
  /** Highlight each pair segment when the participant pick path is still alive. */
  highlightPairs?: readonly boolean[];
  /** Inner edge beside the center lane — shorten stubs so lines do not read into Final/Champion. */
  terminal?: "inner";
};

function lineColor(highlighted: boolean, faded: boolean): string {
  if (faded) {
    return highlighted ? "bg-ash-accent/25" : "bg-ash-border/25";
  }
  return highlighted ? "bg-ash-accent/55" : "bg-ash-border/55";
}

/**
 * CSS connector lines between bracket rounds.
 * Sits in an 8-row grid aligned with match cards on each half.
 */
export function BracketConnector({
  pairCount,
  side,
  highlightPairs = [],
  terminal,
}: Props) {
  const rowsPerPair = POSTER_BRACKET_ROWS / pairCount;
  const edge = side === "left" ? "right-0" : "left-0";
  const hStubOrigin = side === "left" ? "right-0" : "left-0";
  const isInnerTerminal = terminal === "inner";
  const stubWidth = isInnerTerminal ? "w-1/4" : "w-1/2";

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
        const color = lineColor(highlighted, isInnerTerminal);

        return (
          <div
            key={pairIdx}
            className="relative"
            style={{ gridRow: `${startRow} / ${endRow}` }}
          >
            {/* Horizontal stub toward the next round */}
            <div
              className={`absolute top-1/2 h-px -translate-y-1/2 ${stubWidth} ${color} ${hStubOrigin}`}
            />
            {/* Vertical line joining the pair */}
            <div
              className={`absolute top-[14%] bottom-[14%] w-px ${color} ${edge}`}
            />
            {/* Top feeder horizontal */}
            <div className={`absolute top-[14%] h-px ${stubWidth} ${color} ${hStubOrigin}`} />
            {/* Bottom feeder horizontal */}
            <div className={`absolute bottom-[14%] h-px ${stubWidth} ${color} ${hStubOrigin}`} />
          </div>
        );
      })}
    </div>
  );
}
