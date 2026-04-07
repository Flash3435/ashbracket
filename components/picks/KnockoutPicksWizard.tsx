"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { SaveKnockoutPicksResult } from "../../types/knockoutPicksSave";
import type { Team } from "../../src/types/domain";
import {
  assignParticipantPickDeduped,
  buildThirdPlacePickChooserOptions,
  eligibleRoundOf32Pool,
  pruneParticipantPicks,
  thirdPlaceSlotInvalidReason,
} from "../../lib/predictions/knockoutPickConsistency";
import { applyQuickPickToSlots } from "../../lib/predictions/knockoutQuickPickStrategies";
import { flagEmojiForFifaCountryCode } from "../../lib/teams/fifaToIso2ForFlag";
import {
  fifaRankSnapshotTitle,
  teamPickMetaLine,
} from "../../lib/teams/fifaRankDisplay";
import {
  strengthLabelHint,
  teamStrengthLabel,
} from "../../lib/teams/teamStrengthLabel";
import { KnockoutBracketPreview } from "./KnockoutBracketPreview";

export type SaveKnockoutPicksFn = (input: {
  participantId: string;
  slots: Array<{
    predictionKind: string;
    tournamentStageId: string;
    slotKey: string | null;
    groupCode: string | null;
    bonusKey: string | null;
    teamId: string;
  }>;
}) => Promise<SaveKnockoutPicksResult>;

export type GroupPickChooserEntry = {
  team: Team;
  disabled?: boolean;
  disabledReason?: string;
};

export type KnockoutPicksWizardProps = {
  participantId: string;
  participantDisplayName: string;
  initialSlots: KnockoutPickSlotDraft[];
  /**
   * When false, Round of 32 through champion steps are hidden until organizers publish
   * all 32 official Round of 32 results. Defaults to true (e.g. admin pick editor).
   */
  knockoutBracketPicksUnlocked?: boolean;
  teams: Team[];
  /**
   * Group letter (e.g. "A") → FIFA country codes in that group from official
   * group fixtures. When empty, group slots fall back to the full team list.
   */
  groupTeamCountryCodesByLetter?: Record<string, string[]>;
  disabled?: boolean;
  readOnly?: boolean;
  lockedMessage?: string | null;
  savePicks: SaveKnockoutPicksFn;
  successMessage?: string;
  successDetail?: string | null;
  saveHelpText?: string;
  postSaveRedirectTo?: string;
  /**
   * When true (and not `readOnly`), group finishes, third-place advancers, and bonus
   * picks cannot change. Knockout bracket rows stay editable once the official Round
   * of 32 is published.
   */
  preBracketSelectionsLocked?: boolean;
};

function isPreBracketPickSlot(slot: KnockoutPickSlotDraft): boolean {
  const k = slot.predictionKind;
  return (
    k === "group_winner" ||
    k === "group_runner_up" ||
    k === "third_place_qualifier" ||
    k === "bonus_pick"
  );
}

type BracketStepKind =
  | "third_place_qualifier"
  | "round_of_32"
  | "round_of_16"
  | "quarterfinalist"
  | "semifinalist"
  | "finalist"
  | "champion";

type WizardStepDef =
  | { id: number; mode: "group"; title: string; intro: string; hint: string }
  | {
      id: number;
      mode: "bracket";
      bracketKind: BracketStepKind;
      title: string;
      intro: string;
      hint: string;
    }
  | { id: number; mode: "bonus"; title: string; intro: string; hint: string };

function participantWizardSteps(
  knockoutBracketPicksUnlocked: boolean,
  bonusQuestionCount: number,
): WizardStepDef[] {
  const core: WizardStepDef[] = [
    {
      id: 0,
      mode: "group",
      title: "Group stage",
      intro:
        "For every letter group, pick who finishes 1st and who finishes 2nd. Scoring uses the real top two in each group.",
      hint: "You can jump between steps anytime. Third-place and knockout steps apply their own rules so you cannot reuse the same nation where it would conflict.",
    },
    {
      id: 0,
      mode: "bracket",
      bracketKind: "third_place_qualifier",
      title: "Best third-place teams",
      intro:
        "Choose the eight national teams you think will advance as the best third-place finishers. Order does not matter — you are only predicting who qualifies, not where FIFA slots them in the real bracket.",
      hint: "A team cannot appear here if you already have them finishing 1st or 2nd in a group. All eight slots must be different teams. FIFA decides matchups; your list does not place teams into bracket positions.",
    },
  ];

  const knockoutChain: WizardStepDef[] = knockoutBracketPicksUnlocked
    ? [
        {
          id: 0,
          mode: "bracket",
          bracketKind: "round_of_32",
          title: "Round of 32",
          intro:
            "After organizers publish the official Round of 32, pick all 32 teams in their real FIFA slots. Your Stage 2 list only predicted which third-place sides qualify — it does not control where they land in the bracket.",
          hint: "Eligible teams usually match your group top-two and third-place advancers; we highlight that pool when earlier steps are filled. Knockout points count once per team by furthest round reached (see pool rules).",
        },
        {
          id: 0,
          mode: "bracket",
          bracketKind: "round_of_16",
          title: "Round of 16",
          intro:
            "Narrow to sixteen teams. Each should be one of your Round of 32 teams when those picks are filled in.",
          hint: "Changing Round of 32 can clear picks here that no longer fit.",
        },
        {
          id: 0,
          mode: "bracket",
          bracketKind: "quarterfinalist",
          title: "Quarter-finals",
          intro: "Pick eight teams for the last eight.",
          hint: "Each must come from your Round of 16 when that step is complete.",
        },
        {
          id: 0,
          mode: "bracket",
          bracketKind: "semifinalist",
          title: "Semi-finals",
          intro: "Pick four teams to reach the semi-finals.",
          hint: "They must be teams you already picked for the quarters.",
        },
        {
          id: 0,
          mode: "bracket",
          bracketKind: "finalist",
          title: "The final",
          intro: "Pick the two finalists.",
          hint: "Both must come from your semi-finalists.",
        },
        {
          id: 0,
          mode: "bracket",
          bracketKind: "champion",
          title: "Champion",
          intro: "Pick one tournament winner from your two finalists.",
          hint: "Save whenever you’re ready — you can edit until the pool locks.",
        },
      ]
    : [];

  const bonusIntro =
    bonusQuestionCount > 0
      ? `${bonusQuestionCount} tournament-wide question${bonusQuestionCount === 1 ? "" : "s"} — most goals, most yellow cards, most red cards when your pool includes them, plus any extras from the host. One team per question.`
      : "Tournament-wide bonus questions: one team per category.";

  const bonus: WizardStepDef[] = [
    {
      id: 0,
      mode: "bonus",
      title: "Bonus picks",
      intro: bonusIntro,
      hint: "Independent from the bracket chain — pick any eligible team per category.",
    },
  ];

  return [...core, ...knockoutChain, ...bonus].map((s, i) => ({ ...s, id: i }));
}

function groupPickRows(slots: KnockoutPickSlotDraft[]): KnockoutPickSlotDraft[] {
  return slots
    .filter(
      (s) =>
        s.predictionKind === "group_winner" ||
        s.predictionKind === "group_runner_up",
    )
    .sort((a, b) => {
      const ga = a.groupCode ?? "";
      const gb = b.groupCode ?? "";
      if (ga !== gb) return ga.localeCompare(gb);
      if (a.predictionKind === b.predictionKind) return 0;
      return a.predictionKind === "group_winner" ? -1 : 1;
    });
}

function stepRowsFor(
  slots: KnockoutPickSlotDraft[],
  stepIdx: number,
  steps: WizardStepDef[],
): KnockoutPickSlotDraft[] {
  const def = steps[stepIdx];
  if (!def) return [];
  if (def.mode === "group") return groupPickRows(slots);
  if (def.mode === "bonus")
    return slots.filter((s) => s.predictionKind === "bonus_pick");
  return slots.filter((s) => s.predictionKind === def.bracketKind);
}

function stepComplete(
  slots: KnockoutPickSlotDraft[],
  stepIdx: number,
  steps: WizardStepDef[],
): boolean {
  const rows = stepRowsFor(slots, stepIdx, steps);
  return rows.length > 0 && rows.every((s) => s.teamId.trim() !== "");
}

function scheduleGroupRostersLoaded(
  groupTeamCountryCodesByLetter: Record<string, string[]> | undefined,
): boolean {
  return Boolean(
    groupTeamCountryCodesByLetter &&
      Object.keys(groupTeamCountryCodesByLetter).length > 0,
  );
}

/**
 * Teams eligible for a group finish slot: roster from the official schedule when
 * available; sibling finish in the same group may appear disabled with a reason.
 */
function buildGroupPickChooserOptions(
  row: KnockoutPickSlotDraft,
  slots: KnockoutPickSlotDraft[],
  allTeams: Team[],
  groupTeamCountryCodesByLetter: Record<string, string[]> | undefined,
): GroupPickChooserEntry[] {
  const gc = (row.groupCode ?? "").toUpperCase();
  const loaded = scheduleGroupRostersLoaded(groupTeamCountryCodesByLetter);
  const codes = loaded ? groupTeamCountryCodesByLetter![gc] : null;

  let pool: Team[];
  if (!loaded) {
    pool = [...allTeams];
  } else if (codes && codes.length > 0) {
    const set = new Set(codes.map((c) => c.toUpperCase()));
    pool = allTeams.filter((t) => set.has(t.countryCode.toUpperCase()));
  } else {
    pool = [];
  }
  pool.sort((a, b) => a.name.localeCompare(b.name));

  const otherKind =
    row.predictionKind === "group_winner" ? "group_runner_up" : "group_winner";
  const sibling = slots.find(
    (s) =>
      s.groupCode === row.groupCode &&
      s.predictionKind === otherKind &&
      s.rowKey !== row.rowKey,
  );
  const otherId = sibling?.teamId.trim() ?? "";
  const siblingLabel = sibling?.slotLabel ?? "the other finish";

  const currentId = row.teamId.trim();
  return pool.map((team) => {
    if (otherId && team.id === otherId && team.id !== currentId) {
      return {
        team,
        disabled: true,
        disabledReason: `Already picked for ${siblingLabel} in Group ${gc}.`,
      };
    }
    return { team };
  });
}

function allowedTeamsForPickRow(
  row: KnockoutPickSlotDraft,
  slots: KnockoutPickSlotDraft[],
  allTeams: Team[],
): Team[] {
  if (row.predictionKind === "round_of_32") {
    const eligible = eligibleRoundOf32Pool(slots);
    const taken = new Set(
      slots
        .filter(
          (s) =>
            s.predictionKind === "round_of_32" &&
            s.rowKey !== row.rowKey &&
            s.teamId.trim(),
        )
        .map((s) => s.teamId.trim()),
    );
    if (eligible.size === 0) {
      return allTeams.filter(
        (t) => !taken.has(t.id) || t.id === row.teamId.trim(),
      );
    }
    return allTeams.filter(
      (t) =>
        eligible.has(t.id) &&
        (!taken.has(t.id) || t.id === row.teamId.trim()),
    );
  }

  if (row.predictionKind === "round_of_16") {
    const r32 = new Set(
      slots
        .filter((s) => s.predictionKind === "round_of_32" && s.teamId.trim())
        .map((s) => s.teamId.trim()),
    );
    const taken = new Set(
      slots
        .filter(
          (s) =>
            s.predictionKind === "round_of_16" &&
            s.rowKey !== row.rowKey &&
            s.teamId.trim(),
        )
        .map((s) => s.teamId.trim()),
    );
    if (r32.size === 0) {
      return allTeams.filter(
        (t) => !taken.has(t.id) || t.id === row.teamId.trim(),
      );
    }
    return allTeams.filter(
      (t) =>
        r32.has(t.id) &&
        (!taken.has(t.id) || t.id === row.teamId.trim()),
    );
  }

  if (row.predictionKind === "quarterfinalist") {
    const r16 = new Set(
      slots
        .filter((s) => s.predictionKind === "round_of_16" && s.teamId.trim())
        .map((s) => s.teamId.trim()),
    );
    const r32 = new Set(
      slots
        .filter((s) => s.predictionKind === "round_of_32" && s.teamId.trim())
        .map((s) => s.teamId.trim()),
    );
    const taken = new Set(
      slots
        .filter(
          (s) =>
            s.predictionKind === "quarterfinalist" &&
            s.rowKey !== row.rowKey &&
            s.teamId.trim(),
        )
        .map((s) => s.teamId.trim()),
    );
    if (r16.size === 0 && r32.size === 0) {
      return allTeams.filter(
        (t) => !taken.has(t.id) || t.id === row.teamId.trim(),
      );
    }
    const pool =
      r16.size > 0
        ? r16
        : r32;
    return allTeams.filter(
      (t) =>
        pool.has(t.id) &&
        (!taken.has(t.id) || t.id === row.teamId.trim()),
    );
  }

  if (row.predictionKind === "semifinalist") {
    const qf = new Set(
      slots
        .filter((s) => s.predictionKind === "quarterfinalist" && s.teamId.trim())
        .map((s) => s.teamId.trim()),
    );
    const taken = new Set(
      slots
        .filter(
          (s) =>
            s.predictionKind === "semifinalist" &&
            s.rowKey !== row.rowKey &&
            s.teamId.trim(),
        )
        .map((s) => s.teamId.trim()),
    );
    return allTeams.filter(
      (t) =>
        qf.has(t.id) &&
        (!taken.has(t.id) || t.id === row.teamId.trim()),
    );
  }

  if (row.predictionKind === "finalist") {
    const sf = new Set(
      slots
        .filter((s) => s.predictionKind === "semifinalist" && s.teamId.trim())
        .map((s) => s.teamId.trim()),
    );
    const taken = new Set(
      slots
        .filter(
          (s) =>
            s.predictionKind === "finalist" &&
            s.rowKey !== row.rowKey &&
            s.teamId.trim(),
        )
        .map((s) => s.teamId.trim()),
    );
    return allTeams.filter(
      (t) =>
        sf.has(t.id) &&
        (!taken.has(t.id) || t.id === row.teamId.trim()),
    );
  }

  if (row.predictionKind === "champion") {
    const fin = new Set(
      slots
        .filter((s) => s.predictionKind === "finalist" && s.teamId.trim())
        .map((s) => s.teamId.trim()),
    );
    return allTeams.filter((t) => fin.has(t.id));
  }

  if (row.predictionKind === "bonus_pick") {
    return allTeams;
  }

  return allTeams;
}

function emptyOptionsHint(row: KnockoutPickSlotDraft): string {
  switch (row.predictionKind) {
    case "group_winner":
    case "group_runner_up":
      return "No teams are listed for this group in the official schedule yet. Ask an organizer to load group fixtures, or try again later.";
    case "round_of_32":
      return "Finish your group picks (and ideally third-place picks) first, or clear a conflicting slot.";
    case "round_of_16":
      return "Finish your Round of 32 picks first, or clear a conflicting slot.";
    case "quarterfinalist":
      return "Finish your Round of 16 picks first (or Round of 32 if you skipped it), or clear a conflicting pick.";
    case "semifinalist":
      return "Finish your quarter-final picks first.";
    case "finalist":
      return "Finish your semi-final picks first.";
    case "champion":
      return "Pick two finalists first.";
    case "third_place_qualifier":
      return "No teams are available to list. Check that the tournament team list loaded.";
    default:
      return "No teams available.";
  }
}

export function KnockoutPicksWizard({
  participantId,
  participantDisplayName,
  initialSlots,
  knockoutBracketPicksUnlocked = true,
  teams,
  groupTeamCountryCodesByLetter,
  disabled = false,
  readOnly = false,
  lockedMessage = null,
  preBracketSelectionsLocked = false,
  savePicks,
  successMessage = "Saved. Standings and public participant pages are updated.",
  successDetail = null,
  saveHelpText = "Saving writes every slot (including empty ones you cleared) and updates standings.",
  postSaveRedirectTo,
}: KnockoutPicksWizardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [slots, setSlots] = useState<KnockoutPickSlotDraft[]>(() =>
    pruneParticipantPicks(initialSlots, {
      freezeKnockoutProgressionPicks: !knockoutBracketPicksUnlocked,
    }),
  );
  const [step, setStep] = useState(0);

  const bonusQuestionCount = useMemo(
    () => slots.filter((s) => s.predictionKind === "bonus_pick").length,
    [slots],
  );

  const wizardSteps = useMemo(
    () =>
      participantWizardSteps(
        knockoutBracketPicksUnlocked,
        bonusQuestionCount,
      ),
    [knockoutBracketPicksUnlocked, bonusQuestionCount],
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [quickHint, setQuickHint] = useState<string | null>(null);
  const [openRowKey, setOpenRowKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [picksMainView, setPicksMainView] = useState<"list" | "bracket">(
    "list",
  );

  useEffect(() => {
    startTransition(() => {
      setSlots(
        pruneParticipantPicks(initialSlots, {
          freezeKnockoutProgressionPicks: !knockoutBracketPicksUnlocked,
        }),
      );
    });
  }, [initialSlots, knockoutBracketPicksUnlocked]);

  useEffect(() => {
    startTransition(() => {
      setStep((s) =>
        s >= wizardSteps.length ? Math.max(0, wizardSteps.length - 1) : s,
      );
    });
  }, [wizardSteps.length]);

  useEffect(() => {
    if (!success) return;
    const t = window.setTimeout(() => setSuccess(false), 5000);
    return () => window.clearTimeout(t);
  }, [success]);

  useEffect(() => {
    if (!quickHint) return;
    const t = window.setTimeout(() => setQuickHint(null), 6000);
    return () => window.clearTimeout(t);
  }, [quickHint]);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const coreDisabled = disabled || readOnly || isPending;
  const preBracketActive = preBracketSelectionsLocked && !readOnly;

  function pickRowDisabled(row: KnockoutPickSlotDraft): boolean {
    return coreDisabled || (preBracketActive && isPreBracketPickSlot(row));
  }

  const currentStepDef = wizardSteps[step];
  const stepRows = useMemo(
    () => stepRowsFor(slots, step, wizardSteps),
    [slots, step, wizardSteps],
  );

  function setTeamForRow(rowKey: string, teamId: string) {
    setSlots((prev) => {
      const row = prev.find((x) => x.rowKey === rowKey);
      if (
        row &&
        preBracketSelectionsLocked &&
        !readOnly &&
        isPreBracketPickSlot(row)
      ) {
        return prev;
      }
      return assignParticipantPickDeduped(prev, rowKey, teamId, {
        freezeKnockoutProgressionPicks: !knockoutBracketPicksUnlocked,
      });
    });
  }

  function applyQuick(mode: "random" | "favorites" | "balanced") {
    setSlots((prev) =>
      applyQuickPickToSlots(prev, teams, mode, {
        fillKnockoutProgression: knockoutBracketPicksUnlocked,
      }),
    );
    setQuickHint(
      knockoutBracketPicksUnlocked
        ? mode === "random"
          ? "We filled the bracket from groups through champion — adjust anything you like."
          : mode === "favorites"
            ? "We leaned on popular picks through the whole path — tweak as you wish."
            : "We spread teams across regions for groups, then narrowed down — edit freely."
        : mode === "random"
          ? "We filled group finishes and your eight third-place advancers — knockout steps will open once the official Round of 32 is published."
          : mode === "favorites"
            ? "We leaned on popular picks for groups and third-place advancers. Knockout rounds stay empty until the real bracket is set."
            : "We spread teams for groups and third-place advancers. You’ll finish the knockout path after the official Round of 32 unlocks.",
    );
    setOpenRowKey(null);
    setStep(0);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || readOnly) return;
    setActionError(null);
    setSuccess(false);
    startTransition(async () => {
      const res = await savePicks({
        participantId,
        slots: slots.map((s) => ({
          predictionKind: s.predictionKind,
          tournamentStageId: s.tournamentStageId,
          slotKey: s.slotKey,
          groupCode: s.groupCode,
          bonusKey: s.bonusKey,
          teamId: s.teamId,
        })),
      });
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      if (postSaveRedirectTo) {
        router.push(postSaveRedirectTo);
        return;
      }
      setSuccess(true);
      router.refresh();
    });
  }

  function goNext() {
    if (step >= wizardSteps.length - 1) return;
    if (!stepComplete(slots, step, wizardSteps)) return;
    setStep((s) => s + 1);
    setOpenRowKey(null);
    setSearch("");
  }

  function goPrev() {
    if (step <= 0) return;
    setStep((s) => s - 1);
    setOpenRowKey(null);
    setSearch("");
  }

  if (slots.length === 0) {
    return (
      <div className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
        Tournament stages are not set up yet. Ensure{" "}
        <code className="rounded bg-amber-950/60 px-1 py-0.5 text-[11px] text-amber-100">
          group
        </code>
        ,{" "}
        <code className="rounded bg-amber-950/60 px-1 py-0.5 text-[11px] text-amber-100">
          round_of_32
        </code>
        ,{" "}
        <code className="rounded bg-amber-950/60 px-1 py-0.5 text-[11px] text-amber-100">
          round_of_16
        </code>
        ,{" "}
        <code className="rounded bg-amber-950/60 px-1 py-0.5 text-[11px] text-amber-100">
          quarterfinal
        </code>
        ,{" "}
        <code className="rounded bg-amber-950/60 px-1 py-0.5 text-[11px] text-amber-100">
          semifinal
        </code>
        , and{" "}
        <code className="rounded bg-amber-950/60 px-1 py-0.5 text-[11px] text-amber-100">
          final
        </code>{" "}
        exist in{" "}
        <code className="text-[11px] text-amber-200">tournament_stages</code>.
      </div>
    );
  }

  const canGoNext =
    stepComplete(slots, step, wizardSteps) && step < wizardSteps.length - 1;

  const groupStepIdx = wizardSteps.findIndex((s) => s.mode === "group");
  const groupFilled =
    groupStepIdx >= 0
      ? stepRowsFor(slots, groupStepIdx, wizardSteps).filter((s) => s.teamId.trim())
          .length
      : 0;
  const groupTotal =
    groupStepIdx >= 0 ? stepRowsFor(slots, groupStepIdx, wizardSteps).length : 0;
  const thirdFilled = slots.filter(
    (s) => s.predictionKind === "third_place_qualifier" && s.teamId.trim(),
  ).length;
  const r32Filled = slots.filter(
    (s) => s.predictionKind === "round_of_32" && s.teamId.trim(),
  ).length;
  const r16Filled = slots.filter(
    (s) => s.predictionKind === "round_of_16" && s.teamId.trim(),
  ).length;
  const qfCount = slots.filter(
    (s) => s.predictionKind === "quarterfinalist" && s.teamId.trim(),
  ).length;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <p className="text-sm text-ash-muted">
        {readOnly ? "Viewing picks for " : "Editing picks for "}
        <span className="font-medium text-ash-text">
          {participantDisplayName}
        </span>
        {readOnly
          ? " — this view is read-only."
          : preBracketActive
            ? ". Group stage, third-place advancers, and bonus picks are locked. You can still update knockout bracket picks after the official Round of 32 is published."
            : ". Follow the steps in order or jump ahead — then save. Partial saves are OK."}
      </p>

      {lockedMessage ? (
        <p
          className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"
          role="status"
        >
          {lockedMessage}
        </p>
      ) : null}

      {actionError ? (
        <p
          className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}
      {success ? (
        <div
          className="rounded-md border border-ash-accent/40 bg-ash-accent/10 px-3 py-2 text-sm text-ash-muted"
          role="status"
        >
          <p className={successDetail ? "font-medium text-ash-text" : undefined}>
            {successMessage}
          </p>
          {successDetail ? (
            <p className="mt-1.5 text-xs font-normal leading-relaxed text-ash-muted">
              {successDetail}
            </p>
          ) : null}
        </div>
      ) : null}
      {quickHint ? (
        <p
          className="rounded-md border border-sky-800/60 bg-sky-950/30 px-3 py-2 text-sm text-sky-100"
          role="status"
        >
          {quickHint}
        </p>
      ) : null}

      {!knockoutBracketPicksUnlocked && !readOnly ? (
        <p
          className="rounded-md border border-sky-800/50 bg-sky-950/25 px-3 py-2 text-sm text-sky-100"
          role="status"
        >
          Round of 32 through champion stay closed until organizers publish the
          full official Round of 32 bracket (all 32 teams in their slots). Until
          then, enter your group finishes, your eight third-place advancers, and
          bonus picks — then save.
        </p>
      ) : null}

      <div
        className="flex flex-wrap items-center gap-2 border-b border-ash-border pb-4"
        role="tablist"
        aria-label="Picks display mode"
      >
        <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
          View
        </span>
        <button
          type="button"
          role="tab"
          aria-selected={picksMainView === "list"}
          onClick={() => {
            setPicksMainView("list");
            setOpenRowKey(null);
            setSearch("");
          }}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            picksMainView === "list"
              ? "bg-ash-accent text-white"
              : "bg-ash-surface text-ash-muted ring-1 ring-ash-border hover:bg-ash-border/30"
          }`}
        >
          List view
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={picksMainView === "bracket"}
          onClick={() => {
            setPicksMainView("bracket");
            setOpenRowKey(null);
            setSearch("");
          }}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            picksMainView === "bracket"
              ? "bg-ash-accent text-white"
              : "bg-ash-surface text-ash-muted ring-1 ring-ash-border hover:bg-ash-border/30"
          }`}
        >
          Bracket view
        </button>
      </div>

      {picksMainView === "bracket" ? (
        <section className="ash-surface p-4">
          <h2 className="text-lg font-bold text-ash-text">Knockout bracket</h2>
          <p className="mt-1 text-xs text-ash-muted">
            {knockoutBracketPicksUnlocked
              ? "How your Round of 32 through champion picks line up. This mirrors your list selections (including unsaved changes until you save)."
              : "Third-place advancers are shown as a simple list. The bracket tree stays in “waiting on official matchups” mode until the pool unlocks Round of 32 picks."}
          </p>
          <div className="mt-4">
            <KnockoutBracketPreview
              slots={slots}
              teams={teams}
              knockoutBracketPicksUnlocked={knockoutBracketPicksUnlocked}
            />
          </div>
        </section>
      ) : null}

      {picksMainView === "list" ? (
        <>
      <nav aria-label="Tournament pick steps" className="flex flex-wrap gap-2">
        {wizardSteps.map((s, i) => {
          const done = stepComplete(slots, i, wizardSteps);
          const active = i === step;
          return (
            <button
              key={s.id}
              type="button"
              disabled={coreDisabled}
              onClick={() => {
                setStep(i);
                setOpenRowKey(null);
                setSearch("");
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                active
                  ? "bg-ash-accent text-white"
                  : done
                    ? "bg-ash-accent/20 text-ash-accent hover:bg-ash-accent/30"
                    : "bg-ash-surface text-ash-muted ring-1 ring-ash-border hover:bg-ash-border/30"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {i + 1}. {s.title}
            </button>
          );
        })}
      </nav>

      {currentStepDef ? (
        <section className="ash-surface p-4">
          <h2 className="text-lg font-bold text-ash-text">
            {currentStepDef.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ash-muted">
            {currentStepDef.intro}
          </p>
          <p className="mt-2 text-xs text-ash-border-hover">
            {currentStepDef.hint}
          </p>

          {currentStepDef.mode === "group" &&
          !readOnly &&
          !coreDisabled &&
          !preBracketSelectionsLocked ? (
            <div className="ash-surface mt-4 border border-ash-border bg-ash-body/30 p-3">
              <p className="text-sm font-medium text-ash-text">
                {knockoutBracketPicksUnlocked
                  ? "Quick starter (groups through champion)"
                  : "Quick starter (groups & third-place advancers)"}
              </p>
              <p className="mt-1 text-xs text-ash-muted">
                {knockoutBracketPicksUnlocked
                  ? "We’ll fill group finishes, your eight third-place advancers, every knockout round, and the champion in one coherent pass. Bonus questions stay for you to choose."
                  : "We’ll fill group finishes and your eight third-place advancers. Knockout rounds open after the official Round of 32 is published. Bonus questions stay for you to choose."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyQuick("favorites")}
                  className="rounded-lg border border-ash-border bg-ash-body px-3 py-1.5 text-xs font-medium text-ash-text transition-colors hover:bg-ash-surface"
                >
                  Fan favorites mix
                </button>
                <button
                  type="button"
                  onClick={() => applyQuick("balanced")}
                  className="rounded-lg border border-ash-border bg-ash-body px-3 py-1.5 text-xs font-medium text-ash-text transition-colors hover:bg-ash-surface"
                >
                  Balanced spread
                </button>
                <button
                  type="button"
                  onClick={() => applyQuick("random")}
                  className="rounded-lg border border-ash-border bg-ash-body px-3 py-1.5 text-xs font-medium text-ash-text transition-colors hover:bg-ash-surface"
                >
                  Surprise me (random)
                </button>
              </div>
            </div>
          ) : null}

          {currentStepDef.mode === "group" && groupFilled < groupTotal ? (
            <p className="mt-4 rounded-md border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
              Pick first and second for every group. You’ve filled {groupFilled}{" "}
              of {groupTotal} slots.
            </p>
          ) : null}
          {currentStepDef.mode === "bracket" &&
          currentStepDef.bracketKind === "third_place_qualifier" ? (
            <div className="mt-4 space-y-3">
              <p className="rounded-md border border-ash-border/60 bg-ash-body/25 px-3 py-2 text-xs leading-relaxed text-ash-muted">
                Duplicate picks are not allowed: a team cannot be a third-place
                advancer if you already have them finishing first or second in a
                group, and the eight advancer slots must all be different teams.
                If you change group finishes, conflicting third-place picks clear
                immediately; reloading also reapplies these rules to anything stored
                in the database.
              </p>
              {thirdFilled < 8 ? (
                <p className="rounded-md border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
                  Choose all eight third-place advancers. {thirdFilled} of 8 so
                  far.
                </p>
              ) : null}
            </div>
          ) : null}
          {currentStepDef.mode === "bracket" &&
          currentStepDef.bracketKind === "round_of_32" &&
          r32Filled < 32 ? (
            <p className="mt-4 rounded-md border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
              Pick all 32 Round of 32 teams in their official slots.{" "}
              {r32Filled} of 32 so far.
            </p>
          ) : null}
          {currentStepDef.mode === "bracket" &&
          currentStepDef.bracketKind === "round_of_16" &&
          r16Filled < 16 ? (
            <p className="mt-4 rounded-md border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
              Pick sixteen Round of 16 teams. {r16Filled} of 16 so far.
            </p>
          ) : null}
          {currentStepDef.mode === "bracket" &&
          currentStepDef.bracketKind === "quarterfinalist" &&
          qfCount < 8 ? (
            <p className="mt-4 rounded-md border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
              Pick all eight quarter-finalists. {qfCount} of 8 so far.
            </p>
          ) : null}
          {currentStepDef.mode === "bracket" &&
          currentStepDef.bracketKind === "semifinalist" &&
          slots.filter((s) => s.predictionKind === "semifinalist" && s.teamId.trim())
            .length < 4 ? (
            <p className="mt-4 rounded-md border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
              Choose four semi-finalists on the previous step first.
            </p>
          ) : null}
          {currentStepDef.mode === "bracket" &&
          currentStepDef.bracketKind === "finalist" &&
          slots.filter((s) => s.predictionKind === "finalist" && s.teamId.trim())
            .length < 2 ? (
            <p className="mt-4 rounded-md border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
              Pick both finalists before choosing a champion.
            </p>
          ) : null}

          <ul className="mt-4 space-y-3">
            {stepRows.map((row) => {
              const team = row.teamId ? teamById.get(row.teamId) : undefined;
              const flag = team
                ? flagEmojiForFifaCountryCode(team.countryCode)
                : "";
              const strength = team
                ? teamStrengthLabel(team.countryCode)
                : null;
              const isGroupRow =
                row.predictionKind === "group_winner" ||
                row.predictionKind === "group_runner_up";
              const isThirdPlaceRow =
                row.predictionKind === "third_place_qualifier";
              const groupEntries = isGroupRow
                ? buildGroupPickChooserOptions(
                    row,
                    slots,
                    teams,
                    groupTeamCountryCodesByLetter,
                  )
                : null;
              const thirdPlaceEntries = isThirdPlaceRow
                ? buildThirdPlacePickChooserOptions(row, slots, teams)
                : null;
              const chooserEntries = groupEntries ?? thirdPlaceEntries;
              const flatOptions =
                isGroupRow || isThirdPlaceRow
                  ? null
                  : allowedTeamsForPickRow(row, slots, teams);
              const thirdInvalidReason = isThirdPlaceRow
                ? thirdPlaceSlotInvalidReason(row, slots)
                : null;
              const q = search.trim().toLowerCase();
              const rankQuery = /^\d{1,3}$/.test(q) ? parseInt(q, 10) : null;
              const filteredChooserEntries =
                chooserEntries == null
                  ? null
                  : q
                    ? chooserEntries.filter(
                        ({ team: t }) =>
                          (rankQuery != null && t.fifaRank === rankQuery) ||
                          t.name.toLowerCase().includes(q) ||
                          t.countryCode.toLowerCase().includes(q),
                      )
                    : chooserEntries;
              const filteredFlat =
                flatOptions == null
                  ? null
                  : q
                    ? flatOptions.filter(
                        (t) =>
                          (rankQuery != null && t.fifaRank === rankQuery) ||
                          t.name.toLowerCase().includes(q) ||
                          t.countryCode.toLowerCase().includes(q),
                      )
                    : flatOptions;

              const heading =
                row.predictionKind === "group_winner" ||
                row.predictionKind === "group_runner_up"
                  ? `${row.sectionLabel} — ${row.slotLabel}`
                  : row.predictionKind === "bonus_pick"
                    ? row.slotLabel
                    : row.slotLabel;

              return (
                <li
                  key={row.rowKey}
                  className="rounded-lg border border-ash-border bg-ash-body/40 p-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                        {heading}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-2xl leading-none" aria-hidden>
                          {flag || "🌍"}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-ash-text">
                            {team?.name ?? "No team selected"}
                          </p>
                          {team && strength ? (
                            <p
                              className="text-xs text-ash-muted"
                              title={
                                [
                                  fifaRankSnapshotTitle(team),
                                  strengthLabelHint(strength),
                                ]
                                  .filter(Boolean)
                                  .join(" ") || undefined
                              }
                            >
                              {teamPickMetaLine(team, strength)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={pickRowDisabled(row)}
                      onClick={() => {
                        setOpenRowKey((k) =>
                          k === row.rowKey ? null : row.rowKey,
                        );
                        setSearch("");
                      }}
                      className="shrink-0 rounded-lg border border-ash-border bg-ash-body px-3 py-1.5 text-sm font-medium text-ash-text transition-colors hover:bg-ash-surface disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {team ? "Change" : "Choose team"}
                    </button>
                  </div>

                  {thirdInvalidReason ? (
                    <p
                      className="mt-2 rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-100"
                      role="alert"
                    >
                      This pick no longer fits your group-stage choices:{" "}
                      {thirdInvalidReason}. Choose another team or adjust the
                      group finish for that nation.
                    </p>
                  ) : null}

                  {openRowKey === row.rowKey ? (
                    <div className="mt-3 border-t border-ash-border pt-3">
                      <label className="block text-xs font-medium text-ash-muted">
                        {isGroupRow && row.groupCode
                          ? `Search teams in Group ${row.groupCode}`
                          : isThirdPlaceRow
                            ? "Search teams (ineligible teams stay visible with a short reason)"
                          : "Search teams"}
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          disabled={pickRowDisabled(row)}
                          className="mt-1 w-full rounded-md border border-ash-border bg-ash-body px-2 py-1.5 text-sm text-ash-text outline-none ring-ash-accent/20 focus:border-ash-accent focus:ring-2"
                          placeholder={
                            isGroupRow && row.groupCode
                              ? `Country name, code, or FIFA rank — Group ${row.groupCode} only`
                              : isThirdPlaceRow
                                ? "Country name, code, or FIFA rank — unavailable teams show why"
                                : "Type a country name or code"
                          }
                          autoComplete="off"
                        />
                      </label>
                      {chooserEntries != null ? (
                        chooserEntries.length === 0 ? (
                          <p className="mt-2 text-sm text-amber-200">
                            {emptyOptionsHint(row)}
                          </p>
                        ) : filteredChooserEntries != null &&
                          filteredChooserEntries.length === 0 ? (
                          <p className="mt-2 text-sm text-ash-muted">
                            {isGroupRow
                              ? "No teams in this group match your search."
                              : "No teams match your search."}
                          </p>
                        ) : (
                          <ul className="mt-2 max-h-52 overflow-y-auto rounded-md border border-ash-border bg-ash-body p-1 sm:grid sm:max-h-64 sm:grid-cols-2 sm:gap-1">
                            {filteredChooserEntries!.map(
                              ({ team: t, disabled: optDisabled, disabledReason }) => {
                                const f =
                                  flagEmojiForFifaCountryCode(t.countryCode);
                                const st = teamStrengthLabel(t.countryCode);
                                const meta = teamPickMetaLine(t, st);
                                const blocked = Boolean(optDisabled);
                                return (
                                  <li key={t.id}>
                                    <button
                                      type="button"
                                      disabled={pickRowDisabled(row) || blocked}
                                      title={blocked ? disabledReason : undefined}
                                      onClick={() => {
                                        if (blocked) return;
                                        setTeamForRow(row.rowKey, t.id);
                                        setOpenRowKey(null);
                                        setSearch("");
                                      }}
                                      className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                                        blocked
                                          ? "opacity-50"
                                          : "hover:bg-ash-accent/15"
                                      }`}
                                    >
                                      <span className="text-xl" aria-hidden>
                                        {f || "🌍"}
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span
                                          className={`block font-medium ${
                                            blocked
                                              ? "text-ash-muted"
                                              : "text-ash-text"
                                          }`}
                                        >
                                          {t.name}
                                        </span>
                                        <span
                                          className="block text-[11px] text-ash-muted"
                                          title={
                                            [
                                              fifaRankSnapshotTitle(t),
                                              `${t.countryCode} · ${strengthLabelHint(st)}`,
                                            ]
                                              .filter(Boolean)
                                              .join(" — ")
                                          }
                                        >
                                          {t.countryCode} · {meta}
                                        </span>
                                        {blocked && disabledReason ? (
                                          <span className="mt-0.5 block text-[11px] text-amber-200/90">
                                            {disabledReason}
                                          </span>
                                        ) : null}
                                      </span>
                                    </button>
                                  </li>
                                );
                              },
                            )}
                          </ul>
                        )
                      ) : flatOptions != null ? (
                        flatOptions.length === 0 ? (
                          <p className="mt-2 text-sm text-amber-200">
                            {emptyOptionsHint(row)}
                          </p>
                        ) : filteredFlat != null &&
                          filteredFlat.length === 0 ? (
                          <p className="mt-2 text-sm text-ash-muted">
                            No teams match your search.
                          </p>
                        ) : (
                          <ul className="mt-2 max-h-52 overflow-y-auto rounded-md border border-ash-border bg-ash-body p-1 sm:grid sm:max-h-64 sm:grid-cols-2 sm:gap-1">
                            {filteredFlat!.map((t) => {
                              const f =
                                flagEmojiForFifaCountryCode(t.countryCode);
                              const st = teamStrengthLabel(t.countryCode);
                              const meta = teamPickMetaLine(t, st);
                              return (
                                <li key={t.id}>
                                  <button
                                    type="button"
                                    disabled={pickRowDisabled(row)}
                                    onClick={() => {
                                      setTeamForRow(row.rowKey, t.id);
                                      setOpenRowKey(null);
                                      setSearch("");
                                    }}
                                    className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-ash-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <span className="text-xl" aria-hidden>
                                      {f || "🌍"}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block font-medium text-ash-text">
                                        {t.name}
                                      </span>
                                      <span
                                        className="block text-[11px] text-ash-muted"
                                        title={
                                          [
                                            fifaRankSnapshotTitle(t),
                                            `${t.countryCode} · ${strengthLabelHint(st)}`,
                                          ]
                                            .filter(Boolean)
                                            .join(" — ")
                                        }
                                      >
                                        {t.countryCode} · {meta}
                                      </span>
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-ash-border pt-4">
            <button
              type="button"
              disabled={coreDisabled || step <= 0}
              onClick={goPrev}
              className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
            >
              Back
            </button>
            {step < wizardSteps.length - 1 ? (
              <button
                type="button"
                disabled={coreDisabled || !canGoNext}
                onClick={goNext}
                className="rounded-lg bg-ash-text px-3 py-2 text-sm font-medium text-ash-body shadow-sm transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next step
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
        </>
      ) : null}

      {!readOnly ? (
        <div>
          <button
            type="submit"
            disabled={coreDisabled}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Saving…" : "Save picks"}
          </button>
          <p className="mt-2 text-xs text-ash-muted">{saveHelpText}</p>
        </div>
      ) : null}
    </form>
  );
}
