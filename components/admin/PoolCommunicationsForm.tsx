"use client";

import { useMemo, useState, useTransition } from "react";
import {
  sendPoolCommunicationsAction,
  type MessageKind,
} from "../../app/admin/communications/actions";
import {
  buildCustomPoolEmail,
  buildDeadlineReminderEmail,
  buildPaymentReminderEmail,
  formatPoolLockSummary,
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

export function PoolCommunicationsForm({
  poolName,
  lockAtIso,
  participants,
}: PoolCommunicationsFormProps) {
  const [preset, setPreset] = useState<RecipientPreset>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [messageKind, setMessageKind] = useState<MessageKind>("payment_reminder");
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const resolved = useMemo(
    () => resolvePoolEmailTargets(participants, preset, [...selectedIds]),
    [participants, preset, selectedIds],
  );

  const previewSample = useMemo(() => {
    const name = resolved.targets[0]?.displayName ?? "Jamie Lee";
    if (messageKind === "payment_reminder") {
      return buildPaymentReminderEmail({ displayName: name, poolName });
    }
    if (messageKind === "deadline_reminder") {
      return buildDeadlineReminderEmail({
        displayName: name,
        poolName,
        lockAtIso,
      });
    }
    const sub = customSubject.trim() || "Reminder: {{pool}}";
    const body =
      customBody.trim() ||
      "Hi {{name}},\n\nQuick note about {{pool}}.\n\n— Your organizer";
    return buildCustomPoolEmail({
      displayName: name,
      poolName,
      lockAtIso,
      subjectTemplate: sub,
      bodyTemplate: body,
    });
  }, [
    customBody,
    customSubject,
    lockAtIso,
    messageKind,
    poolName,
    resolved.targets,
  ]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSendResult(null);
    startTransition(async () => {
      const res = await sendPoolCommunicationsAction({
        preset,
        selectedParticipantIds: [...selectedIds],
        messageKind,
        customSubject,
        customBody,
      });
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

  const deadlineLabel = formatPoolLockSummary(lockAtIso);

  return (
    <form onSubmit={handleSend} className="space-y-8">
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
            sendResult.startsWith("Success")
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
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-ash-border bg-ash-body/40 p-3">
              {participants.length === 0 ? (
                <p className="text-sm text-ash-muted">No participants yet.</p>
              ) : (
                participants.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleSelected(p.id)}
                    />
                    <span className="text-ash-text">{p.displayName}</span>
                    {!p.email.trim() ? (
                      <span className="text-xs text-amber-300">(no email)</span>
                    ) : null}
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
            {resolved.targets.length === 1 ? "person" : "people"} will receive
            this email.
          </p>
          {resolved.skippedNoEmail.length > 0 ? (
            <p className="mt-1">
              <span className="font-semibold text-amber-200">
                {resolved.skippedNoEmail.length}
              </span>{" "}
              skipped (no email on file).
            </p>
          ) : null}
        </div>
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

        {messageKind === "custom" ? (
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                Subject
              </span>
              <input
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                className="w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text"
                placeholder={`Reminder: ${poolName}`}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                Message
              </span>
              <textarea
                value={customBody}
                onChange={(e) => setCustomBody(e.target.value)}
                rows={6}
                className="w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text"
                placeholder={`Hi {{name}},\n\n…`}
              />
            </label>
            <p className="text-xs text-ash-muted">
              Optional placeholders:{" "}
              <code className="rounded bg-ash-body px-1">{"{{name}}"}</code>,{" "}
              <code className="rounded bg-ash-body px-1">{"{{pool}}"}</code>,{" "}
              <code className="rounded bg-ash-body px-1">{"{{deadline}}"}</code>{" "}
              (Alberta time for the pool lock: {deadlineLabel}).
            </p>
          </div>
        ) : null}
      </section>

      <section className="ash-surface space-y-3 p-4">
        <h2 className="text-sm font-bold text-ash-text">Preview</h2>
        <p className="text-xs text-ash-muted">
          Sample using{" "}
          <span className="text-ash-text">
            {resolved.targets[0]?.displayName ?? "Jamie Lee"}
          </span>
          {resolved.targets[0]?.email ? (
            <>
              {" "}
              ({resolved.targets[0].email}) — everyone gets their own name and
              address.
            </>
          ) : (
            <> — add participants to see a real example.</>
          )}
        </p>
        <div className="rounded-md border border-ash-border bg-ash-body/50 p-3 text-sm">
          <p className="font-semibold text-ash-text">{previewSample.subject}</p>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-ash-muted">
            {previewSample.text}
          </pre>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || resolved.targets.length === 0}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send emails"}
        </button>
        {resolved.targets.length === 0 ? (
          <span className="text-sm text-ash-muted">
            No recipients match this choice.
          </span>
        ) : null}
      </div>
    </form>
  );
}
