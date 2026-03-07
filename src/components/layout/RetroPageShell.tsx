import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type RetroPageShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
};

export function RetroPageShell({ title, subtitle, children, className }: RetroPageShellProps) {
  return (
    <div className="container mx-auto px-4 py-8">
      <section className="mb-8 bg-card border-4 border-border p-6 md:p-8 pixel-shadow">
        <h1 className="text-xl md:text-2xl font-bold uppercase text-primary mb-3">
          {`[ ${title} ]`}
        </h1>
        {subtitle && <p className="text-[10px] uppercase text-muted-foreground leading-relaxed">{subtitle}</p>}
      </section>

      <section className={cn('bg-card border-4 border-border p-6 md:p-8 pixel-shadow', className)}>{children}</section>
    </div>
  );
}

export default RetroPageShell;
