type Props = {
  warningMessage: string | null;
};

export function PoolScoringIntegrityWarning({ warningMessage }: Props) {
  if (!warningMessage) return null;

  return (
    <div
      className="mb-4 rounded-xl border border-amber-600/40 bg-amber-950/25 px-4 py-3 text-sm text-amber-100"
      role="status"
    >
      <p className="font-semibold">Scoring integrity warning</p>
      <p className="mt-1 leading-relaxed text-amber-50/90">{warningMessage}</p>
    </div>
  );
}
