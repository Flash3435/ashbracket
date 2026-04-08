export function PageContainer({
  children,
  compactBottom,
}: {
  children: React.ReactNode;
  /** Slightly less bottom padding when the page no longer ends with a tall footer block. */
  compactBottom?: boolean;
}) {
  return (
    <div
      className={`mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-10 ${
        compactBottom ? "pb-12" : "pb-16"
      }`}
    >
      {children}
    </div>
  );
}
