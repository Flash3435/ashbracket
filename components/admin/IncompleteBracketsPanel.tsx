"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { sendIncompleteBracketReminderAction } from "../../app/(worldcup)/admin/incompleteBrackets/actions";
import {
  formatIncompleteStillFinishingVerb,
  formatLastReminderSentLabel,
  type IncompleteBracketPanelData,
  type IncompleteBracketParticipant,
} from "@/lib/admin/incompleteBracketPanel";
import type { SimulationPoolEmailUiStatus } from "@/lib/admin/simulationPoolEmailPolicy";
import { SIMULATION_POOL_EMAIL_TYPED_PHRASE } from "@/lib/admin/simulationPoolEmailPolicy";
import {
  getEmailTemplateDefaults,
  renderTemplatedPoolEmail,
} from "@/lib/communications/messageTemplates";
import { SimulationPoolEmailStatusBanner } from "./SimulationPoolEmailStatusBanner";

type Props = {
  data: IncompleteBracketPanelData;
  simulationEmailStatus: SimulationPoolEmailUiStatus;
  /** Hide pool name in compact layouts when already in pool context. */
  showPoolName?: boolean;
  className?: string;
};

function progressPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((completed / total) * 100);
}

function IncompleteParticipantRow({
  participant,
}: {
  participant: IncompleteBracketParticipant;
}) {
  const { breakdown } = participant;

  return (
    <li className="rounded-md border border-ash-border/60 bg-ash-body/30 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ash-text">{participant.displayName}</span>
        {!participant.hasEmail ? (
          <span className="text-xs text-amber-200">(no email)</span>
        ) : null}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-amber-100">
        {breakdown.missingSummary}
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-semibold text-ash-accent hover:underline">
          Details
        </summary>
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-medium text-ash-muted">Group picks</dt>
            <dd className="tabular-nums text-ash-text">{breakdown.groupPicks}</dd>
          </div>
          <div>
            <dt className="font-medium text-ash-muted">Third-place picks</dt>
            <dd className="tabular-nums text-ash-text">
              {breakdown.thirdPlacePicks}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-ash-muted">Bonus picks</dt>
            <dd className="tabular-nums text-ash-text">{breakdown.bonusPicks}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium text-ash-muted">Knockout</dt>
            <dd className="text-ash-text">{breakdown.knockoutStatus}</dd>
          </div>
        </dl>
      </details>
    </li>
  );
}

function IncompleteParticipantsList({
  participants,
  moreIncompleteCount,
}: {
  participants: IncompleteBracketParticipant[];
  moreIncompleteCount: number;
}) {
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ash-muted">
        Still incomplete
      </p>
      <ul className="mt-2 space-y-2 text-sm">
        {participants.map((p) => (
          <IncompleteParticipantRow key={p.id} participant={p} />
        ))}
        {moreIncompleteCount > 0 ? (
          <li className="px-1 text-xs text-ash-muted">
            + {moreIncompleteCount} more
          </li>
        ) : null}
      </ul>
    </div>
  );
}

export function IncompleteBracketsPanel({
  data,
  simulationEmailStatus,
  showPoolName = true,
  className = "",
}: Props) {
  const {
    isSimulationPool: isSimulation,
    isProduction,
    sendsBlocked,
    requiresTypedPhrase,
  } = simulationEmailStatus;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [productionAck, setProductionAck] = useState(false);
  const [simulationEmailAck, setSimulationEmailAck] = useState(false);
  const [typedPhrase, setTypedPhrase] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const template = getEmailTemplateDefaults("incomplete_bracket_reminder");
  const previewSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ?? "";
  const previewParticipantId =
    data.incompleteParticipants.find((p) => p.hasEmail)?.id ??
    data.incompleteParticipants[0]?.id;
  const previewSampleName =
    data.incompleteParticipants.find((p) => p.hasEmail)?.displayName ??
    data.incompleteParticipants[0]?.displayName ??
    "Jamie";

  const previewRendered = useMemo(
    () =>
      renderTemplatedPoolEmail({
        subjectTemplate: template.subject,
        bodyTemplate: template.body,
        displayName: previewSampleName,
        poolName: data.poolName,
        lockAtIso: data.lockAtIso,
        siteUrl: previewSiteUrl || undefined,
        participantId: previewParticipantId,
      }),
    [
      template.subject,
      template.body,
      previewSampleName,
      data.poolName,
      data.lockAtIso,
      previewSiteUrl,
      previewParticipantId,
    ],
  );

  const typedPhraseOk =
    !requiresTypedPhrase ||
    typedPhrase.trim().toUpperCase().replace(/\s+/g, " ") ===
      SIMULATION_POOL_EMAIL_TYPED_PHRASE;

  const canSendReminder =
    data.state === "some_incomplete" &&
    data.mailableIncompleteCount > 0 &&
    !sendsBlocked &&
    data.emailConfigured &&
    !data.possibleKeyMismatch;

  const showSendAnywayWarning = data.reminderRecentlySent && canSendReminder;

  function runSend() {
    setFormError(null);
    setSendResult(null);
    startTransition(async () => {
      const res = await sendIncompleteBracketReminderAction({
        poolId: data.poolId,
        productionAcknowledged:
          isProduction && (requiresTypedPhrase || !isSimulation)
            ? productionAck
            : true,
        simulationEmailAcknowledged: isSimulation ? simulationEmailAck : true,
        typedConfirmationPhrase: requiresTypedPhrase ? typedPhrase : undefined,
      });
      setConfirmOpen(false);
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      if (!res.deliveryConfigured) {
        setSendResult(
          `Ready to email ${res.recipientCount} incomplete participant(s), but outgoing email is not configured. Set RESEND_API_KEY and INVITE_FROM_EMAIL, then try again.`,
        );
        return;
      }
      if (res.failures.length === 0) {
        setSendResult(
          `Reminder sent — Resend accepted ${res.emailsAccepted} of ${res.recipientCount} email(s).`,
        );
      } else {
        setSendResult(
          `Partially sent: ${res.emailsAccepted} accepted, ${res.failures.length} failed.`,
        );
      }
    });
  }

  const pct = progressPercent(data.completedCount, data.totalParticipants);

  return (
    <section
      className={`rounded-lg border border-ash-border bg-ash-body/40 p-4 ${className}`}
      aria-label="Incomplete brackets"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ash-text">Incomplete brackets</h2>
          {showPoolName ? (
            <p className="mt-0.5 text-sm font-medium text-ash-text">
              {data.poolName}
            </p>
          ) : null}
        </div>
        {data.state === "all_complete" ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-emerald-800/60 bg-emerald-950/40 px-2.5 py-1 text-xs font-semibold text-emerald-200"
            aria-hidden
          >
            ✓ All set
          </span>
        ) : null}
      </div>

      {data.state === "unavailable" ? (
        <p className="mt-3 text-sm text-amber-100">
          Pick completion status is unavailable right now. Try again in a moment.
        </p>
      ) : null}

      {data.state === "no_participants" ? (
        <p className="mt-3 text-sm text-ash-muted">No participants yet.</p>
      ) : null}

      {data.state !== "unavailable" && data.state !== "no_participants" ? (
        <>
          <p className="mt-3 text-sm text-ash-text">
            <span className="font-semibold tabular-nums">
              {data.completedCount} of {data.totalParticipants}
            </span>{" "}
            complete
            {data.incompleteCount > 0 ? (
              <>
                {" "}
                ·{" "}
                <span className="font-semibold tabular-nums text-amber-100">
                  {data.incompleteCount}
                </span>{" "}
                {formatIncompleteStillFinishingVerb(data.incompleteCount)}
              </>
            ) : null}
          </p>

          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-ash-body"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Bracket completion progress"
          >
            <div
              className={`h-full rounded-full transition-all ${
                data.state === "all_complete"
                  ? "bg-emerald-600/80"
                  : "bg-amber-500/80"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {data.deadlineLabel ? (
            <p className="mt-3 text-sm text-ash-muted">
              Picks lock{" "}
              <span className="text-ash-text">{data.deadlineLabel}</span>
              {data.timeRemainingLabel &&
              data.timeRemainingLabel !== "locked" ? (
                <>
                  {" "}
                  ·{" "}
                  <span className="text-ash-text">{data.timeRemainingLabel}</span>
                </>
              ) : null}
            </p>
          ) : (
            <p className="mt-3 text-sm text-ash-muted">
              No pick deadline set. Add one in pool settings.
            </p>
          )}

          <p className="mt-2 text-xs text-ash-muted">
            {data.completionDefinitionLabel}
          </p>
        </>
      ) : null}

      {data.completionDebug && data.completionDebug.length > 0 ? (
        <details className="mt-3 rounded-md border border-ash-border/60 bg-ash-body/20 px-3 py-2 text-xs">
          <summary className="cursor-pointer font-semibold text-ash-muted">
            Completion debug ({data.completionDebug.length} participants)
          </summary>
          <ul className="mt-2 space-y-1 font-mono text-[11px] text-ash-text">
            {data.completionDebug.map((row) => (
              <li key={row.participantId}>
                {row.displayName}: complete={String(row.isComplete)} missingKeys=
                {row.missingPickKeysCount} group={row.sections.group} third=
                {row.sections.third} bonus={row.sections.bonus} knockout=
                {row.sections.knockout}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {data.state === "all_complete" ? (
        <p className="mt-3 text-sm text-emerald-200">
          Everyone has completed their picks.
        </p>
      ) : null}

      {data.state === "past_lock" && data.incompleteCount > 0 ? (
        <>
          <p className="mt-3 text-sm text-ash-muted">
            Picks are locked.{" "}
            <span className="font-semibold text-ash-text">
              {data.incompleteCount}
            </span>{" "}
            {data.incompleteCount === 1 ? "participant did" : "participants did"}{" "}
            not complete their bracket.
          </p>
          <IncompleteParticipantsList
            participants={data.incompleteParticipants}
            moreIncompleteCount={data.moreIncompleteCount}
          />
        </>
      ) : null}

      {data.state === "some_incomplete" && data.incompleteCount > 0 ? (
        <IncompleteParticipantsList
          participants={data.incompleteParticipants}
          moreIncompleteCount={data.moreIncompleteCount}
        />
      ) : null}

      {data.lastReminderSentAt ? (
        <p className="mt-3 text-xs text-ash-muted">
          {formatLastReminderSentLabel(data.lastReminderSentAt)}
          {data.lastReminderRecipientCount != null
            ? ` (${data.lastReminderRecipientCount} recipient${
                data.lastReminderRecipientCount === 1 ? "" : "s"
              })`
            : null}
        </p>
      ) : data.state === "some_incomplete" ? (
        <p className="mt-3 text-xs text-ash-muted">No reminders sent yet.</p>
      ) : null}

      {data.possibleKeyMismatch ? (
        <p className="mt-2 rounded-md border border-amber-800/50 bg-amber-950/25 px-3 py-2 text-xs text-amber-100">
          Some incomplete participants have saved picks that did not match required
          slot keys. Run{" "}
          <code className="rounded bg-ash-body/80 px-1 py-0.5 font-mono text-[11px]">
            npx tsx scripts/diagnose-pool-completion.ts {data.poolId}
          </code>{" "}
          before sending reminders — their brackets may already be complete in the
          database.
        </p>
      ) : null}

      {showSendAnywayWarning ? (
        <p className="mt-2 rounded-md border border-amber-800/50 bg-amber-950/25 px-3 py-2 text-xs text-amber-100">
          A reminder was sent within the last hour. You can still send again if
          needed, but consider waiting to avoid spamming participants.
        </p>
      ) : null}

      {formError ? (
        <p className="mt-3 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {formError}
        </p>
      ) : null}
      {sendResult ? (
        <p className="mt-3 rounded-md border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
          {sendResult}
        </p>
      ) : null}

      {data.state === "some_incomplete" ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!data.emailConfigured ? (
            <p className="text-sm text-ash-muted">
              Email is not configured on this server. Use Open communications to
              draft a message, or configure Resend to send from here.
            </p>
          ) : null}
          {sendsBlocked ? (
            <SimulationPoolEmailStatusBanner
              status={simulationEmailStatus}
              className="w-full"
            />
          ) : null}
          {requiresTypedPhrase ? (
            <div className="w-full rounded-md border border-amber-700/50 bg-amber-950/25 px-3 py-2">
              <label className="block text-xs font-medium text-amber-100">
                Type{" "}
                <span className="font-mono">
                  {SIMULATION_POOL_EMAIL_TYPED_PHRASE}
                </span>{" "}
                to enable send
                <input
                  type="text"
                  value={typedPhrase}
                  onChange={(e) => setTypedPhrase(e.target.value)}
                  autoComplete="off"
                  className="mt-1 w-full rounded border border-ash-border bg-ash-body px-2 py-1.5 text-sm text-ash-text"
                />
              </label>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={
              pending ||
              !canSendReminder ||
              (requiresTypedPhrase && !typedPhraseOk)
            }
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending
              ? "Sending…"
              : data.possibleKeyMismatch
                ? "Resolve key mismatch first"
                : sendsBlocked
                  ? "Email blocked"
                  : data.mailableIncompleteCount === 0
                    ? "No mailable recipients"
                    : "Send reminder to incomplete participants"}
          </button>
          <Link
            href={data.communicationsHref}
            className="text-sm font-medium text-ash-accent hover:underline"
          >
            Open communications
          </Link>
          {data.skippedNoEmailCount > 0 ? (
            <span className="text-xs text-ash-muted">
              {data.skippedNoEmailCount} incomplete without email
            </span>
          ) : null}
        </div>
      ) : data.totalParticipants > 0 ? (
        <div className="mt-4">
          <Link
            href={data.communicationsHref}
            className="text-sm font-medium text-ash-accent hover:underline"
          >
            Open communications
          </Link>
        </div>
      ) : null}

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="incomplete-reminder-confirm-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Close"
            onClick={() => setConfirmOpen(false)}
          />
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-ash-border bg-ash-body p-6 shadow-xl">
            <h3
              id="incomplete-reminder-confirm-title"
              className="text-base font-semibold text-ash-text"
            >
              Send incomplete bracket reminder?
            </h3>
            {isSimulation ? (
              <p className="mt-2 rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
                Simulation pool — real email will be sent if enabled.
              </p>
            ) : null}
            {isProduction && !isSimulation ? (
              <p className="mt-2 rounded-md border border-red-800/60 bg-red-950/35 px-3 py-2 text-sm text-red-100">
                Production: this sends real email to incomplete participants only.
              </p>
            ) : null}
            <ul className="mt-4 space-y-2 text-sm text-ash-muted">
              <li>
                <span className="text-ash-text">Recipients:</span>{" "}
                {data.mailableIncompleteCount}{" "}
                {data.mailableIncompleteCount === 1 ? "person" : "people"} with
                incomplete picks and an email on file
              </li>
              <li>
                <span className="text-ash-text">Subject:</span>{" "}
                {previewRendered.subject}
              </li>
            </ul>
            <pre className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-ash-border bg-ash-body/50 p-3 font-sans text-xs text-ash-muted">
              {previewRendered.text}
            </pre>
            {isProduction && (!isSimulation || requiresTypedPhrase) ? (
              <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-ash-text">
                <input
                  type="checkbox"
                  checked={productionAck}
                  onChange={(e) => setProductionAck(e.target.checked)}
                  disabled={pending}
                  className="mt-1"
                />
                <span>I understand this sends real email on production.</span>
              </label>
            ) : null}
            {isSimulation && requiresTypedPhrase ? (
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-ash-text">
                <input
                  type="checkbox"
                  checked={simulationEmailAck}
                  onChange={(e) => setSimulationEmailAck(e.target.checked)}
                  disabled={pending}
                  className="mt-1"
                />
                <span>I confirm sending test email from this simulation pool.</span>
              </label>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={pending}
                className="rounded-md border border-ash-border px-4 py-2 text-sm text-ash-text hover:bg-ash-body/80"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runSend}
                disabled={
                  pending ||
                  (isProduction && !isSimulation && !productionAck) ||
                  (isSimulation &&
                    requiresTypedPhrase &&
                    (!simulationEmailAck || !typedPhraseOk))
                }
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? "Sending…" : "Send reminder"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
