"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createParticipantAction,
  inviteParticipantAction,
  moveWorldCupParticipantToPoolAction,
  removeParticipantFromPoolAction,
  sendParticipantInviteAction,
  updateParticipantAction,
} from "../../app/(worldcup)/admin/participants/actions";
import {
  buildRemoveParticipantWarnings,
  removeParticipantModalSubject,
} from "@/lib/participants/removeParticipantFromPoolPolicy";
import {
  buildMoveDestinationOptionsForParticipant,
  hasCompatibleDirectMoveDestination,
  MOVE_PARTICIPANT_CONFIRM_WARNING,
  MOVE_PARTICIPANT_MODAL_INTRO,
  MOVE_PARTICIPANT_NO_DESTINATIONS_MESSAGE,
  moveParticipantModalSubject,
  type ParticipantMoveDestinationContext,
} from "@/lib/participants/worldCupParticipantMove";
import type { SimulationPoolEmailUiStatus } from "@/lib/admin/simulationPoolEmailPolicy";
import {
  SIMULATION_POOL_EMAIL_TYPED_PHRASE,
} from "@/lib/admin/simulationPoolEmailPolicy";
import type {
  ParticipantPicksStatus,
  ParticipantWithPicksStatus,
} from "@/lib/admin/participantPickStatus";
import { PoolShareInvitePanel } from "./PoolShareInvitePanel";
import { SimulationPoolEmailStatusBanner } from "./SimulationPoolEmailStatusBanner";

type ParticipantsManagerProps = {
  poolId: string;
  currentPoolName: string;
  moveDestinationContext: ParticipantMoveDestinationContext;
  initialParticipants: ParticipantWithPicksStatus[];
  /** Pool open-join code and URL; from server via `poolShareJoinUrl` */
  joinCode: string | null;
  shareUrl: string | null;
  disabled?: boolean;
  incompletePicksMessageHref: string;
  lockSummary: string;
  picksLocked: boolean;
  picksStatusAvailable: boolean;
  simulationEmailStatus?: SimulationPoolEmailUiStatus;
  poolIsPaid?: boolean;
};

type Panel = "none" | "invite" | "manual";
type PicksFilter = "all" | "incomplete" | "complete" | "not_started" | "not_joined";

function emptyForm() {
  return { displayName: "", email: "", paid: false as boolean };
}

function statusLabel(p: ParticipantWithPicksStatus): string {
  if (p.inviteStatus === "joined") return "Joined";
  if (p.inviteStatus === "invited") return "Invite pending";
  return "Manual only";
}

function statusClass(p: ParticipantWithPicksStatus): string {
  if (p.inviteStatus === "joined") {
    return "inline-flex rounded-full bg-emerald-950/50 px-2 py-0.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-800/60";
  }
  if (p.inviteStatus === "invited") {
    return "inline-flex rounded-full bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-200 ring-1 ring-amber-800/50";
  }
  return "inline-flex rounded-full bg-ash-body px-2 py-0.5 text-xs font-medium text-ash-muted ring-1 ring-ash-border";
}

function picksStatusClass(status: ParticipantPicksStatus | null): string {
  if (!status) {
    return "inline-flex rounded-full bg-ash-body px-2 py-0.5 text-xs font-medium text-ash-muted ring-1 ring-ash-border";
  }
  if (status.kind === "complete") {
    return "inline-flex rounded-full bg-emerald-950/50 px-2 py-0.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-800/60";
  }
  if (status.kind === "in_progress") {
    return "inline-flex rounded-full bg-sky-950/40 px-2 py-0.5 text-xs font-medium text-sky-200 ring-1 ring-sky-800/50";
  }
  if (status.kind === "not_started") {
    return "inline-flex rounded-full bg-orange-950/40 px-2 py-0.5 text-xs font-medium text-orange-200 ring-1 ring-orange-800/50";
  }
  if (status.kind === "invite_pending") {
    return "inline-flex rounded-full bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-200 ring-1 ring-amber-800/50";
  }
  return "inline-flex rounded-full bg-ash-body px-2 py-0.5 text-xs font-medium text-ash-muted ring-1 ring-ash-border";
}

function picksStatusLabel(status: ParticipantPicksStatus | null): string {
  return status?.label ?? "Unavailable";
}

function picksFilterMatches(
  participant: ParticipantWithPicksStatus,
  filter: PicksFilter,
): boolean {
  if (filter === "all") return true;
  if (!participant.picksStatus) return false;
  if (filter === "incomplete") return participant.picksStatus.isIncomplete;
  if (filter === "complete") return participant.picksStatus.kind === "complete";
  if (filter === "not_started") {
    return participant.picksStatus.kind === "not_started";
  }
  return (
    participant.picksStatus.kind === "invite_pending" ||
    participant.picksStatus.kind === "not_joined"
  );
}

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

type InviteFeedback = {
  tone: "success" | "warning";
  headline: string;
  detail?: string;
  inviteUrl?: string;
};

export function ParticipantsManager({
  poolId,
  currentPoolName,
  moveDestinationContext,
  initialParticipants,
  joinCode,
  shareUrl,
  disabled = false,
  incompletePicksMessageHref,
  lockSummary,
  picksLocked,
  picksStatusAvailable,
  simulationEmailStatus,
  poolIsPaid = false,
}: ParticipantsManagerProps) {
  const emailStatus = simulationEmailStatus;
  const sendsBlocked = emailStatus?.sendsBlocked ?? false;
  const requiresTypedPhrase = emailStatus?.requiresTypedPhrase ?? false;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [participants, setParticipants] = useState<ParticipantWithPicksStatus[]>(
    initialParticipants,
  );
  const [statusFilter, setStatusFilter] = useState<PicksFilter>("all");
  const [panel, setPanel] = useState<Panel>("none");
  const [inviteForm, setInviteForm] = useState(emptyForm);
  const [manualForm, setManualForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [actionError, setActionError] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<InviteFeedback | null>(
    null,
  );
  const [copyDone, setCopyDone] = useState(false);
  const [typedPhrase, setTypedPhrase] = useState("");
  const [productionAck, setProductionAck] = useState(false);
  const [simulationEmailAck, setSimulationEmailAck] = useState(false);
  const [removingParticipant, setRemovingParticipant] =
    useState<ParticipantWithPicksStatus | null>(null);
  const [removeSuccessMessage, setRemoveSuccessMessage] = useState<string | null>(
    null,
  );
  const [movingParticipant, setMovingParticipant] =
    useState<ParticipantWithPicksStatus | null>(null);
  const [moveDestinationId, setMoveDestinationId] = useState("");
  const [moveSuccessMessage, setMoveSuccessMessage] = useState<string | null>(null);

  const canMoveParticipants = hasCompatibleDirectMoveDestination(moveDestinationContext);

  const moveOptionsForParticipant = useMemo(() => {
    if (!movingParticipant) {
      return {
        eligibleOptions: [],
        blockedDestinations: [],
        emptyMessage: undefined,
      };
    }
    return buildMoveDestinationOptionsForParticipant({
      context: moveDestinationContext,
      movingParticipant: {
        userId: movingParticipant.userId ?? null,
        email: movingParticipant.email,
        displayName: movingParticipant.displayName,
      },
    });
  }, [moveDestinationContext, movingParticipant]);

  const typedPhraseOk =
    !requiresTypedPhrase ||
    typedPhrase.trim().toUpperCase().replace(/\s+/g, " ") ===
      SIMULATION_POOL_EMAIL_TYPED_PHRASE;
  const emailConfirmOk =
    !requiresTypedPhrase || (typedPhraseOk && productionAck && simulationEmailAck);

  useEffect(() => {
    setParticipants(initialParticipants);
  }, [initialParticipants]);

  useEffect(() => {
    if (!picksStatusAvailable && statusFilter !== "all") {
      setStatusFilter("all");
    }
  }, [picksStatusAvailable, statusFilter]);

  const sorted = useMemo(
    () =>
      [...participants].sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, {
          sensitivity: "base",
        }),
      ),
    [participants],
  );

  const filterCounts = useMemo(() => {
    let incomplete = 0;
    let complete = 0;
    let notStarted = 0;
    let notJoined = 0;

    for (const participant of sorted) {
      const status = participant.picksStatus;
      if (!status) continue;
      if (status.isIncomplete) incomplete += 1;
      if (status.kind === "complete") complete += 1;
      if (status.kind === "not_started") notStarted += 1;
      if (status.kind === "invite_pending" || status.kind === "not_joined") {
        notJoined += 1;
      }
    }

    return {
      all: sorted.length,
      incomplete,
      complete,
      notStarted,
      notJoined,
    };
  }, [sorted]);

  const visibleParticipants = useMemo(
    () => sorted.filter((participant) => picksFilterMatches(participant, statusFilter)),
    [sorted, statusFilter],
  );

  function openEdit(p: ParticipantWithPicksStatus) {
    setEditingId(p.id);
    setEditForm({
      displayName: p.displayName,
      email: p.email,
      paid: p.paid,
    });
  }

  function closeEdit() {
    setEditingId(null);
    setEditForm(emptyForm());
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || sendsBlocked || !emailConfirmOk) return;
    const name = inviteForm.displayName.trim();
    const email = inviteForm.email.trim();
    if (!name || !email) return;
    setActionError(null);
    setInviteFeedback(null);
    setCopyDone(false);
    startTransition(async () => {
      const res = await inviteParticipantAction({
        poolId,
        displayName: name,
        email,
        paid: inviteForm.paid,
        productionAcknowledged: productionAck,
        simulationEmailAcknowledged: simulationEmailAck,
        typedConfirmationPhrase: requiresTypedPhrase ? typedPhrase : undefined,
      });
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      setInviteForm(emptyForm());
      setPanel("none");
      if (res.emailSent) {
        setInviteFeedback({
          tone: "success",
          headline: `Invite email sent to ${email}`,
          detail: res.emailMessage,
          inviteUrl: res.inviteUrl,
        });
      } else {
        setInviteFeedback({
          tone: "warning",
          headline: res.emailMessage?.includes("not configured")
            ? "Invite ready — email is not set up on this server"
            : "Invite created, but the email could not be sent",
          detail: res.emailMessage,
          inviteUrl: res.inviteUrl,
        });
      }
      router.refresh();
    });
  }

  function handleManualAdd(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    const name = manualForm.displayName.trim();
    const email = manualForm.email.trim();
    if (!name || !email) return;
    setActionError(null);
    setInviteFeedback(null);
    startTransition(async () => {
      const res = await createParticipantAction({
        poolId,
        displayName: name,
        email,
        paid: manualForm.paid,
      });
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      setManualForm(emptyForm());
      setPanel("none");
      setInviteFeedback({
        tone: "success",
        headline: `${name} added to the list (not emailed)`,
        detail:
          "They are not notified automatically. Use Send invite when you want them to sign in.",
      });
      router.refresh();
    });
  }

  function handleSendOrResendInvite(id: string) {
    if (disabled || sendsBlocked || !emailConfirmOk) return;
    setActionError(null);
    setInviteFeedback(null);
    setCopyDone(false);
    startTransition(async () => {
      const res = await sendParticipantInviteAction({
        poolId,
        participantId: id,
        productionAcknowledged: productionAck,
        simulationEmailAcknowledged: simulationEmailAck,
        typedConfirmationPhrase: requiresTypedPhrase ? typedPhrase : undefined,
      });
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      const p = participants.find((x) => x.id === id);
      const label = p?.email ?? "participant";
      if (res.emailSent) {
        setInviteFeedback({
          tone: "success",
          headline: `Invite email sent to ${label}`,
          detail: res.emailMessage,
          inviteUrl: res.inviteUrl,
        });
      } else {
        setInviteFeedback({
          tone: "warning",
          headline: "Invite link is ready (email was not sent)",
          detail: res.emailMessage,
          inviteUrl: res.inviteUrl,
        });
      }
      router.refresh();
    });
  }

  async function copyInviteUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2000);
    } catch {
      setActionError("Could not copy to the clipboard.");
    }
  }

  function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || !editingId) return;
    const name = editForm.displayName.trim();
    const email = editForm.email.trim();
    if (!name || !email) return;
    setActionError(null);
    const id = editingId;
    startTransition(async () => {
      const res = await updateParticipantAction({
        poolId,
        id,
        displayName: name,
        email,
        paid: editForm.paid,
      });
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      closeEdit();
      router.refresh();
    });
  }

  function openMoveConfirm(p: ParticipantWithPicksStatus) {
    if (disabled || !canMoveParticipants) return;
    setActionError(null);
    setMoveSuccessMessage(null);
    const built = buildMoveDestinationOptionsForParticipant({
      context: moveDestinationContext,
      movingParticipant: {
        userId: p.userId ?? null,
        email: p.email,
        displayName: p.displayName,
      },
    });
    setMoveDestinationId(built.eligibleOptions[0]?.id ?? "");
    setMovingParticipant(p);
  }

  function closeMoveConfirm() {
    setMovingParticipant(null);
    setMoveDestinationId("");
  }

  function handleConfirmMove() {
    if (disabled || !movingParticipant || !moveDestinationId) return;
    const participant = movingParticipant;
    const destination = moveOptionsForParticipant.eligibleOptions.find(
      (pool) => pool.id === moveDestinationId,
    );
    if (!destination) return;

    setActionError(null);
    startTransition(async () => {
      const res = await moveWorldCupParticipantToPoolAction({
        sourcePoolId: poolId,
        destinationPoolId: moveDestinationId,
        participantId: participant.id,
      });
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      if (editingId === participant.id) closeEdit();
      setParticipants((prev) => prev.filter((x) => x.id !== participant.id));
      setMoveSuccessMessage(
        res.message ??
          `${participant.displayName.trim() || participant.email.trim() || "Participant"} was moved to ${destination.name} with all picks preserved.`,
      );
      closeMoveConfirm();
      router.refresh();
    });
  }

  function openRemoveConfirm(p: ParticipantWithPicksStatus) {
    if (disabled) return;
    setActionError(null);
    setRemoveSuccessMessage(null);
    setMoveSuccessMessage(null);
    setRemovingParticipant(p);
  }

  function closeRemoveConfirm() {
    setRemovingParticipant(null);
  }

  function handleConfirmRemove() {
    if (disabled || !removingParticipant) return;
    const participant = removingParticipant;
    const id = participant.id;
    setActionError(null);
    startTransition(async () => {
      const res = await removeParticipantFromPoolAction({
        poolId,
        participantId: id,
      });
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      if (editingId === id) closeEdit();
      setParticipants((prev) => prev.filter((x) => x.id !== id));
      setRemoveSuccessMessage(
        res.message ??
          `${participant.displayName.trim() || participant.email.trim() || "Participant"} was removed from this pool.`,
      );
      closeRemoveConfirm();
      router.refresh();
    });
  }

  const removeWarnings = removingParticipant
    ? buildRemoveParticipantWarnings({
        paid: removingParticipant.paid,
        picksStatus: removingParticipant.picksStatus,
      })
    : [];

  return (
    <div className="space-y-6">
      {emailStatus ? (
        <SimulationPoolEmailStatusBanner status={emailStatus} />
      ) : null}
      {requiresTypedPhrase ? (
        <div className="rounded-md border border-amber-700/50 bg-amber-950/25 px-4 py-3 text-sm text-amber-100">
          <label className="block font-medium">
            Type{" "}
            <span className="font-mono">{SIMULATION_POOL_EMAIL_TYPED_PHRASE}</span>{" "}
            before sending invite email
            <input
              type="text"
              value={typedPhrase}
              onChange={(e) => setTypedPhrase(e.target.value)}
              autoComplete="off"
              className="mt-2 w-full rounded-md border border-amber-800/60 bg-ash-body px-3 py-2 font-mono text-sm text-ash-text"
            />
          </label>
          <label className="mt-3 flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={productionAck}
              onChange={(e) => setProductionAck(e.target.checked)}
              className="mt-1"
            />
            <span>I understand this sends real email on production.</span>
          </label>
          <label className="mt-2 flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={simulationEmailAck}
              onChange={(e) => setSimulationEmailAck(e.target.checked)}
              className="mt-1"
            />
            <span>I intend to send invite email from this simulation test pool.</span>
          </label>
        </div>
      ) : null}
      {removeSuccessMessage ? (
        <p className="rounded-md border border-emerald-800/70 bg-emerald-950/35 px-3 py-2 text-sm text-emerald-100">
          {removeSuccessMessage}
        </p>
      ) : null}
      {moveSuccessMessage ? (
        <p className="rounded-md border border-emerald-800/70 bg-emerald-950/35 px-3 py-2 text-sm text-emerald-100">
          {moveSuccessMessage}
        </p>
      ) : null}
      {!canMoveParticipants ? (
        <p className="text-sm text-ash-muted">{MOVE_PARTICIPANT_NO_DESTINATIONS_MESSAGE}</p>
      ) : null}

      {actionError ? (
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {actionError}
        </p>
      ) : null}

      {inviteFeedback ? (
        <div
          className={
            inviteFeedback.tone === "success"
              ? "rounded-md border border-emerald-800/70 bg-emerald-950/35 px-3 py-3 text-sm text-emerald-100"
              : "rounded-md border border-amber-800/70 bg-amber-950/35 px-3 py-3 text-sm text-amber-100"
          }
        >
          <p className="font-medium text-ash-text">{inviteFeedback.headline}</p>
          {inviteFeedback.detail ? (
            <p className="mt-1 text-ash-muted">{inviteFeedback.detail}</p>
          ) : null}
          {inviteFeedback.inviteUrl ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => copyInviteUrl(inviteFeedback.inviteUrl!)}
                className="btn-ghost inline-flex w-fit text-xs disabled:opacity-50"
              >
                {copyDone ? "Copied" : "Copy invite link"}
              </button>
              <span className="break-all font-mono text-xs text-ash-muted">
                {inviteFeedback.inviteUrl}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="ash-surface space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ash-text">Pick completion</h2>
            <p className="mt-1 text-sm text-ash-muted">
              Uses the same completeness rules as the incomplete-picks email
              audience.
            </p>
            <p className="mt-1 text-xs text-ash-muted">
              Picks lock: <span className="text-ash-text">{lockSummary}</span>
              {picksLocked ? " Statuses now reflect what was saved before lock." : ""}
            </p>
          </div>
          {picksStatusAvailable ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setStatusFilter("incomplete")}
                className={
                  statusFilter === "incomplete"
                    ? "btn-primary"
                    : "rounded-md border border-ash-border bg-ash-body/60 px-3 py-2 text-sm font-medium text-ash-text hover:bg-ash-body"
                }
              >
                View incomplete picks
              </button>
              <Link
                href={incompletePicksMessageHref}
                className="rounded-md border border-ash-border bg-ash-body/60 px-3 py-2 text-sm font-medium text-ash-text hover:bg-ash-body"
              >
                Message incomplete participants
              </Link>
            </div>
          ) : null}
        </div>

        {picksStatusAvailable ? (
          <>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={
                  statusFilter === "all"
                    ? "btn-primary"
                    : "rounded-md border border-ash-border bg-ash-body/50 px-3 py-1.5 text-sm font-medium text-ash-text hover:bg-ash-body"
                }
              >
                All participants ({filterCounts.all})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("incomplete")}
                className={
                  statusFilter === "incomplete"
                    ? "btn-primary"
                    : "rounded-md border border-ash-border bg-ash-body/50 px-3 py-1.5 text-sm font-medium text-ash-text hover:bg-ash-body"
                }
              >
                Incomplete picks ({filterCounts.incomplete})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("complete")}
                className={
                  statusFilter === "complete"
                    ? "btn-primary"
                    : "rounded-md border border-ash-border bg-ash-body/50 px-3 py-1.5 text-sm font-medium text-ash-text hover:bg-ash-body"
                }
              >
                Complete ({filterCounts.complete})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("not_started")}
                className={
                  statusFilter === "not_started"
                    ? "btn-primary"
                    : "rounded-md border border-ash-border bg-ash-body/50 px-3 py-1.5 text-sm font-medium text-ash-text hover:bg-ash-body"
                }
              >
                Not started ({filterCounts.notStarted})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("not_joined")}
                className={
                  statusFilter === "not_joined"
                    ? "btn-primary"
                    : "rounded-md border border-ash-border bg-ash-body/50 px-3 py-1.5 text-sm font-medium text-ash-text hover:bg-ash-body"
                }
              >
                Not joined ({filterCounts.notJoined})
              </button>
            </div>
            <p className="text-xs text-ash-muted">
              Showing {visibleParticipants.length} of {sorted.length} participant
              {sorted.length === 1 ? "" : "s"}.
            </p>
          </>
        ) : null}
      </section>

      <div className="space-y-4 rounded-md border border-ash-accent/20 bg-ash-accent/5 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-ash-text">Add participants</h2>
          <p className="text-sm text-ash-muted">
            {participants.length} participant
            {participants.length === 1 ? "" : "s"}
            {isPending ? " · saving…" : ""}
          </p>
        </div>
        <p className="text-sm text-ash-muted">
          Invite specific people by email, or post one shareable link in your
          group chat.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-xs text-ash-muted">
          <li>
            <span className="font-semibold text-ash-text">Invite participant</span>{" "}
            sends a direct email.
          </li>
          <li>
            <span className="font-semibold text-ash-text">Copy invite link</span>{" "}
            lets anyone with the link sign in and join as a participant.
          </li>
          <li>This does not grant organizer/admin access.</li>
        </ul>
        <PoolShareInvitePanel joinCode={joinCode} shareUrl={shareUrl} variant="primary" />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || isPending}
            onClick={() => {
              setPanel((p) => (p === "invite" ? "none" : "invite"));
              setActionError(null);
            }}
            className={
              panel === "invite"
                ? "btn-ghost transition disabled:cursor-not-allowed disabled:opacity-50"
                : "btn-primary transition disabled:cursor-not-allowed disabled:opacity-50"
            }
          >
            {panel === "invite" ? "Close" : "Invite participant"}
          </button>
          <button
            type="button"
            disabled={disabled || isPending}
            onClick={() => {
              setPanel((p) => (p === "manual" ? "none" : "manual"));
              setActionError(null);
            }}
            className={
              panel === "manual"
                ? "btn-ghost transition disabled:cursor-not-allowed disabled:opacity-50"
                : "rounded-lg bg-ash-surface px-4 py-2 text-sm font-medium text-ash-text ring-1 ring-ash-border transition-colors hover:bg-ash-border/40 disabled:cursor-not-allowed disabled:opacity-50"
            }
          >
            {panel === "manual" ? "Close" : "Add manually"}
          </button>
        </div>
      </div>

      <p className="text-xs text-ash-muted">
        <span className="font-semibold text-ash-text">Add manually</span> only
        updates your list (for example cash tracking) — they are not notified.
      </p>

      {panel === "invite" ? (
        <form onSubmit={handleInvite} className="ash-surface p-4">
          <h2 className="text-sm font-bold text-ash-text">
            Invite participant
          </h2>
          <p className="mt-1 text-sm text-ash-muted">
            We will email them a link to this pool. They should sign in with the
            same email address you enter here.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                Display name
              </span>
              <input
                required
                disabled={disabled || isPending}
                value={inviteForm.displayName}
                onChange={(e) =>
                  setInviteForm((f) => ({ ...f, displayName: e.target.value }))
                }
                className="w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm outline-none ring-ash-accent/20 focus:border-ash-accent focus:ring-2 disabled:opacity-50"
                placeholder="e.g. Jamie Lee"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                Email
              </span>
              <input
                required
                disabled={disabled || isPending}
                type="email"
                value={inviteForm.email}
                onChange={(e) =>
                  setInviteForm((f) => ({ ...f, email: e.target.value }))
                }
                className="w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm outline-none ring-ash-accent/20 focus:border-ash-accent focus:ring-2 disabled:opacity-50"
                placeholder="name@example.com"
              />
            </label>
          </div>
          {poolIsPaid ? (
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-ash-muted">
              <input
                type="checkbox"
                disabled={disabled || isPending}
                checked={inviteForm.paid}
                onChange={(e) =>
                  setInviteForm((f) => ({ ...f, paid: e.target.checked }))
                }
                className="size-4 rounded border-ash-border text-ash-accent focus:ring-ash-accent disabled:opacity-50"
              />
              Mark as paid
            </label>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              disabled={disabled || isPending}
              onClick={() => {
                setPanel("none");
                setInviteForm(emptyForm());
              }}
              className="btn-ghost disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={disabled || isPending || sendsBlocked || !emailConfirmOk}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sendsBlocked ? "Invite email blocked" : "Send invite"}
            </button>
          </div>
        </form>
      ) : null}

      {panel === "manual" ? (
        <form onSubmit={handleManualAdd} className="ash-surface p-4">
          <h2 className="text-sm font-bold text-ash-text">Add manually</h2>
          <p className="mt-1 text-sm text-ash-muted">
            Adds someone to your list for your own records only. No email is
            sent — use Invite participant when they should sign in.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                Display name
              </span>
              <input
                required
                disabled={disabled || isPending}
                value={manualForm.displayName}
                onChange={(e) =>
                  setManualForm((f) => ({ ...f, displayName: e.target.value }))
                }
                className="w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm outline-none ring-ash-accent/20 focus:border-ash-accent focus:ring-2 disabled:opacity-50"
                placeholder="e.g. Jamie Lee"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                Email
              </span>
              <input
                required
                disabled={disabled || isPending}
                type="email"
                value={manualForm.email}
                onChange={(e) =>
                  setManualForm((f) => ({ ...f, email: e.target.value }))
                }
                className="w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm outline-none ring-ash-accent/20 focus:border-ash-accent focus:ring-2 disabled:opacity-50"
                placeholder="name@example.com"
              />
            </label>
          </div>
          {poolIsPaid ? (
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-ash-muted">
              <input
                type="checkbox"
                disabled={disabled || isPending}
                checked={manualForm.paid}
                onChange={(e) =>
                  setManualForm((f) => ({ ...f, paid: e.target.checked }))
                }
                className="size-4 rounded border-ash-border text-ash-accent focus:ring-ash-accent disabled:opacity-50"
              />
              Mark as paid
            </label>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              disabled={disabled || isPending}
              onClick={() => {
                setPanel("none");
                setManualForm(emptyForm());
              }}
              className="btn-ghost disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={disabled || isPending}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add to list
            </button>
          </div>
        </form>
      ) : null}

      {/* Table — desktop */}
      <div className="ash-surface hidden overflow-hidden md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ash-border bg-ash-body/50 text-xs font-semibold uppercase tracking-wide text-ash-muted">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Join status</th>
              <th className="px-4 py-3">Picks status</th>
              {poolIsPaid ? (
                <th className="px-4 py-3">Payment</th>
              ) : (
                <th className="px-4 py-3 text-ash-muted/70">Payment</th>
              )}
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ash-border">
            {visibleParticipants.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-ash-muted"
                >
                  {sorted.length === 0
                    ? "No participants yet. Invite someone or add them manually."
                    : "No participants match this filter."}
                </td>
              </tr>
            ) : (
              visibleParticipants.map((p) => (
                <tr key={p.id} className="text-ash-muted">
                  <td className="px-4 py-3 font-medium text-ash-text">
                    {p.displayName}
                  </td>
                  <td className="px-4 py-3 text-ash-muted">{p.email}</td>
                  <td className="px-4 py-3">
                    <span className={statusClass(p)}>{statusLabel(p)}</span>
                    {p.inviteStatus === "invited" && p.inviteLastSentAt ? (
                      <span className="mt-1 block text-xs text-ash-muted">
                        Last sent {formatDateTime(p.inviteLastSentAt)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className={picksStatusClass(p.picksStatus)}>
                      {picksStatusLabel(p.picksStatus)}
                    </span>
                    {p.picksStatus?.lastSavedAt ? (
                      <span className="mt-1 block text-xs text-ash-muted">
                        Last saved {formatDateTime(p.picksStatus.lastSavedAt)}
                      </span>
                    ) : p.picksStatus?.kind === "not_started" ? (
                      <span className="mt-1 block text-xs text-ash-muted">
                        No picks saved yet
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {poolIsPaid ? (
                      <span
                        className={
                          p.paid
                            ? "inline-flex rounded-full bg-ash-accent/20 px-2 py-0.5 text-xs font-semibold text-ash-accent"
                            : "inline-flex rounded-full bg-amber-950/40 px-2 py-0.5 text-xs font-semibold text-amber-200 ring-1 ring-amber-800/50"
                        }
                      >
                        {p.paid ? "Paid" : "Unpaid"}
                      </span>
                    ) : (
                      <span className="text-xs text-ash-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.inviteStatus !== "joined" ? (
                      <button
                        type="button"
                        disabled={
                          disabled ||
                          isPending ||
                          !p.email?.trim() ||
                          sendsBlocked ||
                          !emailConfirmOk
                        }
                        onClick={() => handleSendOrResendInvite(p.id)}
                        className="mr-2 text-sm font-medium text-ash-accent hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {sendsBlocked
                          ? "Email blocked"
                          : p.inviteStatus === "invited"
                            ? "Resend invite"
                            : "Send invite"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={disabled || isPending}
                      onClick={() => openEdit(p)}
                      className="mr-2 text-sm font-medium text-ash-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Edit
                    </button>
                    {canMoveParticipants ? (
                      <button
                        type="button"
                        disabled={disabled || isPending}
                        onClick={() => openMoveConfirm(p)}
                        className="mr-2 text-sm font-medium text-ash-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Move
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={disabled || isPending}
                      onClick={() => openRemoveConfirm(p)}
                      className="text-sm font-medium text-red-400 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Remove from pool
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Cards — mobile */}
      <ul className="space-y-3 md:hidden">
        {visibleParticipants.length === 0 ? (
          <li className="ash-surface px-4 py-8 text-center text-sm text-ash-muted">
            {sorted.length === 0
              ? "No participants yet."
              : "No participants match this filter."}
          </li>
        ) : (
          visibleParticipants.map((p) => (
            <li key={p.id} className="ash-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ash-text">{p.displayName}</p>
                  <p className="mt-0.5 text-sm text-ash-muted">{p.email}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={statusClass(p)}>{statusLabel(p)}</span>
                    <span className={picksStatusClass(p.picksStatus)}>
                      {picksStatusLabel(p.picksStatus)}
                    </span>
                  </div>
                  {p.inviteStatus === "invited" && p.inviteLastSentAt ? (
                    <p className="mt-1 text-xs text-ash-muted">
                      Last sent {formatDateTime(p.inviteLastSentAt)}
                    </p>
                  ) : null}
                  {p.picksStatus?.lastSavedAt ? (
                    <p className="mt-1 text-xs text-ash-muted">
                      Last saved {formatDateTime(p.picksStatus.lastSavedAt)}
                    </p>
                  ) : p.picksStatus?.kind === "not_started" ? (
                    <p className="mt-1 text-xs text-ash-muted">
                      No picks saved yet
                    </p>
                  ) : null}
                  {poolIsPaid ? (
                    <p className="mt-2">
                      <span
                        className={
                          p.paid
                            ? "inline-flex rounded-full bg-ash-accent/20 px-2 py-0.5 text-xs font-semibold text-ash-accent"
                            : "inline-flex rounded-full bg-amber-950/40 px-2 py-0.5 text-xs font-semibold text-amber-200 ring-1 ring-amber-800/50"
                        }
                      >
                        {p.paid ? "Paid" : "Unpaid"}
                      </span>
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {p.inviteStatus !== "joined" ? (
                    <button
                      type="button"
                      disabled={
                        disabled ||
                        isPending ||
                        !p.email?.trim() ||
                        sendsBlocked ||
                        !emailConfirmOk
                      }
                      onClick={() => handleSendOrResendInvite(p.id)}
                      className="text-sm font-medium text-ash-accent hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {sendsBlocked
                        ? "Email blocked"
                        : p.inviteStatus === "invited"
                          ? "Resend invite"
                          : "Send invite"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={disabled || isPending}
                    onClick={() => openEdit(p)}
                    className="text-sm font-medium text-ash-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Edit
                  </button>
                  {canMoveParticipants ? (
                    <button
                      type="button"
                      disabled={disabled || isPending}
                      onClick={() => openMoveConfirm(p)}
                      className="text-sm font-medium text-ash-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Move
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={disabled || isPending}
                    onClick={() => openRemoveConfirm(p)}
                    className="text-sm font-medium text-red-400 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove from pool
                  </button>
                </div>
              </div>
            </li>
          ))
        )}
      </ul>

      {movingParticipant ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="move-participant-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close dialog"
            onClick={closeMoveConfirm}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-ash-border bg-ash-surface p-5 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
            <h2
              id="move-participant-title"
              className="text-base font-bold text-ash-text"
            >
              Move participant
            </h2>
            <div className="mt-3 space-y-2 text-sm text-ash-muted">
              <p>{MOVE_PARTICIPANT_MODAL_INTRO}</p>
              <p>
                <span className="font-medium text-ash-text">Participant:</span>{" "}
                {moveParticipantModalSubject({
                  displayName: movingParticipant.displayName,
                  email: movingParticipant.email,
                })}
              </p>
              <p>
                <span className="font-medium text-ash-text">Current pool:</span>{" "}
                {currentPoolName}
              </p>
              <label className="block pt-1">
                <span className="font-medium text-ash-text">Destination pool</span>
                <select
                  value={moveDestinationId}
                  onChange={(e) => setMoveDestinationId(e.target.value)}
                  disabled={
                    disabled ||
                    isPending ||
                    moveOptionsForParticipant.eligibleOptions.length === 0
                  }
                  className="mt-2 w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm outline-none ring-ash-accent/20 focus:border-ash-accent focus:ring-2 disabled:opacity-50"
                >
                  {moveOptionsForParticipant.eligibleOptions.map((pool) => (
                    <option key={pool.id} value={pool.id}>
                      {pool.name}
                    </option>
                  ))}
                </select>
              </label>
              {moveOptionsForParticipant.emptyMessage ? (
                <p className="text-xs text-ash-muted">
                  {moveOptionsForParticipant.emptyMessage}
                </p>
              ) : null}
              {moveOptionsForParticipant.blockedDestinations.length > 0 ? (
                <div className="text-xs text-ash-muted">
                  <p className="font-medium text-ash-text">Unavailable destinations</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {moveOptionsForParticipant.blockedDestinations.map((blocked) => (
                      <li key={blocked.id}>{blocked.label}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="rounded-md border border-amber-800/60 bg-amber-950/25 px-3 py-2 text-amber-100">
                {MOVE_PARTICIPANT_CONFIRM_WARNING}
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={disabled || isPending}
                onClick={closeMoveConfirm}
                className="btn-ghost disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  disabled ||
                  isPending ||
                  !moveDestinationId ||
                  moveOptionsForParticipant.eligibleOptions.length === 0
                }
                onClick={handleConfirmMove}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirm move
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {removingParticipant ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-participant-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close dialog"
            onClick={closeRemoveConfirm}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-red-900/40 bg-ash-surface p-5 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
            <h2
              id="remove-participant-title"
              className="text-base font-bold text-ash-text"
            >
              Remove from pool
            </h2>
            <div className="mt-3 space-y-2 text-sm text-ash-muted">
              <p>
                This will remove{" "}
                <span className="font-medium text-ash-text">
                  {removeParticipantModalSubject({
                    displayName: removingParticipant.displayName,
                    email: removingParticipant.email,
                  })}
                </span>{" "}
                from this pool.
              </p>
              <p>Their AshBracket account will not be deleted.</p>
              <p>Other pools are not affected.</p>
              <p>Their picks and standings entry for this pool may be removed.</p>
            </div>
            {removeWarnings.length > 0 ? (
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-amber-200">
                {removeWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={disabled || isPending}
                onClick={closeRemoveConfirm}
                className="btn-ghost disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={disabled || isPending}
                onClick={handleConfirmRemove}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Remove participant
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingId ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-participant-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close dialog"
            onClick={closeEdit}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-ash-border bg-ash-surface p-5 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
            <h2
              id="edit-participant-title"
              className="text-base font-bold text-ash-text"
            >
              Edit participant
            </h2>
            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                  Display name
                </span>
                <input
                  required
                  disabled={disabled || isPending}
                  value={editForm.displayName}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, displayName: e.target.value }))
                  }
                  className="w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm outline-none ring-ash-accent/20 focus:border-ash-accent focus:ring-2 disabled:opacity-50"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                  Email
                </span>
                <input
                  required
                  disabled={disabled || isPending}
                  type="email"
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, email: e.target.value }))
                  }
                  className="w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm outline-none ring-ash-accent/20 focus:border-ash-accent focus:ring-2 disabled:opacity-50"
                />
              </label>
              {poolIsPaid ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ash-muted">
                  <input
                    type="checkbox"
                    disabled={disabled || isPending}
                    checked={editForm.paid}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, paid: e.target.checked }))
                    }
                    className="size-4 rounded border-ash-border text-ash-accent focus:ring-ash-accent disabled:opacity-50"
                  />
                  Mark as paid
                </label>
              ) : null}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={disabled || isPending}
                  onClick={closeEdit}
                  className="btn-ghost disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={disabled || isPending}
                  className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
