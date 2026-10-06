export function SectionTitle({
  title,
  subtitle,
  actionHref,
  actionLabel,
}: {
  title: string;
  subtitle: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <header className="mt-10 mb-4 border-b-2 border-border pb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-[12px] md:text-[14px] font-bold uppercase text-primary tracking-wide break-words">
          {`[ ${title} ]`}
        </h2>
        <p className="font-mono text-sm text-foreground/80 mt-2 break-words">{subtitle}</p>
      </div>

      {actionHref && actionLabel && (
        <a
          href={actionHref}
          className="inline-flex min-h-11 items-center justify-center text-secondary text-[12px] font-bold uppercase px-3 py-2 hover:text-primary underline underline-offset-4 transition-colors min-w-[110px]"
        >
          {actionLabel}
        </a>
      )}
    </header>
  );
}
