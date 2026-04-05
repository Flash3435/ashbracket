export function PageTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        {title}
      </h1>
      {description ? (
        <p className="text-base leading-relaxed text-zinc-600">{description}</p>
      ) : null}
    </div>
  );
}
