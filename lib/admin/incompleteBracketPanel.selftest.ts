import assert from "node:assert";
import {
  buildIncompleteBracketPanelData,
  completionDefinitionLabel,
  formatIncompleteStillFinishingVerb,
  formatLastReminderSentLabel,
  reminderRecentlySent,
  REMINDER_SPAM_GUARD_MS,
} from "./incompleteBracketPanel";
import {
  buildPicksLink,
  getEmailTemplateDefaults,
  renderTemplatedPoolEmail,
} from "../communications/messageTemplates";
import { resolvePoolEmailTargets } from "../communications/recipientResolve";

const poolId = "22222222-2222-4222-8222-222222222222";
const lockAtIso = "2026-06-11T03:59:00.000Z"; // Jun 10, 2026, 11:59 p.m. ET

const nishBreakdown = {
  missingSummary: "Missing: bonus picks (2/5).",
  groupPicks: "48/48",
  thirdPlacePicks: "8/8",
  bonusPicks: "2/5",
  knockoutStatus: "Not required yet (Round of 32 not published)",
};

function baseInput(
  overrides: Partial<Parameters<typeof buildIncompleteBracketPanelData>[0]> = {},
) {
  return {
    poolId,
    poolName: "AshBracket 2026",
    lockAtIso,
    knockoutBracketPicksUnlocked: false,
    participants: [
      {
        id: "p1",
        displayName: "Lakshmi Chechi",
        email: "lakshmi@example.com",
        picksComplete: true,
      },
      {
        id: "p2",
        displayName: "Nish",
        email: "nish@example.com",
        picksComplete: false,
        breakdown: nishBreakdown,
      },
      {
        id: "p3",
        displayName: "Dipa",
        email: "",
        picksComplete: false,
        breakdown: {
          missingSummary: "Missing: group picks (40/48).",
          groupPicks: "40/48",
          thirdPlacePicks: "6/8",
          bonusPicks: "0/5",
          knockoutStatus: "Not required yet (Round of 32 not published)",
        },
      },
      {
        id: "p4",
        displayName: "Khyan",
        email: "khyan@example.com",
        picksComplete: false,
        breakdown: {
          missingSummary: "Missing: third-place picks (5/8).",
          groupPicks: "48/48",
          thirdPlacePicks: "5/8",
          bonusPicks: "5/5",
          knockoutStatus: "Not required yet (Round of 32 not published)",
        },
      },
    ],
    emailConfigured: true,
    nowMs: new Date("2026-06-08T12:00:00.000Z").getTime(),
    ...overrides,
  };
}

assert.strictEqual(
  completionDefinitionLabel(false).includes("Pre-lock picks complete"),
  true,
  "pre-lock label when R32 unpublished",
);
assert.strictEqual(
  completionDefinitionLabel(true).includes("current stage"),
  true,
  "full stage label when knockout unlocked",
);

const someIncomplete = buildIncompleteBracketPanelData(baseInput());
assert.strictEqual(someIncomplete.state, "some_incomplete");
assert.strictEqual(someIncomplete.totalParticipants, 4);
assert.strictEqual(someIncomplete.completedCount, 1);
assert.strictEqual(someIncomplete.incompleteCount, 3);

const oneIncomplete = buildIncompleteBracketPanelData(
  baseInput({
    participants: [
      {
        id: "p1",
        displayName: "Done",
        email: "done@example.com",
        picksComplete: true,
      },
      {
        id: "p2",
        displayName: "Nish",
        email: "nish@example.com",
        picksComplete: false,
      },
    ],
  }),
);
assert.strictEqual(oneIncomplete.incompleteCount, 1);
assert.strictEqual(
  formatIncompleteStillFinishingVerb(oneIncomplete.incompleteCount),
  "still needs to finish",
  "singular incomplete uses needs",
);
assert.strictEqual(
  formatIncompleteStillFinishingVerb(someIncomplete.incompleteCount),
  "still need to finish",
  "plural incomplete uses need",
);
assert.strictEqual(someIncomplete.incompleteParticipants.length, 3);
assert.strictEqual(
  someIncomplete.incompleteParticipants[0]?.breakdown.missingSummary,
  nishBreakdown.missingSummary,
  "incomplete row carries missing summary",
);
assert.strictEqual(
  someIncomplete.incompleteParticipants[0]?.breakdown.groupPicks,
  "48/48",
);
assert.strictEqual(
  someIncomplete.incompleteParticipants[0]?.breakdown.knockoutStatus,
  "Not required yet (Round of 32 not published)",
);
assert.strictEqual(someIncomplete.mailableIncompleteCount, 2);
assert.strictEqual(someIncomplete.skippedNoEmailCount, 1);
assert.strictEqual(
  someIncomplete.deadlineLabel,
  "Jun 10, 2026, 11:59 p.m. ET",
  "deadline uses compact Eastern Time formatter",
);
assert.ok(
  someIncomplete.timeRemainingLabel?.startsWith("in "),
  "time remaining before lock",
);

const allComplete = buildIncompleteBracketPanelData(
  baseInput({
    participants: baseInput().participants.map((p) => ({
      ...p,
      picksComplete: true,
    })),
  }),
);
assert.strictEqual(allComplete.state, "all_complete");
assert.strictEqual(allComplete.incompleteCount, 0);

const pastLock = buildIncompleteBracketPanelData(
  baseInput({
    nowMs: new Date("2026-06-12T12:00:00.000Z").getTime(),
  }),
);
assert.strictEqual(pastLock.state, "past_lock");
assert.strictEqual(pastLock.picksLocked, true);
assert.strictEqual(pastLock.incompleteCount, 3);

const noParticipants = buildIncompleteBracketPanelData(
  baseInput({ participants: [] }),
);
assert.strictEqual(noParticipants.state, "no_participants");

const unavailable = buildIncompleteBracketPanelData(
  baseInput({
    statusAvailable: false,
    statusUnavailableReason:
      "Admin completion check requires SUPABASE_SERVICE_ROLE_KEY in production.",
    sourceDiagnostics: {
      buildCommitSha: "abc1234",
      dataSource: "missing-service-role",
      serviceRoleAvailable: false,
      serviceRoleRequired: true,
      participantCount: 4,
      predictionRowCount: 0,
      groupMapSize: 0,
      trustedIncompleteCount: 0,
      warningMessage:
        "Admin completion check requires SUPABASE_SERVICE_ROLE_KEY in production.",
    },
  }),
);
assert.strictEqual(unavailable.state, "unavailable");
assert.ok(unavailable.statusUnavailableReason?.includes("SUPABASE_SERVICE_ROLE_KEY"));
assert.strictEqual(unavailable.sourceDiagnostics.dataSource, "missing-service-role");

const manyIncomplete = buildIncompleteBracketPanelData(
  baseInput({
    participants: Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`,
      displayName: `Person ${i}`,
      email: `p${i}@example.com`,
      picksComplete: i === 0,
    })),
  }),
);
assert.strictEqual(manyIncomplete.incompleteCount, 7);
assert.strictEqual(manyIncomplete.incompleteParticipants.length, 5);
assert.strictEqual(manyIncomplete.moreIncompleteCount, 2);

const { targets } = resolvePoolEmailTargets(
  baseInput().participants.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    email: p.email,
    isPaid: true,
    picksComplete: p.picksComplete,
  })),
  "incomplete_picks",
  [],
);
assert.deepStrictEqual(
  targets.map((t) => t.id).sort(),
  ["p2", "p4"],
  "reminder targets only incomplete participants with email",
);
assert.ok(
  !targets.some((t) => t.id === "p1"),
  "complete participant excluded",
);
assert.ok(
  !targets.some((t) => t.id === "p3"),
  "incomplete without email excluded",
);

const template = getEmailTemplateDefaults("incomplete_bracket_reminder");
assert.strictEqual(
  template.subject,
  "Reminder: finish your AshBracket picks",
);
const rendered = renderTemplatedPoolEmail({
  subjectTemplate: template.subject,
  bodyTemplate: template.body,
  displayName: "Nish",
  poolName: "AshBracket 2026",
  lockAtIso,
  siteUrl: "https://ashbracket.com",
  participantId: "p2",
});
assert.match(rendered.text, /Hi Nish,/);
assert.match(
  rendered.text,
  /June 10, 2026 at 11:59 p\.?m\.? Eastern Time/i,
  "deadline in reminder uses long Eastern Time, not UTC",
);
assert.match(
  rendered.text,
  /https:\/\/ashbracket\.com\/account\/picks\?participant=p2/,
);
assert.strictEqual(
  buildPicksLink("https://ashbracket.com", "p2"),
  "https://ashbracket.com/account/picks?participant=p2",
);

const sentAt = new Date("2026-06-08T12:00:00.000Z").toISOString();
const nowMs = new Date("2026-06-08T12:30:00.000Z").getTime();
assert.strictEqual(reminderRecentlySent(sentAt, nowMs), true);
assert.match(formatLastReminderSentLabel(sentAt, nowMs), /30 minutes ago/);
assert.strictEqual(
  reminderRecentlySent(
    new Date(nowMs - REMINDER_SPAM_GUARD_MS - 1000).toISOString(),
    nowMs,
  ),
  false,
);

console.log("incompleteBracketPanel.selftest.ts: all assertions passed");
