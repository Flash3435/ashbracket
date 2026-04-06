export function PageTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      <h1 className="text-3xl font-bold tracking-tight text-ash-text">
        {title}
      </h1>
      {description ? (
        <p className="text-base font-normal leading-relaxed text-ash-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
}
