"use client";

import { joinNhlActiveEdition } from "@/lib/nhl/join/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function NhlJoinCompetitionButton({
  editionName,
  redirectTo = "/nhl/picks",
  className = "btn-primary inline-flex text-sm no-underline",
}: {
  editionName: string;
  redirectTo?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    setPending(true);
    setError(null);
    try {
      const result = await joinNhlActiveEdition();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" className={className} disabled={pending} onClick={handleJoin}>
        {pending ? "Joining…" : `Join ${editionName}`}
      </button>
      {error ? <p className="text-sm text-amber-200/90">{error}</p> : null}
    </div>
  );
}
