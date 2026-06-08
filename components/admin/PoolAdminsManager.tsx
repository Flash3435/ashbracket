"use client";

import type { PoolAdminListEntry } from "@/lib/pools/listPoolAdmins";
import { formatPoolAdminListEntryLabel } from "@/lib/pools/formatPoolAdminIdentity";
import {
  type PoolAdminInviteListEntry,
  poolAdminInviteStatus,
  poolAdminInviteStatusLabel,
} from "@/lib/pools/listPoolAdminInvites";
import {
  resendPoolAdminInviteAction,
  revokePoolAdminInviteAction,
} from "@/lib/pools/poolAdminInviteActions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addPoolAdminAction,
  removePoolAdminAction,
  transferPoolOwnershipAction,
  updatePoolAdminRoleAction,
  type PoolAdminActionResult,
} from "@/lib/pools/poolAdminMembershipActions";

type Props = {
  poolId: string;
  initialRows: PoolAdminListEntry[];
  initialPendingInvites: PoolAdminInviteListEntry[];
  initialInviteHistory: PoolAdminInviteListEntry[];
  loginUrl: string;
  canManageMembership: boolean;
  viewerUserId: string;
};

function flashFromResult(r: PoolAdminActionResult): string | null {
  if (!r.ok) return r.error;
  return r.message ?? null;
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function PoolAdminsManager({
  poolId,
  initialRows,
  initialPendingInvites,
  initialInviteHistory,
  loginUrl,
  canManageMembership,
  viewerUserId,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [addRole, setAddRole] = useState<"admin" | "owner">("admin");
  const [transferTargetId, setTransferTargetId] = useState("");
  const [demoteSelfAfterTransfer, setDemoteSelfAfterTransfer] = useState(true);
  const [roleDraft, setRoleDraft] = useState<Record<string, "owner" | "admin">>(
    () =>
      Object.fromEntries(
        initialRows.map((r) => [r.membershipId, r.role]),
      ) as Record<string, "owner" | "admin">,
  );

  const ownerCount = initialRows.filter((r) => r.role === "owner").length;

  const transferCandidates = initialRows.filter(
    (r) => r.role === "admin" && r.userId !== viewerUserId,
  );

  function runAction(fn: () => Promise<PoolAdminActionResult>) {
    startTransition(async () => {
      setFlash(null);
      const res = await fn();
      const msg = flashFromResult(res);
      if (msg) setFlash(msg);
      if (res.ok) {
        setTransferTargetId("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      {flash ? (
        <p
          className="rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text"
          role="status"
        >
          {flash}
        </p>
      ) : null}

      <div className="rounded-md border border-ash-border bg-ash-body/40 p-4 text-sm text-ash-muted">
        <p className="font-medium text-ash-text">Pool owner vs pool admin</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            <span className="text-ash-text">Pool owners</span> control settings
            and who else is a pool owner or pool admin.{" "}
            <span className="text-ash-muted">
              (Global administrators can do this for any pool.)
            </span>
          </li>
          <li>
            <span className="text-ash-text">Pool admins</span> can run day-to-day
            operations (participants, picks, email, etc.) but cannot add or remove
            admins unless they are also a pool owner.
          </li>
        </ul>
        <p className="mt-3 text-ash-muted">
          To hand off primary control, use{" "}
          <span className="text-ash-text">Transfer ownership</span> below
          instead of manually changing roles.
        </p>
      </div>

      {canManageMembership && transferCandidates.length > 0 ? (
        <div className="rounded-md border border-amber-900/40 bg-amber-950/20 p-4 text-sm">
          <p className="font-medium text-ash-text">Transfer ownership</p>
          <p className="mt-2 text-ash-muted">
            Choose an existing <span className="text-ash-text">pool admin</span>{" "}
            to become a pool owner. The pool always keeps at least one owner. You
            can optionally step down to pool admin in the same step once they are
            an owner.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-[12rem] flex-1">
              <label
                htmlFor="transfer-target"
                className="block text-xs font-medium text-ash-muted"
              >
                New owner (current admins)
              </label>
              <select
                id="transfer-target"
                value={transferTargetId}
                onChange={(e) => setTransferTargetId(e.target.value)}
                className="mt-1 w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text"
                disabled={pending}
              >
                <option value="">Select…</option>
                {transferCandidates.map((r) => (
                  <option key={r.membershipId} value={r.membershipId}>
                    {formatPoolAdminListEntryLabel(r)}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-ash-text">
              <input
                type="checkbox"
                checked={demoteSelfAfterTransfer}
                onChange={(e) => setDemoteSelfAfterTransfer(e.target.checked)}
                disabled={pending}
                className="rounded border-ash-border"
              />
              <span className="text-sm">
                Step me down to pool admin after transfer (when I have an owner
                row in this pool)
              </span>
            </label>
            <button
              type="button"
              className="rounded-md bg-ash-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={pending || !transferTargetId}
              onClick={() => {
                if (
                  !window.confirm(
                    "Transfer ownership to the selected person? They will become a pool owner.",
                  )
                ) {
                  return;
                }
                runAction(() =>
                  transferPoolOwnershipAction({
                    poolId,
                    targetMembershipId: transferTargetId,
                    demoteSelfToAdmin: demoteSelfAfterTransfer,
                  }),
                );
              }}
            >
              Transfer ownership
            </button>
          </div>
        </div>
      ) : null}

      {canManageMembership && transferCandidates.length === 0 ? (
        <p className="rounded-md border border-ash-border bg-ash-body/30 px-3 py-2 text-sm text-ash-muted">
          To transfer ownership, add another pool admin first (or promote someone
          from admin to owner using the table), then use transfer or role
          controls. The pool must always have at least one owner.
        </p>
      ) : null}

      {!canManageMembership ? (
        <p className="text-sm text-ash-muted">
          You can see who manages this pool. Only pool owners (or global
          administrators) can change admin membership or view the audit log.
        </p>
      ) : (
        <form
          className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            runAction(() =>
              addPoolAdminAction({
                poolId,
                email,
                role: addRole,
              }),
            );
          }}
        >
          <div className="min-w-[12rem] flex-1">
            <label
              htmlFor="add-admin-email"
              className="block text-xs font-medium text-ash-muted"
            >
              Add by email
            </label>
            <input
              id="add-admin-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@example.com"
              className="mt-1 w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text"
              disabled={pending}
              required
            />
            <p className="mt-1 text-xs text-ash-muted">
              If they already participate in this pool, access is added
              immediately. Otherwise a pending admin invite is created until they
              register with this email.
            </p>
          </div>
          <div>
            <label
              htmlFor="add-admin-role"
              className="block text-xs font-medium text-ash-muted"
            >
              Role
            </label>
            <select
              id="add-admin-role"
              value={addRole}
              onChange={(e) =>
                setAddRole(e.target.value === "owner" ? "owner" : "admin")
              }
              className="mt-1 rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text"
              disabled={pending}
            >
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-ash-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={pending}
          >
            Add or invite
          </button>
        </form>
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium text-ash-text">
          Current admins
        </h2>
        <div className="overflow-x-auto rounded-md border border-ash-border">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="border-b border-ash-border bg-ash-body/60 text-xs uppercase text-ash-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Person</th>
                <th className="px-3 py-2 font-medium">Role</th>
                {canManageMembership ? (
                  <th className="px-3 py-2 font-medium">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {initialRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={canManageMembership ? 3 : 2}
                    className="px-3 py-4 text-ash-muted"
                  >
                    No pool admins loaded.
                  </td>
                </tr>
              ) : (
                initialRows.map((row) => {
                  const draft = roleDraft[row.membershipId] ?? row.role;
                  const isOnlyOwner = row.role === "owner" && ownerCount <= 1;
                  return (
                    <tr
                      key={row.membershipId}
                      className="border-b border-ash-border/80"
                    >
                      <td className="px-3 py-3 align-top text-ash-text">
                        <div>{formatPoolAdminListEntryLabel(row)}</div>
                        {!row.email?.trim() && !row.displayName?.trim() ? (
                          <div className="mt-0.5 font-mono text-xs text-ash-muted">
                            {row.userId}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span
                          className={
                            row.role === "owner"
                              ? "rounded bg-amber-950/50 px-2 py-0.5 text-xs font-medium text-amber-200"
                              : "rounded bg-ash-body px-2 py-0.5 text-xs font-medium text-ash-muted"
                          }
                        >
                          {row.role === "owner" ? "Owner" : "Admin"}
                        </span>
                      </td>
                      {canManageMembership ? (
                        <td className="px-3 py-3 align-top">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <select
                              value={draft}
                              onChange={(e) =>
                                setRoleDraft((prev) => ({
                                  ...prev,
                                  [row.membershipId]:
                                    e.target.value === "owner"
                                      ? "owner"
                                      : "admin",
                                }))
                              }
                              className="max-w-[10rem] rounded-md border border-ash-border bg-ash-body px-2 py-1 text-sm"
                              disabled={pending}
                            >
                              <option value="admin">Admin</option>
                              <option value="owner">Owner</option>
                            </select>
                            <button
                              type="button"
                              className="rounded-md border border-ash-border px-3 py-1 text-sm text-ash-text hover:bg-ash-body disabled:opacity-40"
                              disabled={
                                pending ||
                                draft === row.role ||
                                (row.role === "owner" &&
                                  draft === "admin" &&
                                  isOnlyOwner)
                              }
                              onClick={() =>
                                runAction(() =>
                                  updatePoolAdminRoleAction({
                                    poolId,
                                    membershipId: row.membershipId,
                                    role: draft,
                                  }),
                                )
                              }
                            >
                              Save role
                            </button>
                            <button
                              type="button"
                              className="rounded-md border border-red-900/60 px-3 py-1 text-sm text-red-200 hover:bg-red-950/40 disabled:opacity-40"
                              disabled={
                                pending ||
                                (row.role === "owner" && isOnlyOwner)
                              }
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    "Remove this person from pool admin access?",
                                  )
                                ) {
                                  return;
                                }
                                runAction(() =>
                                  removePoolAdminAction({
                                    poolId,
                                    membershipId: row.membershipId,
                                  }),
                                );
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-ash-text">
          Pending admin invites
        </h2>
        <p className="mb-2 text-xs text-ash-muted">
          These apply after the person signs up or signs in with the invited
          email.{" "}
          <span className="text-ash-text">
            Pending invites are not pool admins (or owners)
          </span>{" "}
          until accepted. After someone accepts, they appear under{" "}
          <span className="text-ash-text">Current admins</span> and in{" "}
          <span className="text-ash-text">Invite history</span> below.
        </p>
        {canManageMembership ? (
          <p className="mb-2 text-xs text-ash-muted">
            Sign-in link for invitees:{" "}
            <span className="break-all font-mono text-ash-text">{loginUrl}</span>
            <button
              type="button"
              className="ml-2 rounded border border-ash-border px-2 py-0.5 text-xs text-ash-text hover:bg-ash-body"
              onClick={() => {
                void navigator.clipboard.writeText(loginUrl);
              }}
            >
              Copy
            </button>
          </p>
        ) : null}
        <div className="overflow-x-auto rounded-md border border-ash-border">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b border-ash-border bg-ash-body/60 text-xs uppercase text-ash-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Created</th>
                {canManageMembership ? (
                  <th className="px-3 py-2 font-medium">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {initialPendingInvites.length === 0 ? (
                <tr>
                  <td
                    colSpan={canManageMembership ? 4 : 3}
                    className="px-3 py-4 text-ash-muted"
                  >
                    No pending invitations.
                  </td>
                </tr>
              ) : (
                initialPendingInvites.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-ash-border/80"
                  >
                    <td className="px-3 py-3 align-top text-sm text-ash-text">
                      {inv.invitedEmail}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span
                        className={
                          inv.role === "owner"
                            ? "rounded bg-amber-950/50 px-2 py-0.5 text-xs font-medium text-amber-200"
                            : "rounded bg-ash-body px-2 py-0.5 text-xs font-medium text-ash-muted"
                        }
                      >
                        {inv.role === "owner" ? "Owner" : "Admin"}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top text-xs text-ash-muted">
                      {formatWhen(inv.createdAt)}
                    </td>
                    {canManageMembership ? (
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-md border border-ash-border px-2 py-1 text-xs text-ash-text hover:bg-ash-body disabled:opacity-40"
                            disabled={pending}
                            onClick={() =>
                              runAction(() =>
                                resendPoolAdminInviteAction({
                                  poolId,
                                  inviteId: inv.id,
                                }),
                              )
                            }
                          >
                            Resend email
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-red-900/60 px-2 py-1 text-xs text-red-200 hover:bg-red-950/40 disabled:opacity-40"
                            disabled={pending}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  "Revoke this invitation? The email will no longer receive access when they sign in.",
                                )
                              ) {
                                return;
                              }
                              runAction(() =>
                                revokePoolAdminInviteAction({
                                  poolId,
                                  inviteId: inv.id,
                                }),
                              );
                            }}
                          >
                            Revoke
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-ash-text">
          Invite history
        </h2>
        <p className="mb-2 text-xs text-ash-muted">
          Accepted invites (the person signed in and became a pool admin or
          owner). Revoked invites no longer grant access if that email signs in
          later.
        </p>
        <div className="overflow-x-auto rounded-md border border-ash-border">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b border-ash-border bg-ash-body/60 text-xs uppercase text-ash-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {initialInviteHistory.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-4 text-ash-muted"
                  >
                    No accepted or revoked invites yet.
                  </td>
                </tr>
              ) : (
                initialInviteHistory.map((inv) => {
                  const status = poolAdminInviteStatus(inv);
                  return (
                    <tr
                      key={inv.id}
                      className="border-b border-ash-border/80"
                    >
                      <td className="px-3 py-3 align-top text-sm text-ash-text">
                        {inv.invitedEmail}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span
                          className={
                            inv.role === "owner"
                              ? "rounded bg-amber-950/50 px-2 py-0.5 text-xs font-medium text-amber-200"
                              : "rounded bg-ash-body px-2 py-0.5 text-xs font-medium text-ash-muted"
                          }
                        >
                          {inv.role === "owner" ? "Owner" : "Admin"}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top text-ash-text">
                        {poolAdminInviteStatusLabel(status)}
                      </td>
                      <td className="px-3 py-3 align-top text-xs text-ash-muted">
                        {formatWhen(inv.createdAt)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
