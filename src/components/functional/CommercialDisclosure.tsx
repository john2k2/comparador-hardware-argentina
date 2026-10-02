import { cn } from '@/lib/utils';
import { SITE_NAME } from '@/lib/site-config';

type CommercialDisclosureProps = {
  className?: string;
  compact?: boolean;
};

export function CommercialDisclosure({ className, compact = false }: CommercialDisclosureProps) {
  return (
    <div className={cn('border border-border/70 bg-muted/30 p-3 text-left', className)}>
      <p className="text-[8px] md:text-[9px] uppercase font-bold tracking-[0.18em] text-secondary">
        TRANSPARENCIA COMERCIAL
      </p>
      <p className="mt-2 text-[10px] md:text-[11px] leading-relaxed normal-case tracking-normal text-muted-foreground font-mono">
        {compact
          ? 'Los enlaces con comisión se identifican como ENLACE AFILIADO y los espacios pagos como PATROCINADO. La comparación orgánica muestra valores de locales comparables.'
          : `${SITE_NAME} no vende productos ni decide compras por vos. Los enlaces con comisión se identifican como ENLACE AFILIADO y los espacios pagos como PATROCINADO. La comparación orgánica prioriza costos comparables, disponibilidad y contexto antes del clic final.`}
      </p>
    </div>
  );
}

export default CommercialDisclosure;
