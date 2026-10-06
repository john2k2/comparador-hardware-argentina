import Link from 'next/link';
import { buildOfferReportHref, type OfferReportContext } from '@/lib/contact/offer-report';
import { cn } from '@/lib/utils';

/** Acción independiente: no envía mensajes ni registra un clic de compra. */
export function OfferReportLink({ context, className }: { context: OfferReportContext; className?: string }) {
  return <Link href={buildOfferReportHref(context)} prefetch={false}
    aria-label={`Reportar precio o enlace de ${context.productName}${context.storeName ? ` en ${context.storeName}` : ''}`}
    className={cn('inline-flex min-h-11 items-center font-mono text-xs normal-case leading-5 text-muted-foreground underline underline-offset-4 hover:text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary', className)}>
    Reportar precio o enlace
  </Link>;
}
