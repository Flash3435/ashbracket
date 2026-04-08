"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createParticipantAction,
  deleteParticipantAction,
  inviteParticipantAction,
  sendParticipantInviteAction,
  updateParticipantAction,
} from "../../app/admin/participants/actions";
import type { Participant } from "../../types/participant";

type ParticipantsManagerProps = {
  poolId: string;
  initialParticipants: Participant[];
  disabled?: boolean;
};

type Panel = "none" | "invite" | "manual";

function emptyForm() {
  return { displayName: "", email: "", paid: false as boolean };
}

function statusLabel(p: Participant): string {
  if (p.inviteStatus === "joined") return "Joined";
  if (p.inviteStatus === "invited") return "Invited";
  return "Manual";
}

function statusClass(p: Participant): string {
  if (p.inviteStatus === "joined") {
    return "inline-flex rounded-full bg-emerald-950/50 px-2 py-0.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-800/60";
  }
  if (p.inviteStatus === "invited") {
    return "inline-flex rounded-full bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-200 ring-1 ring-amber-800/50";
  }
  return "inline-flex rounded-full bg-ash-body px-2 py-0.5 text-xs font-medium text-ash-muted ring-1 ring-ash-border";
}

type InviteFeedback = {
  tone: "success" | "warning";
  headline: string;
  detail?: string;
  inviteUrl?: string;
};

export function ParticipantsManager({
  poolId,
  initialParticipants,
  disabled = false,
}: ParticipantsManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [participants, setParticipants] = useState<Participant[]>(
    initialParticipants,
  );
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

  useEffect(() => {
    setParticipants(initialParticipants);
  }, [initialParticipants]);

  const sorted = useMemo(
    () =>
      [...participants].sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, {
          sensitivity: "base",
        }),
      ),
    [participants],
  );

  function openEdit(p: Participant) {
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
    if (disabled) return;
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
    if (disabled) return;
    setActionError(null);
    setInviteFeedback(null);
    setCopyDone(false);
    startTransition(async () => {
      const res = await sendParticipantInviteAction({ poolId, participantId: id });
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

  function handleDelete(id: string) {
    if (disabled) return;
    const p = participants.find((x) => x.id === id);
    if (
      !p ||
      !window.confirm(
        `Remove ${p.displayName} from this pool? This cannot be undone.`,
      )
    ) {
      return;
    }
    setActionError(null);
    startTransition(async () => {
      const res = await deleteParticipantAction({ poolId, id });
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      if (editingId === id) closeEdit();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ash-muted">
          {participants.length} participant
          {participants.length === 1 ? "" : "s"}
          {isPending ? " · saving…" : ""}
        </p>
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
        <span className="font-semibold text-ash-text">Invite participant</span>{" "}
        emails a private link so they can sign in and open picks.{" "}
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
            Paid
          </label>
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
              disabled={disabled || isPending}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send invite
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
            Paid
          </label>
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
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ash-border">
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-ash-muted"
                >
                  No participants yet. Invite someone or add them manually.
                </td>
              </tr>
            ) : (
              sorted.map((p) => (
                <tr key={p.id} className="text-ash-muted">
                  <td className="px-4 py-3 font-medium text-ash-text">
                    {p.displayName}
                  </td>
                  <td className="px-4 py-3 text-ash-muted">{p.email}</td>
                  <td className="px-4 py-3">
                    <span className={statusClass(p)}>{statusLabel(p)}</span>
                    {p.inviteStatus === "invited" && p.inviteLastSentAt ? (
                      <span className="mt-1 block text-xs text-ash-muted">
                        Last sent{" "}
                        {new Date(p.inviteLastSentAt).toLocaleString(undefined, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        p.paid
                          ? "inline-flex rounded-full bg-ash-accent/20 px-2 py-0.5 text-xs font-medium text-ash-accent"
                          : "inline-flex rounded-full bg-ash-body px-2 py-0.5 text-xs font-medium text-ash-muted ring-1 ring-ash-border"
                      }
                    >
                      {p.paid ? "Paid" : "Unpaid"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.inviteStatus !== "joined" ? (
                      <button
                        type="button"
                        disabled={disabled || isPending || !p.email?.trim()}
                        onClick={() => handleSendOrResendInvite(p.id)}
                        className="mr-2 text-sm font-medium text-ash-accent hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {p.inviteStatus === "invited"
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
                    <button
                      type="button"
                      disabled={disabled || isPending}
                      onClick={() => handleDelete(p.id)}
                      className="text-sm font-medium text-red-400 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Delete
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
        {sorted.length === 0 ? (
          <li className="ash-surface px-4 py-8 text-center text-sm text-ash-muted">
            No participants yet.
          </li>
        ) : (
          sorted.map((p) => (
            <li key={p.id} className="ash-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ash-text">{p.displayName}</p>
                  <p className="mt-0.5 text-sm text-ash-muted">{p.email}</p>
                  <p className="mt-2">
                    <span className={statusClass(p)}>{statusLabel(p)}</span>
                  </p>
                  {p.inviteStatus === "invited" && p.inviteLastSentAt ? (
                    <p className="mt-1 text-xs text-ash-muted">
                      Last sent{" "}
                      {new Date(p.inviteLastSentAt).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                  ) : null}
                  <p className="mt-2">
                    <span
                      className={
                        p.paid
                          ? "inline-flex rounded-full bg-ash-accent/20 px-2 py-0.5 text-xs font-medium text-ash-accent"
                          : "inline-flex rounded-full bg-ash-body px-2 py-0.5 text-xs font-medium text-ash-muted ring-1 ring-ash-border"
                      }
                    >
                      {p.paid ? "Paid" : "Unpaid"}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {p.inviteStatus !== "joined" ? (
                    <button
                      type="button"
                      disabled={disabled || isPending || !p.email?.trim()}
                      onClick={() => handleSendOrResendInvite(p.id)}
                      className="text-sm font-medium text-ash-accent hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {p.inviteStatus === "invited"
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
                  <button
                    type="button"
                    disabled={disabled || isPending}
                    onClick={() => handleDelete(p.id)}
                    className="text-sm font-medium text-red-400 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))
        )}
      </ul>

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
                Paid
              </label>
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
