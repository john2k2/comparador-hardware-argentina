import { cn } from '@/lib/utils';

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
          ? 'Si activamos acuerdos comerciales o enlaces patrocinados, se van a etiquetar como PATROCINADO. La comparacion organica sigue mostrando valores de locales comparables.'
          : 'HardwareAR no vende productos ni decide compras por vos. Si activamos acuerdos comerciales o enlaces patrocinados, se van a etiquetar como PATROCINADO. La comparacion organica sigue priorizando costos comparables, disponibilidad y contexto antes del clic final.'}
      </p>
    </div>
  );
}

export default CommercialDisclosure;
