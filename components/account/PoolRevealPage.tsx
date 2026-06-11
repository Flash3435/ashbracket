"use client";

import Link from "next/link";
import { useState } from "react";
import { EveryonesPicksSection } from "@/components/account/EveryonesPicksSection";
import { TeamFlagName } from "@/components/tournament/TeamFlagName";
import type { PoolRevealData } from "@/lib/account/buildPoolReveal";

type Props = {
  data: PoolRevealData;
  poolName: string;
  picksHref: string;
  activityHref: string;
  dashboardHref: string;
};

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-ash-border bg-ash-body/40 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ash-muted">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-ash-text">{value}</p>
      {detail ? <p className="mt-1 text-xs text-ash-muted">{detail}</p> : null}
    </div>
  );
}

function ParticipantPickList({
  label,
  expandedLabel,
  names,
  emptyMessage,
}: {
  label: string;
  expandedLabel: string;
  names: string[];
  emptyMessage?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-xs font-medium text-ash-accent underline-offset-2 hover:underline"
      >
        {expanded ? expandedLabel : label}
      </button>
      {expanded ? (
        names.length > 0 ? (
          <ul className="mt-1.5 space-y-0.5 text-sm text-ash-muted">
            {names.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-sm italic text-ash-muted">{emptyMessage}</p>
        )
      ) : null}
    </div>
  );
}

function ChampionRow({
  pick,
  maxCount,
  showNames,
}: {
  pick: PoolRevealData["championPicks"][number];
  maxCount: number;
  showNames: boolean;
}) {
  const barWidth = maxCount > 0 ? Math.round((pick.count / maxCount) * 100) : 0;
  const pickedNames = pick.participantNames ?? [];
  const notPickedNames = pick.notPickedParticipantNames ?? [];
  const canShowLists = showNames;

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <TeamFlagName
            countryCode={pick.teamCode ?? ""}
            teamName={pick.teamName}
            nameClassName="font-medium text-ash-text"
          />
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-ash-text">
            {pick.count} {pick.count === 1 ? "bracket" : "brackets"}
          </p>
          <p className="text-xs text-ash-muted">{pick.percentage}%</p>
        </div>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-ash-body"
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-ash-accent/80"
          style={{ width: `${barWidth}%` }}
        />
      </div>
      {canShowLists ? (
        <div className="mt-2 space-y-1.5">
          {pickedNames.length > 0 ? (
            <ParticipantPickList
              label={`Who picked ${pick.teamName}`}
              expandedLabel="Hide picks"
              names={pickedNames}
            />
          ) : null}
          <ParticipantPickList
            label="Who went another way"
            expandedLabel="Hide list"
            names={notPickedNames}
            emptyMessage="Nobody — everyone picked this."
          />
          <p className="text-[11px] text-ash-muted/80">Incomplete brackets excluded.</p>
        </div>
      ) : null}
    </li>
  );
}

function LockedState({
  data,
  picksHref,
  activityHref,
  dashboardHref,
}: {
  data: PoolRevealData;
  picksHref: string;
  activityHref: string;
  dashboardHref: string;
}) {
  return (
    <div className="rounded-xl border border-amber-700/40 bg-amber-950/25 p-6">
      <h2 className="text-lg font-bold text-ash-text">Pool reveal</h2>
      <p className="mt-2 text-sm text-amber-100">
        Pick trends will unlock after the deadline.
      </p>
      {data.deadlineLabel ? (
        <p className="mt-3 text-sm text-ash-text">
          Lock deadline:{" "}
          <span className="font-medium">{data.deadlineLabel}</span>
        </p>
      ) : null}
      {data.relativeCountdown &&
      data.relativeCountdown !== "locked" &&
      data.relativeCountdown !== "" ? (
        <p className="mt-1 text-sm text-ash-muted">
          Unlocks {data.relativeCountdown}.
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-3">
        {!data.viewerPicksComplete ? (
          <Link href={picksHref} className="btn-primary inline-flex text-sm">
            Finish your picks
          </Link>
        ) : null}
        <Link
          href={activityHref}
          className="btn-ghost inline-flex text-sm ring-1 ring-ash-border"
        >
          View activity
        </Link>
        <Link
          href={dashboardHref}
          className="btn-ghost inline-flex text-sm ring-1 ring-ash-border"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

export function PoolRevealPage({
  data,
  poolName,
  picksHref,
  activityHref,
  dashboardHref,
}: Props) {
  const everyonesPicks = (
    <EveryonesPicksSection
      locked={data.locked}
      participants={data.everyonesPicks}
    />
  );

  const maxCount =
    data.championPicks.length > 0
      ? Math.max(...data.championPicks.map((c) => c.count))
      : 0;

  if (!data.locked) {
    return (
      <div className="space-y-6">
        {everyonesPicks}
        <LockedState
          data={data}
          picksHref={picksHref}
          activityHref={activityHref}
          dashboardHref={dashboardHref}
        />
      </div>
    );
  }

  if (data.showPreBracketReveal) {
    const sectionMax = (picks: PoolRevealData["championPicks"]) =>
      picks.length > 0 ? Math.max(...picks.map((c) => c.count)) : 0;

    return (
      <div className="space-y-6">
        {everyonesPicks}
        <p className="text-sm text-ash-muted">
          Pool: <span className="font-medium text-ash-text">{poolName}</span>
        </p>

        <div className="rounded-xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 to-ash-body/40 p-5 ring-1 ring-sky-500/15">
          <p className="text-sm leading-relaxed text-ash-text">
            {data.preBracketIntro}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard
            label="Completed brackets"
            value={String(data.totalCompleted)}
            detail={
              data.totalParticipants > data.totalCompleted
                ? `${data.totalParticipants - data.totalCompleted} still incomplete`
                : undefined
            }
          />
          <StatCard
            label="Pre-bracket pick sections"
            value={String(data.preBracketSections.length)}
            detail="Group, third-place, and bonus trends"
          />
        </div>

        <section className="space-y-4">
          <div>
            <h2 className="text-base font-bold text-ash-text">Pool trends</h2>
            <p className="mt-0.5 text-xs text-ash-muted">
              How the pool split on group, third-place, and bonus picks.
            </p>
          </div>

        {data.preBracketSections.map((section) => (
          <section
            key={`${section.id}-${section.title}`}
            className="rounded-xl border border-ash-border bg-ash-surface p-4"
          >
            <h2 className="text-base font-bold text-ash-text">{section.title}</h2>
            {section.subtitle ? (
              <p className="mt-0.5 text-xs text-ash-muted">{section.subtitle}</p>
            ) : null}
            <ul className="mt-3 divide-y divide-ash-border">
              {section.teamPicks.map((pick) => (
                <ChampionRow
                  key={`${section.id}-${pick.teamId}`}
                  pick={pick}
                  maxCount={sectionMax(section.teamPicks)}
                  showNames={data.canShowParticipantNames}
                />
              ))}
            </ul>
          </section>
        ))}
        </section>

        <div className="flex flex-wrap gap-3">
          <Link href={picksHref} className="btn-ghost inline-flex text-sm ring-1 ring-ash-border">
            View picks
          </Link>
          <Link href={activityHref} className="btn-ghost inline-flex text-sm ring-1 ring-ash-border">
            View activity
          </Link>
          <Link href={dashboardHref} className="btn-ghost inline-flex text-sm ring-1 ring-ash-border">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (data.totalChampionBrackets === 0) {
    return (
      <div className="space-y-6">
        {everyonesPicks}
        <div className="rounded-xl border border-ash-border bg-ash-surface p-6 text-center">
          <h2 className="text-base font-bold text-ash-text">Pool trends</h2>
          <p className="mt-2 text-sm text-ash-muted">
            {data.totalCompleted === 0
              ? `No completed brackets to reveal yet for ${poolName}.`
              : `No champion pick trends to show yet for ${poolName}.`}
          </p>
          <Link
            href={dashboardHref}
            className="btn-ghost mt-4 inline-flex text-sm ring-1 ring-ash-border"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const bracketWord = data.totalChampionBrackets === 1 ? "bracket" : "brackets";
  const top = data.mostPopularChampion;

  return (
    <div className="space-y-6">
      {everyonesPicks}
      <p className="text-sm text-ash-muted">
        Pool: <span className="font-medium text-ash-text">{poolName}</span>
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label="Completed brackets"
          value={String(data.totalCompleted)}
          detail={
            data.totalChampionBrackets < data.totalCompleted
              ? `${data.totalChampionBrackets} with champion picks`
              : data.totalParticipants > data.totalCompleted
                ? `${data.totalParticipants - data.totalCompleted} still incomplete`
                : undefined
          }
        />
        <StatCard
          label="Different champion picks"
          value={String(data.championDiversityCount)}
          detail={`Across ${data.totalChampionBrackets} champion ${bracketWord}`}
        />
      </div>

      {top ? (
        <section className="rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-ash-body/40 p-5 ring-1 ring-violet-500/15">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-200/80">
            Most popular champion
          </p>
          <div className="mt-2">
            <TeamFlagName
              countryCode={top.teamCode ?? ""}
              teamName={top.teamName}
              nameClassName="text-xl font-bold text-ash-text"
            />
          </div>
          <p className="mt-2 text-sm text-ash-text">
            {top.count} {top.count === 1 ? "bracket picked" : "brackets picked"}{" "}
            {top.teamName} to win it all.
            {data.mostPopularChampionTied ? (
              <span className="text-ash-muted">
                {" "}
                (tied with {data.championPicks.filter((c) => c.count === top.count).length - 1}{" "}
                other {top.count === 1 ? "team" : "teams"})
              </span>
            ) : null}
          </p>
          {data.ashbotLine ? (
            <p className="mt-2 text-xs italic text-ash-muted">{data.ashbotLine}</p>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-ash-text">Pool trends</h2>
          <p className="mt-0.5 text-xs text-ash-muted">
            Champion favorites and how the pool split on winners.
          </p>
        </div>

      {data.uniqueChampionCount > 0 ? (
        <section className="rounded-xl border border-ash-border bg-ash-surface p-4">
          <h2 className="text-base font-bold text-ash-text">Solo champion picks</h2>
          <p className="mt-1 text-sm text-ash-muted">
            {data.uniqueChampionCount}{" "}
            {data.uniqueChampionCount === 1 ? "team was" : "teams were"} picked by
            exactly one bracket.
          </p>
          <ul className="mt-3 divide-y divide-ash-border">
            {data.soloChampionPicks.map((pick) => (
              <li key={pick.teamId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <TeamFlagName
                  countryCode={pick.teamCode ?? ""}
                  teamName={pick.teamName}
                  nameClassName="text-sm text-ash-text"
                />
                {data.canShowParticipantNames &&
                pick.participantNames &&
                pick.participantNames.length > 0 ? (
                  <span className="text-xs text-ash-muted">
                    {pick.participantNames[0]}
                  </span>
                ) : (
                  <span className="text-xs text-ash-muted">Lone wolf pick</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-ash-border bg-ash-surface p-4">
        <h3 className="text-base font-bold text-ash-text">Champion picks</h3>
        <p className="mt-0.5 text-xs text-ash-muted">
          Champion diversity: {data.championDiversityCount} different{" "}
          {data.championDiversityCount === 1 ? "team" : "teams"} across{" "}
          {data.totalChampionBrackets} champion {bracketWord}.
        </p>
        <ul className="mt-3 divide-y divide-ash-border">
          {data.championPicks.map((pick) => (
            <ChampionRow
              key={pick.teamId}
              pick={pick}
              maxCount={maxCount}
              showNames={data.canShowParticipantNames}
            />
          ))}
        </ul>
      </section>

      {data.canShowParticipantNames &&
      data.championPicks.some((c) => (c.participantNames?.length ?? 0) > 0) ? (
        <section className="rounded-xl border border-ash-border bg-ash-surface p-4">
          <h3 className="text-base font-bold text-ash-text">Who picked who</h3>
          <p className="mt-0.5 text-xs text-ash-muted">
            Champion picks by participant.
          </p>
          <ul className="mt-3 space-y-4">
            {data.championPicks.map((pick) => {
              const names = pick.participantNames ?? [];
              if (names.length === 0) return null;
              return (
                <li key={pick.teamId}>
                  <TeamFlagName
                    countryCode={pick.teamCode ?? ""}
                    teamName={pick.teamName}
                    nameClassName="font-semibold text-ash-text"
                  />
                  <ul className="mt-1.5 space-y-0.5 pl-1 text-sm text-ash-muted">
                    {names.map((name, i) => (
                      <li key={`${pick.teamId}-${i}`}>{name}</li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      </section>
    </div>
  );
}
