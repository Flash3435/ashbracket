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
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {actionError}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600">
          {participants.length} participant
          {participants.length === 1 ? "" : "s"}
          {isPending ? " · saving…" : ""}
        </p>
        <button
          type="button"
          disabled={disabled || isPending}
          onClick={() => setAddOpen((o) => !o)}
          className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {addOpen ? "Cancel" : "Add participant"}
        </button>
      </div>

      {addOpen ? (
        <form
          onSubmit={handleAdd}
          className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-zinc-900">
            New participant
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Display name
              </span>
              <input
                required
                disabled={disabled || isPending}
                value={addForm.displayName}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, displayName: e.target.value }))
                }
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none ring-emerald-700/20 focus:border-emerald-600 focus:ring-2 disabled:opacity-50"
                placeholder="e.g. Jamie Lee"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
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
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none ring-emerald-700/20 focus:border-emerald-600 focus:ring-2 disabled:opacity-50"
                placeholder="name@example.com"
              />
            </label>
          </div>
          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              disabled={disabled || isPending}
              checked={addForm.paid}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, paid: e.target.checked }))
              }
              className="size-4 rounded border-zinc-300 text-emerald-700 focus:ring-emerald-600 disabled:opacity-50"
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
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={disabled || isPending}
              className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </form>
      ) : null}

      {/* Table — desktop */}
      <div className="hidden overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  No participants yet. Add someone to get started.
                </td>
              </tr>
            ) : (
              sorted.map((p) => (
                <tr key={p.id} className="text-zinc-800">
                  <td className="px-4 py-3 font-medium text-zinc-900">
                    {p.displayName}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{p.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        p.paid
                          ? "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
                          : "inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600"
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
                      className="mr-2 text-sm font-medium text-emerald-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={disabled || isPending}
                      onClick={() => handleDelete(p.id)}
                      className="text-sm font-medium text-red-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
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
          <li className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
            No participants yet.
          </li>
        ) : (
          sorted.map((p) => (
            <li
              key={p.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-zinc-900">{p.displayName}</p>
                  <p className="mt-0.5 text-sm text-zinc-600">{p.email}</p>
                  <p className="mt-2">
                    <span
                      className={
                        p.paid
                          ? "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
                          : "inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600"
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
                    className="text-sm font-medium text-emerald-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={disabled || isPending}
                    onClick={() => handleDelete(p.id)}
                    className="text-sm font-medium text-red-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
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
            className="absolute inset-0 bg-zinc-900/40"
            aria-label="Close dialog"
            onClick={closeEdit}
          />
          <div className="relative z-10 w-full max-w-md rounded-lg border border-zinc-200 bg-white p-5 shadow-lg">
            <h2
              id="edit-participant-title"
              className="text-base font-semibold text-zinc-900"
            >
              Edit participant
            </h2>
            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Display name
                </span>
                <input
                  required
                  disabled={disabled || isPending}
                  value={editForm.displayName}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, displayName: e.target.value }))
                  }
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none ring-emerald-700/20 focus:border-emerald-600 focus:ring-2 disabled:opacity-50"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
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
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none ring-emerald-700/20 focus:border-emerald-600 focus:ring-2 disabled:opacity-50"
                />
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  disabled={disabled || isPending}
                  checked={editForm.paid}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, paid: e.target.checked }))
                  }
                  className="size-4 rounded border-zinc-300 text-emerald-700 focus:ring-emerald-600 disabled:opacity-50"
                />
                Paid
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={disabled || isPending}
                  onClick={closeEdit}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={disabled || isPending}
                  className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
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
