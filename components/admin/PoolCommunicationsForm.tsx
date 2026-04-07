"use client";

import { useMemo, useState, useTransition } from "react";
import {
  sendPoolCommunicationsAction,
  sendPoolCommunicationsTestAction,
  type MessageKind,
} from "../../app/admin/communications/actions";
import {
  formatPoolLockSummary,
  getEmailTemplateDefaults,
  renderTemplatedPoolEmail,
} from "../../lib/communications/messageTemplates";
import {
  type PoolCommunicationParticipant,
  type RecipientPreset,
  resolvePoolEmailTargets,
} from "../../lib/communications/recipientResolve";

type PoolCommunicationsFormProps = {
  poolName: string;
  lockAtIso: string | null;
  participants: PoolCommunicationParticipant[];
};

const PRESET_OPTIONS: { value: RecipientPreset; label: string; hint: string }[] =
  [
    {
      value: "all",
      label: "Everyone with an email",
      hint: "All participants who have an email on file.",
    },
    {
      value: "unpaid",
      label: "Unpaid only",
      hint: "People not marked as paid on the Participants list.",
    },
    {
      value: "incomplete_picks",
      label: "Bracket not finished",
      hint: "Anyone missing a required pick (groups, knockout path, or bonuses).",
    },
    {
      value: "selected",
      label: "Choose individuals",
      hint: "Pick specific people below.",
    },
  ];

const MESSAGE_OPTIONS: {
  value: MessageKind;
  label: string;
  hint: string;
}[] = [
  {
    value: "payment_reminder",
    label: "Payment reminder",
    hint: "Short, friendly nudge about pool payment.",
  },
  {
    value: "deadline_reminder",
    label: "Picks deadline reminder",
    hint: "Mentions when picks lock (Alberta time) if a deadline is set.",
  },
  {
    value: "custom",
    label: "Custom email",
    hint: "Write your own subject and message.",
  },
];

function messageKindLabel(kind: MessageKind): string {
  return MESSAGE_OPTIONS.find((o) => o.value === kind)?.label ?? kind;
}

function initialDrafts(): Record<MessageKind, { subject: string; body: string }> {
  return {
    payment_reminder: getEmailTemplateDefaults("payment_reminder"),
    deadline_reminder: getEmailTemplateDefaults("deadline_reminder"),
    custom: getEmailTemplateDefaults("custom"),
  };
}

export function PoolCommunicationsForm({
  poolName,
  lockAtIso,
  participants,
}: PoolCommunicationsFormProps) {
  const [preset, setPreset] = useState<RecipientPreset>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [messageKind, setMessageKind] = useState<MessageKind>("payment_reminder");
  const [draftsByKind, setDraftsByKind] = useState(initialDrafts);
  const [formError, setFormError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const draft = draftsByKind[messageKind];

  const resolved = useMemo(
    () => resolvePoolEmailTargets(participants, preset, [...selectedIds]),
    [participants, preset, selectedIds],
  );

  const previewSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ?? "";

  const previewSampleName =
    resolved.targets[0]?.displayName ?? "Jamie Lee";

  const previewRendered = useMemo(() => {
    return renderTemplatedPoolEmail({
      subjectTemplate: draft.subject,
      bodyTemplate: draft.body,
      displayName: previewSampleName,
      poolName,
      lockAtIso,
      siteUrl: previewSiteUrl || undefined,
    });
  }, [
    draft.subject,
    draft.body,
    previewSampleName,
    poolName,
    lockAtIso,
    previewSiteUrl,
  ]);

  function setSubject(value: string) {
    setDraftsByKind((prev) => ({
      ...prev,
      [messageKind]: { ...prev[messageKind], subject: value },
    }));
  }

  function setBody(value: string) {
    setDraftsByKind((prev) => ({
      ...prev,
      [messageKind]: { ...prev[messageKind], body: value },
    }));
  }

  function resetToTemplate() {
    setDraftsByKind((prev) => ({
      ...prev,
      [messageKind]: getEmailTemplateDefaults(messageKind),
    }));
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runSend() {
    setFormError(null);
    setSendResult(null);
    startTransition(async () => {
      const res = await sendPoolCommunicationsAction({
        preset,
        selectedParticipantIds: [...selectedIds],
        subjectTemplate: draft.subject,
        bodyTemplate: draft.body,
      });
      setConfirmOpen(false);
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      if (!res.deliveryConfigured) {
        setSendResult(
          `Ready to email ${res.recipientCount} recipient(s), but outgoing email is not configured on this server. Set RESEND_API_KEY and INVITE_FROM_EMAIL (your verified sender) — same as pool invites — then try again. No messages were sent.`,
        );
        return;
      }
      if (res.failures.length === 0) {
        setSendResult(
          `Success — Resend accepted ${res.emailsAccepted} of ${res.recipientCount} email(s).`,
        );
      } else {
        setSendResult(
          `Partially sent: ${res.emailsAccepted} accepted, ${res.failures.length} failed. First error: ${res.failures[0]?.error ?? ""}`,
        );
      }
    });
  }

  function runTestSend() {
    setFormError(null);
    setSendResult(null);
    startTransition(async () => {
      const res = await sendPoolCommunicationsTestAction({
        subjectTemplate: draft.subject,
        bodyTemplate: draft.body,
      });
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      if (!res.deliveryConfigured) {
        setSendResult(
          "Test send skipped — outgoing email is not configured (RESEND_API_KEY and INVITE_FROM_EMAIL).",
        );
        return;
      }
      if (res.emailsAccepted >= 1 && res.failures.length === 0) {
        setSendResult(
          "Test email sent to your account email address (subject line is prefixed with “[Test]”).",
        );
      } else if (res.failures.length > 0) {
        setSendResult(
          `Test send failed: ${res.failures[0]?.error ?? "Unknown error"}`,
        );
      }
    });
  }

  const deadlineLabel = formatPoolLockSummary(lockAtIso);
  const canSend = resolved.targets.length > 0 && draft.subject.trim() && draft.body.trim();
  const noRecipients = resolved.targets.length === 0;

  return (
    <>
      <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
        {formError ? (
          <p
            className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
            role="alert"
          >
            {formError}
          </p>
        ) : null}
        {sendResult ? (
          <p
            className={`rounded-md border px-3 py-2 text-sm ${
              sendResult.startsWith("Success") ||
              sendResult.startsWith("Test email sent")
                ? "border-emerald-800/70 bg-emerald-950/35 text-emerald-100"
                : "border-amber-800/70 bg-amber-950/35 text-amber-100"
            }`}
            role="status"
          >
            {sendResult}
          </p>
        ) : null}

        <section className="ash-surface space-y-4 p-4">
          <h2 className="text-sm font-bold text-ash-text">Who should get this?</h2>
          <div className="space-y-3">
            {PRESET_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer gap-3 rounded-md border border-transparent p-2 hover:border-ash-border/60"
              >
                <input
                  type="radio"
                  name="recipientPreset"
                  checked={preset === opt.value}
                  onChange={() => setPreset(opt.value)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium text-ash-text">{opt.label}</span>
                  <span className="mt-0.5 block text-sm text-ash-muted">
                    {opt.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {preset === "selected" ? (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                Select people
              </p>
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-ash-border bg-ash-body/40 p-3">
                {participants.length === 0 ? (
                  <p className="text-sm text-ash-muted">No participants yet.</p>
                ) : (
                  participants.map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer flex-wrap items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleSelected(p.id)}
                      />
                      <span className="text-ash-text">{p.displayName}</span>
                      {p.email.trim() ? (
                        <span className="text-xs text-ash-muted">({p.email})</span>
                      ) : (
                        <span className="text-xs text-amber-300">(no email)</span>
                      )}
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                          p.isPaid
                            ? "bg-emerald-950/60 text-emerald-200"
                            : "bg-amber-950/50 text-amber-200"
                        }`}
                      >
                        {p.isPaid ? "Paid" : "Unpaid"}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                          p.picksComplete
                            ? "bg-slate-800 text-slate-200"
                            : "bg-orange-950/50 text-orange-200"
                        }`}
                      >
                        {p.picksComplete ? "Bracket done" : "Incomplete"}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          ) : null}

          <div className="rounded-md border border-ash-border bg-ash-body/30 px-3 py-2 text-sm text-ash-muted">
            <p>
              <span className="font-semibold text-ash-text">
                {resolved.targets.length}
              </span>{" "}
              {resolved.targets.length === 1 ? "recipient" : "recipients"} will
              receive this email.
            </p>
            {resolved.skippedNoEmail.length > 0 ? (
              <p className="mt-1">
                <span className="font-semibold text-amber-200">
                  {resolved.skippedNoEmail.length}
                </span>{" "}
                skipped in this pool (no email on file).
              </p>
            ) : null}
          </div>

          {noRecipients ? (
            <div className="rounded-md border border-amber-800/50 bg-amber-950/25 px-3 py-3 text-sm text-amber-100">
              <p className="font-medium">No recipients match this choice.</p>
              <p className="mt-1 text-amber-200/90">
                Choose a different audience, select people with email addresses, or
                add emails on the Participants page. Sending is disabled until at
                least one person can be mailed.
              </p>
            </div>
          ) : (
            <details className="group rounded-md border border-ash-border bg-ash-body/25">
              <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-ash-text marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-2">
                  <span className="text-ash-muted group-open:rotate-90">▸</span>
                  View recipients ({resolved.targets.length})
                </span>
              </summary>
              <ul className="max-h-64 space-y-2 overflow-y-auto border-t border-ash-border px-3 py-3">
                {resolved.targets.map((t) => {
                  const p = participants.find((x) => x.id === t.id);
                  return (
                    <li
                      key={t.id}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm"
                    >
                      <span className="font-medium text-ash-text">{t.displayName}</span>
                      <span className="text-xs text-ash-muted">{t.email}</span>
                      {p ? (
                        <>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                              p.isPaid
                                ? "bg-emerald-950/60 text-emerald-200"
                                : "bg-amber-950/50 text-amber-200"
                            }`}
                          >
                            {p.isPaid ? "Paid" : "Unpaid"}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                              p.picksComplete
                                ? "bg-slate-800 text-slate-200"
                                : "bg-orange-950/50 text-orange-200"
                            }`}
                          >
                            {p.picksComplete ? "Bracket complete" : "Incomplete"}
                          </span>
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </section>

        <section className="ash-surface space-y-4 p-4">
          <h2 className="text-sm font-bold text-ash-text">What kind of message?</h2>
          <div className="space-y-3">
            {MESSAGE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer gap-3 rounded-md border border-transparent p-2 hover:border-ash-border/60"
              >
                <input
                  type="radio"
                  name="messageKind"
                  checked={messageKind === opt.value}
                  onChange={() => setMessageKind(opt.value)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium text-ash-text">{opt.label}</span>
                  <span className="mt-0.5 block text-sm text-ash-muted">
                    {opt.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <label className="block flex-1 min-w-[12rem] space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                  Subject
                </span>
                <input
                  value={draft.subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text"
                  placeholder={`Reminder: ${poolName}`}
                  disabled={false}
                />
              </label>
              {messageKind !== "custom" ? (
                <button
                  type="button"
                  onClick={resetToTemplate}
                  className="shrink-0 rounded-md border border-ash-border bg-ash-body/60 px-3 py-2 text-xs font-medium text-ash-text hover:bg-ash-body"
                >
                  Reset to template
                </button>
              ) : null}
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                Message
              </span>
              <textarea
                value={draft.body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                className="w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text"
                placeholder="Write your message…"
              />
            </label>
            <p className="text-xs leading-relaxed text-ash-muted">
              Placeholders (replaced per recipient when sending):{" "}
              <code className="rounded bg-ash-body px-1">{"{{firstName}}"}</code>,{" "}
              <code className="rounded bg-ash-body px-1">{"{{displayName}}"}</code>,{" "}
              <code className="rounded bg-ash-body px-1">{"{{poolName}}"}</code>,{" "}
              <code className="rounded bg-ash-body px-1">{"{{deadline}}"}</code>{" "}
              (pool lock, Alberta time: {deadlineLabel}),{" "}
              <code className="rounded bg-ash-body px-1">{"{{signInUrl}}"}</code>.{" "}
              Legacy: <code className="rounded bg-ash-body px-1">{"{{name}}"}</code>,{" "}
              <code className="rounded bg-ash-body px-1">{"{{pool}}"}</code>.
            </p>
          </div>
        </section>

        <section className="ash-surface space-y-3 p-4">
          <h2 className="text-sm font-bold text-ash-text">Preview</h2>
          <p className="text-xs text-ash-muted">
            Sample using{" "}
            <span className="text-ash-text">{previewSampleName}</span>
            {resolved.targets[0]?.email ? (
              <>
                {" "}
                ({resolved.targets[0].email}) — each person gets their own name and
                placeholders filled in.
              </>
            ) : (
              <> — add participants with email to preview a real example.</>
            )}
          </p>
          <div className="rounded-md border border-ash-border bg-ash-body/50 p-3 text-sm">
            <p className="font-semibold text-ash-text">{previewRendered.subject}</p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-ash-muted">
              {previewRendered.text}
            </pre>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={pending || !canSend}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Working…" : "Send emails…"}
          </button>
          <button
            type="button"
            onClick={runTestSend}
            disabled={pending || !draft.subject.trim() || !draft.body.trim()}
            className="rounded-md border border-ash-border bg-ash-body/60 px-4 py-2 text-sm font-medium text-ash-text hover:bg-ash-body disabled:cursor-not-allowed disabled:opacity-50"
          >
            Test send to me
          </button>
          {!canSend && !noRecipients ? (
            <span className="text-sm text-ash-muted">
              Add a subject and message to send.
            </span>
          ) : null}
        </div>
      </form>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="send-confirm-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Close"
            onClick={() => setConfirmOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-lg border border-ash-border bg-ash-body p-6 shadow-xl">
            <h3
              id="send-confirm-title"
              className="text-base font-semibold text-ash-text"
            >
              Confirm send
            </h3>
            <ul className="mt-4 space-y-2 text-sm text-ash-muted">
              <li>
                <span className="text-ash-text">Pool:</span> {poolName}
              </li>
              <li>
                <span className="text-ash-text">Message type:</span>{" "}
                {messageKindLabel(messageKind)}
              </li>
              <li>
                <span className="text-ash-text">Recipients:</span>{" "}
                {resolved.targets.length}{" "}
                {resolved.targets.length === 1 ? "person" : "people"}
              </li>
            </ul>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-md border border-ash-border px-4 py-2 text-sm text-ash-text hover:bg-ash-body/80"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runSend}
                disabled={pending || !canSend}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? "Sending…" : "Confirm send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
