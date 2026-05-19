"use client";

import {
  CONTACT_ROLES,
  CONTACT_TOPICS,
  type ContactRoleValue,
  type ContactTopicValue,
} from "@/lib/contact/contactFormConstants";
import { submitContactFormAction } from "@/lib/contact/submitContactFormAction";
import type { ContactFormContext, ContactPoolSuggestion } from "@/lib/contact/loadContactFormContext";
import { useState, useTransition } from "react";

const inputClassName =
  "w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm outline-none ring-ash-accent/20 focus:border-ash-accent focus:ring-2";

type ContactFormProps = Pick<
  ContactFormContext,
  "defaultEmail" | "defaultName" | "defaultRole" | "poolSuggestions"
>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-sm text-red-300" role="alert">
      {message}
    </p>
  );
}

export function ContactForm({
  defaultEmail,
  defaultName,
  defaultRole,
  poolSuggestions,
}: ContactFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [topic, setTopic] = useState<ContactTopicValue | "">("");
  const [role, setRole] = useState<ContactRoleValue | "">(defaultRole);
  const [poolContext, setPoolContext] = useState("");
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState("");

  const datalistId = "contact-pool-suggestions";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    startTransition(async () => {
      const res = await submitContactFormAction({
        name,
        email,
        topic,
        message,
        role,
        poolContext,
        sourcePage: "/contact",
        company,
      });

      if (!res.ok) {
        if (res.fieldErrors) {
          setFieldErrors(res.fieldErrors);
        }
        setFormError(res.error);
        return;
      }

      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="ash-surface space-y-3 p-6" role="status">
        <h2 className="text-lg font-semibold text-ash-text">Message sent</h2>
        <p className="text-sm text-ash-muted">
          Thanks for reaching out. We read every message and will get back to you
          when we can — we do not offer live support, so a reply may take a
          little time.
        </p>
        <p className="text-sm text-ash-muted">
          If your question is urgent, include as much detail as you can (pool
          name, what you were doing, and any error messages you saw).
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="ash-surface space-y-4 p-6">
      {/* Honeypot — hidden from users, not focused via keyboard */}
      <div
        className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
        aria-hidden="true"
      >
        <label htmlFor="contact-company">Company</label>
        <input
          id="contact-company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>

      {formError ? (
        <p
          className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {formError}
        </p>
      ) : null}

      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
          Name
        </span>
        <input
          type="text"
          required
          maxLength={200}
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isPending}
          className={inputClassName}
        />
        <FieldError message={fieldErrors.name} />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
          Email
        </span>
        <input
          type="email"
          required
          maxLength={320}
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isPending}
          className={inputClassName}
        />
        <FieldError message={fieldErrors.email} />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
          Topic
        </span>
        <select
          required
          value={topic}
          onChange={(e) => setTopic(e.target.value as ContactTopicValue | "")}
          disabled={isPending}
          className={inputClassName}
        >
          <option value="" disabled>
            Choose a topic…
          </option>
          {CONTACT_TOPICS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <FieldError message={fieldErrors.topic} />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
          Your role{" "}
          <span className="normal-case text-ash-footer">(optional)</span>
        </span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as ContactRoleValue | "")}
          disabled={isPending}
          className={inputClassName}
        >
          <option value="">Choose if helpful…</option>
          {CONTACT_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <FieldError message={fieldErrors.role} />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
          Pool name or link{" "}
          <span className="normal-case text-ash-footer">(optional)</span>
        </span>
        <input
          type="text"
          list={poolSuggestions.length > 0 ? datalistId : undefined}
          maxLength={500}
          placeholder="e.g. My World Cup pool or a link to your pool"
          value={poolContext}
          onChange={(e) => setPoolContext(e.target.value)}
          disabled={isPending}
          className={inputClassName}
        />
        {poolSuggestions.length > 0 ? (
          <datalist id={datalistId}>
            {poolSuggestions.map((s: ContactPoolSuggestion) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </datalist>
        ) : null}
        <FieldError message={fieldErrors.poolContext} />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
          Message
        </span>
        <textarea
          required
          rows={8}
          maxLength={5000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={isPending}
          className={inputClassName}
          placeholder="Tell us what you need help with, what went wrong, or what you would like to see."
        />
        <FieldError message={fieldErrors.message} />
      </label>

      <p className="text-xs text-ash-muted">
        We typically reply by email. Please do not send passwords or payment card
        numbers.
      </p>

      <button
        type="submit"
        disabled={isPending}
        className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {isPending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
