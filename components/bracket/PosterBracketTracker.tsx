import type { LiveBracketMatch, LiveBracketTrackerModel } from "../../lib/bracket/liveBracketTracker";
import {
  connectorShouldHighlight,
  POSTER_BRACKET_ROWS,
  POSTER_CENTER_MIN_WIDTH_PX,
  POSTER_DESKTOP_MIN_WIDTH_PX,
  POSTER_LEFT_HALF,
  POSTER_RIGHT_HALF,
  qfFeederR16Indices,
  r16FeederR32Indices,
  sfFeederQfIndices,
  type PosterHalfLayout,
} from "../../lib/bracket/posterBracketLayout";
import type { Team } from "../../src/types/domain";
import { BracketConnector } from "./BracketConnector";
import { ChampionCard } from "./ChampionCard";
import { LiveRoundColumn } from "./LiveRoundColumn";
import { PosterBracketMatchCard } from "./PosterBracketMatchCard";

type Props = {
  tracker: LiveBracketTrackerModel;
  teamById: Map<string, Team>;
  matchEditHref?: string | null;
};

function roundLabel(round: "r32" | "r16" | "qf" | "sf"): string {
  switch (round) {
    case "r32":
      return "Round of 32";
    case "r16":
      return "Round of 16";
    case "qf":
      return "Quarter-finals";
    case "sf":
      return "Semi-finals";
  }
}

function roundShortLabel(round: "r32" | "r16" | "qf" | "sf"): string {
  switch (round) {
    case "r32":
      return "R32";
    case "r16":
      return "R16";
    case "qf":
      return "QF";
    case "sf":
      return "SF";
  }
}

function matchesForRound(
  tracker: LiveBracketTrackerModel,
  round: "r32" | "r16" | "qf" | "sf",
): LiveBracketMatch[] {
  switch (round) {
    case "r32":
      return tracker.roundOf32;
    case "r16":
      return tracker.roundOf16;
    case "qf":
      return tracker.quarterfinals;
    case "sf":
      return tracker.semifinals;
  }
}

function connectorHighlightsForR16(
  r32Matches: LiveBracketMatch[],
  r16Order: readonly number[],
): boolean[] {
  return r16Order.map((r16Idx) => {
    const [a, b] = r16FeederR32Indices(r16Idx);
    return connectorShouldHighlight(r32Matches, [a, b]);
  });
}

function connectorHighlightsForQf(
  r16Matches: LiveBracketMatch[],
  qfOrder: readonly number[],
): boolean[] {
  return qfOrder.map((qfIdx) => {
    const [a, b] = qfFeederR16Indices(qfIdx);
    return connectorShouldHighlight(r16Matches, [a, b]);
  });
}

function connectorHighlightsForSf(
  qfMatches: LiveBracketMatch[],
  sfIndex: number,
): boolean[] {
  const [a, b] = sfFeederQfIndices(sfIndex);
  return [connectorShouldHighlight(qfMatches, [a, b])];
}

function PosterRoundColumn({
  round,
  indices,
  span,
  tracker,
  teamById,
  matchEditHref,
}: {
  round: "r32" | "r16" | "qf" | "sf";
  indices: readonly number[];
  span: number;
  tracker: LiveBracketTrackerModel;
  teamById: Map<string, Team>;
  matchEditHref?: string | null;
}) {
  const matchList = matchesForRound(tracker, round);

  return (
    <div className="flex w-[140px] shrink-0 flex-col">
      <p
        className="mb-1 shrink-0 text-center text-[9px] font-semibold uppercase tracking-wide text-ash-muted"
        title={roundLabel(round)}
      >
        {roundShortLabel(round)}
      </p>
      <div
        className="grid flex-1 gap-y-1"
        style={{ gridTemplateRows: `repeat(${POSTER_BRACKET_ROWS}, minmax(0, 1fr))` }}
      >
        {indices.map((matchIdx, pos) => {
          const match = matchList[matchIdx];
          if (!match) return null;
          const rowStart = pos * span + 1;
          return (
            <div
              key={match.matchKey}
              className="flex items-center justify-center"
              style={{ gridRow: `${rowStart} / span ${span}` }}
            >
              <PosterBracketMatchCard
                match={match}
                teamById={teamById}
                matchEditHref={matchEditHref}
                compact
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PosterHalf({
  layout,
  side,
  tracker,
  teamById,
  matchEditHref,
}: {
  layout: PosterHalfLayout;
  side: "left" | "right";
  tracker: LiveBracketTrackerModel;
  teamById: Map<string, Team>;
  matchEditHref?: string | null;
}) {
  const r32 = matchesForRound(tracker, "r32");
  const r16 = matchesForRound(tracker, "r16");
  const qf = matchesForRound(tracker, "qf");

  const r16Highlights = connectorHighlightsForR16(r32, layout.r16);
  const qfHighlights = connectorHighlightsForQf(r16, layout.qf);
  const sfHighlights = connectorHighlightsForSf(qf, layout.sf);

  if (side === "left") {
    return (
      <div className="flex min-w-0 shrink-0 items-stretch">
        <PosterRoundColumn
          round="r32"
          indices={layout.r32}
          span={1}
          tracker={tracker}
          teamById={teamById}
          matchEditHref={matchEditHref}
        />
        <BracketConnector pairCount={4} side="left" highlightPairs={r16Highlights} />
        <PosterRoundColumn
          round="r16"
          indices={layout.r16}
          span={2}
          tracker={tracker}
          teamById={teamById}
          matchEditHref={matchEditHref}
        />
        <BracketConnector pairCount={2} side="left" highlightPairs={qfHighlights} />
        <PosterRoundColumn
          round="qf"
          indices={layout.qf}
          span={4}
          tracker={tracker}
          teamById={teamById}
          matchEditHref={matchEditHref}
        />
        <BracketConnector
          pairCount={1}
          side="left"
          highlightPairs={sfHighlights}
          terminal="inner"
        />
        <PosterRoundColumn
          round="sf"
          indices={[layout.sf]}
          span={8}
          tracker={tracker}
          teamById={teamById}
          matchEditHref={matchEditHref}
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 shrink-0 items-stretch">
      <PosterRoundColumn
        round="sf"
        indices={[layout.sf]}
        span={8}
        tracker={tracker}
        teamById={teamById}
        matchEditHref={matchEditHref}
      />
      <BracketConnector
        pairCount={1}
        side="right"
        highlightPairs={sfHighlights}
        terminal="inner"
      />
      <PosterRoundColumn
        round="qf"
        indices={layout.qf}
        span={4}
        tracker={tracker}
        teamById={teamById}
        matchEditHref={matchEditHref}
      />
      <BracketConnector pairCount={2} side="right" highlightPairs={qfHighlights} />
      <PosterRoundColumn
        round="r16"
        indices={layout.r16}
        span={2}
        tracker={tracker}
        teamById={teamById}
        matchEditHref={matchEditHref}
      />
      <BracketConnector pairCount={4} side="right" highlightPairs={r16Highlights} />
      <PosterRoundColumn
        round="r32"
        indices={layout.r32}
        span={1}
        tracker={tracker}
        teamById={teamById}
        matchEditHref={matchEditHref}
      />
    </div>
  );
}

function PosterCenter({
  tracker,
  teamById,
  matchEditHref,
}: {
  tracker: LiveBracketTrackerModel;
  teamById: Map<string, Team>;
  matchEditHref?: string | null;
}) {
  const finalMatch = tracker.final[0] ?? null;

  return (
    <div
      className="relative z-10 flex shrink-0 flex-col items-center px-4"
      style={{ width: POSTER_CENTER_MIN_WIDTH_PX, minWidth: POSTER_CENTER_MIN_WIDTH_PX }}
    >
      <div className="flex w-full max-w-[152px] flex-col">
        <p
          className="mb-1 shrink-0 text-center text-[9px] font-semibold uppercase tracking-wide text-transparent"
          aria-hidden
        >
          Final
        </p>
        <div
          className="grid gap-y-1"
          style={{
            gridTemplateRows: `repeat(${POSTER_BRACKET_ROWS}, minmax(2.25rem, auto))`,
          }}
        >
          {finalMatch ? (
            <div
              className="flex items-center justify-center"
              style={{ gridRow: "3 / 7" }}
            >
              <div className="w-full">
                <p className="mb-1 text-center text-[9px] font-semibold uppercase tracking-wide text-ash-muted">
                  Final
                </p>
                <PosterBracketMatchCard
                  match={finalMatch}
                  teamById={teamById}
                  matchEditHref={matchEditHref}
                />
                {tracker.finalHelperCopy ? (
                  <p className="mt-1.5 text-center text-[9px] leading-snug text-ash-muted">
                    {tracker.finalHelperCopy}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {tracker.showChampionCard ? (
        <div className="mt-6 w-full max-w-[152px] shrink-0">
          <ChampionCard champion={tracker.champion} teamById={teamById} />
        </div>
      ) : null}
    </div>
  );
}

function MobileColumnLayout({
  tracker,
  teamById,
  matchEditHref,
}: {
  tracker: LiveBracketTrackerModel;
  teamById: Map<string, Team>;
  matchEditHref?: string | null;
}) {
  return (
    <div className="flex min-w-[1240px] flex-nowrap gap-2 pb-1 lg:hidden">
      <LiveRoundColumn
        title="Round of 32"
        shortTitle="R32"
        matches={tracker.roundOf32}
        teamById={teamById}
        matchEditHref={matchEditHref}
      />
      <LiveRoundColumn
        title="Round of 16"
        shortTitle="R16"
        matches={tracker.roundOf16}
        teamById={teamById}
        matchEditHref={matchEditHref}
      />
      <LiveRoundColumn
        title="Quarter-finals"
        shortTitle="QF"
        matches={tracker.quarterfinals}
        teamById={teamById}
        matchEditHref={matchEditHref}
      />
      <LiveRoundColumn
        title="Semi-finals"
        shortTitle="SF"
        matches={tracker.semifinals}
        teamById={teamById}
        matchEditHref={matchEditHref}
      />
      <LiveRoundColumn
        title="Final"
        shortTitle="F"
        matches={tracker.final}
        teamById={teamById}
        matchEditHref={matchEditHref}
      />
      {tracker.showChampionCard ? (
        <div className="flex min-w-[120px] shrink-0 flex-col justify-start pl-2">
          <h3 className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-ash-muted sm:text-xs">
            Champion
          </h3>
          {tracker.finalHelperCopy ? (
            <p className="mb-2 text-center text-[9px] leading-snug text-ash-muted">
              {tracker.finalHelperCopy}
            </p>
          ) : null}
          <ChampionCard champion={tracker.champion} teamById={teamById} />
        </div>
      ) : null}
    </div>
  );
}

export function PosterBracketTracker({ tracker, teamById, matchEditHref }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-center text-[10px] text-ash-muted lg:hidden">
        Scroll to see full bracket →
      </p>
      <div
        className="overflow-x-auto rounded-xl border border-ash-border bg-ash-body/20 p-2 sm:p-4 lg:overflow-x-visible"
        role="region"
        aria-label="Live participant bracket tracker"
      >
        <div
          className="mx-auto hidden w-fit grid-cols-[auto_280px_auto] items-start justify-center gap-x-3 lg:grid"
          style={{ minWidth: `min(100%, ${POSTER_DESKTOP_MIN_WIDTH_PX}px)` }}
        >
          <PosterHalf
            layout={POSTER_LEFT_HALF}
            side="left"
            tracker={tracker}
            teamById={teamById}
            matchEditHref={matchEditHref}
          />
          <PosterCenter tracker={tracker} teamById={teamById} matchEditHref={matchEditHref} />
          <PosterHalf
            layout={POSTER_RIGHT_HALF}
            side="right"
            tracker={tracker}
            teamById={teamById}
            matchEditHref={matchEditHref}
          />
        </div>
        <MobileColumnLayout tracker={tracker} teamById={teamById} matchEditHref={matchEditHref} />
      </div>
      <p className="hidden text-center text-[10px] text-ash-muted lg:block">
        Lines highlight when your pick is still alive in that part of the bracket.
      </p>
    </div>
  );
}
