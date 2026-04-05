"use client";

import { useRouter } from "next/navigation";
import type { Participant } from "../../types/participant";

type AdminParticipantPickerProps = {
  participants: Participant[];
  selectedId: string | null;
  basePath?: string;
};

/**
 * Changes `?participant=` on the current admin route (full navigation).
 */
export function AdminParticipantPicker({
  participants,
  selectedId,
  basePath = "/admin/picks",
}: AdminParticipantPickerProps) {
  const router = useRouter();

  return (
    <div className="space-y-2">
      <label
        htmlFor="admin-participant-picker"
        className="block text-sm font-medium text-zinc-800"
      >
        Participant
      </label>
      <select
        id="admin-participant-picker"
        value={selectedId ?? ""}
        onChange={(e) => {
          const id = e.target.value;
          if (!id) {
            router.push(basePath);
            return;
          }
          router.push(`${basePath}?participant=${encodeURIComponent(id)}`);
        }}
        className="w-full max-w-md rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
      >
        <option value="">— Select a participant —</option>
        {participants.map((p) => (
          <option key={p.id} value={p.id}>
            {p.displayName}
            {p.email ? ` (${p.email})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
