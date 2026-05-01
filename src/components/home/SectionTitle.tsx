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
    <header className="mb-4 bg-card border-[3px] border-border pixel-shadow p-4 md:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-[12px] md:text-[14px] font-bold uppercase text-primary tracking-wide">
          {`[ ${title} ]`}
        </h2>
        <p className="text-[9px] uppercase text-foreground/80 mt-1 tracking-wide">{subtitle}</p>
      </div>

      {actionHref && actionLabel && (
        <a
          href={actionHref}
          className="inline-flex min-h-11 items-center justify-center border-2 border-secondary text-secondary text-[9px] font-bold uppercase px-3 py-2 hover:bg-secondary hover:text-secondary-foreground transition-colors min-w-[110px]"
        >
          {actionLabel}
        </a>
      )}
    </header>
  );
}
