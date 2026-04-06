"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createParticipantAction,
  deleteParticipantAction,
  updateParticipantAction,
} from "../../app/admin/participants/actions";
import type { Participant } from "../../types/participant";

type ParticipantsManagerProps = {
  initialParticipants: Participant[];
  disabled?: boolean;
};

function emptyForm() {
  return { displayName: "", email: "", paid: false as boolean };
}

export function ParticipantsManager({
  initialParticipants,
  disabled = false,
}: ParticipantsManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [participants, setParticipants] = useState<Participant[]>(
    initialParticipants,
  );
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [actionError, setActionError] = useState<string | null>(null);

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

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    const name = addForm.displayName.trim();
    const email = addForm.email.trim();
    if (!name || !email) return;
    setActionError(null);
    startTransition(async () => {
      const res = await createParticipantAction({
        displayName: name,
        email,
        paid: addForm.paid,
      });
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      setAddForm(emptyForm());
      setAddOpen(false);
      router.refresh();
    });
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
      const res = await deleteParticipantAction(id);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ash-muted">
          {participants.length} participant
          {participants.length === 1 ? "" : "s"}
          {isPending ? " · saving…" : ""}
        </p>
        <button
          type="button"
          disabled={disabled || isPending}
          onClick={() => setAddOpen((o) => !o)}
          className={
            addOpen
              ? "btn-ghost transition disabled:cursor-not-allowed disabled:opacity-50"
              : "btn-primary transition disabled:cursor-not-allowed disabled:opacity-50"
          }
        >
          {addOpen ? "Cancel" : "Add participant"}
        </button>
      </div>

      {addOpen ? (
        <form onSubmit={handleAdd} className="ash-surface p-4">
          <h2 className="text-sm font-bold text-ash-text">
            New participant
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                Display name
              </span>
              <input
                required
                disabled={disabled || isPending}
                value={addForm.displayName}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, displayName: e.target.value }))
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
                value={addForm.email}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, email: e.target.value }))
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
              checked={addForm.paid}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, paid: e.target.checked }))
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
                setAddOpen(false);
                setAddForm(emptyForm());
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
              Add
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
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ash-border">
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-ash-muted"
                >
                  No participants yet. Add someone to get started.
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
