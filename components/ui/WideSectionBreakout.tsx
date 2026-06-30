type Props = {
  children: React.ReactNode;
  /** Max inner content width on large screens. */
  maxWidthClassName?: string;
};

/**
 * Breaks a section out of a narrow page column into a wider desktop band
 * without causing body-level horizontal overflow.
 */
export function WideSectionBreakout({
  children,
  maxWidthClassName = "max-w-[1600px]",
}: Props) {
  return (
    <div className="w-full lg:relative lg:left-1/2 lg:w-screen lg:max-w-[100vw] lg:-translate-x-1/2">
      <div className={`mx-auto w-full px-4 lg:px-6 ${maxWidthClassName}`}>{children}</div>
    </div>
  );
}
