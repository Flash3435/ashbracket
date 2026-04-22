"use client";

import { useState, useTransition } from "react";
import {
  applyOfficialRoundOf32FromEnteredResultsAction,
  previewOfficialRoundOf32FromEnteredResultsAction,
} from "../../app/admin/results/actions";
import type { OfficialR32PreviewMatch } from "../../lib/admin/officialRoundOf32FromResults";

export function ApplyOfficialRoundOf32Panel() {
  const [isPreviewing, startPreview] = useTransition();
  const [isApplying, startApply] = useTransition();
  const [matches, setMatches] = useState<OfficialR32PreviewMatch[] | null>(null);
  const [slotTeamIdByKey, setSlotTeamIdByKey] = useState<Record<
    string,
    string
  > | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = isPreviewing || isApplying;

  function resetPreview() {
    setMatches(null);
    setSlotTeamIdByKey(null);
    setConfirmed(false);
  }

  return (
    <div className="ash-surface mb-8 space-y-3 p-4">
      <h2 className="text-base font-bold text-ash-text">FIFA Round of 32 (Annex C)</h2>
      <p className="text-sm text-ash-muted">
        Generate a preview from the official group 1st/2nd rows and the eight third-place
        advancers above. Review every pairing (including FIFA route labels for third-place
        sides), then confirm and apply. Applying overwrites all 32{" "}
        <span className="text-ash-text/90">Round of 32</span> result slots.
      </p>
      {error ? (
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-md border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setError(null);
            setMessage(null);
            resetPreview();
            startPreview(async () => {
              const res = await previewOfficialRoundOf32FromEnteredResultsAction();
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setMatches(res.matches);
              setSlotTeamIdByKey(res.slotTeamIdByKey);
            });
          }}
          className="rounded-md border border-ash-border bg-ash-body/40 px-4 py-2 text-sm font-medium text-ash-text outline-none ring-ash-accent/25 hover:bg-ash-border/25 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPreviewing ? "Generating preview…" : "Generate preview"}
        </button>
        {matches && slotTeamIdByKey ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              resetPreview();
              setError(null);
              setMessage(null);
            }}
            className="rounded-md border border-ash-border/80 px-4 py-2 text-sm text-ash-muted hover:bg-ash-body/30 disabled:opacity-50"
          >
            Clear preview
          </button>
        ) : null}
      </div>

      {matches && slotTeamIdByKey ? (
        <div className="space-y-3">
          <div className="max-h-[360px] overflow-auto rounded-md border border-ash-border/60 bg-ash-body/20">
            <table className="w-full min-w-[520px] border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-ash-body/95 text-[10px] font-semibold uppercase tracking-wide text-ash-muted">
                <tr>
                  <th className="border-b border-ash-border/60 px-2 py-2">Match</th>
                  <th className="border-b border-ash-border/60 px-2 py-2">Home</th>
                  <th className="border-b border-ash-border/60 px-2 py-2">Away</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => (
                  <tr key={m.fifaMatchNo} className="border-b border-ash-border/40">
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-ash-text">
                      M{m.fifaMatchNo}
                    </td>
                    <td className="px-2 py-1.5 text-ash-text">
                      <div className="font-medium">{m.home.teamName}</div>
                      <div className="text-[10px] text-ash-muted">
                        {m.home.countryCode}
                        {m.home.routeLabel ? (
                          <span className="text-ash-accent/90"> · {m.home.routeLabel}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-ash-text">
                      <div className="font-medium">{m.away.teamName}</div>
                      <div className="text-[10px] text-ash-muted">
                        {m.away.countryCode}
                        {m.away.routeLabel ? (
                          <span className="text-ash-accent/90"> · {m.away.routeLabel}</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-sm text-ash-text">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1"
            />
            <span>
              I have reviewed these 16 pairings and the third-place route labels. I want to
              write them to official results now.
            </span>
          </label>

          <button
            type="button"
            disabled={busy || !confirmed}
            onClick={() => {
              setError(null);
              setMessage(null);
              startApply(async () => {
                const res = await applyOfficialRoundOf32FromEnteredResultsAction({
                  slotTeamIdByKey: slotTeamIdByKey!,
                });
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                setMessage(res.message);
                resetPreview();
              });
            }}
            className="rounded-md border border-ash-accent/50 bg-ash-accent/15 px-4 py-2 text-sm font-medium text-ash-text outline-none ring-ash-accent/25 hover:bg-ash-accent/25 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isApplying ? "Applying…" : "Apply official Round of 32"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
