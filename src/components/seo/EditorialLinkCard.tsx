import Link from 'next/link';

type EditorialLinkCardProps = {
  href: string;
  title: string;
  description: string;
  actionLabel: string;
  headingLevel?: 2 | 3;
};

/** Una misma estructura para los accesos a guías y comparativas. */
export function EditorialLinkCard({
  href,
  title,
  description,
  actionLabel,
  headingLevel = 3,
}: EditorialLinkCardProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <Link
      href={href}
      className="group block h-full min-w-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary"
    >
      <article className="flex h-full min-w-0 flex-col gap-2 border-4 border-border bg-card p-4 pixel-shadow transition-transform group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:border-primary">
        <Heading title={title} className="line-clamp-2 min-h-10 text-[12px] font-bold uppercase leading-5 text-primary">
          {title}
        </Heading>
        <p className="line-clamp-2 min-h-10 font-mono! text-xs leading-5 text-muted-foreground">
          {description}
        </p>
        <span className="mt-auto font-mono! text-xs font-bold uppercase leading-5 text-secondary">
          {actionLabel} →
        </span>
      </article>
    </Link>
  );
}
