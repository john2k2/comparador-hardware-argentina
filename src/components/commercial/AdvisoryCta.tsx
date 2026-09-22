'use client';

import Link from 'next/link';
import { trackAdvisoryCta } from '@/lib/analytics';

type AdvisoryCtaProps = {
  surface: 'budget_builder' | 'budget_guide' | 'product_detail' | 'product_comparison';
  compact?: boolean;
};

export function AdvisoryCta({ surface, compact = false }: AdvisoryCtaProps) {
  return (
    <section className={`border-4 border-secondary bg-secondary/10 ${compact ? 'p-4' : 'p-5 md:p-6'} pixel-shadow`}>
      <p className="text-[9px] uppercase font-bold text-secondary mb-2">[ ASESORÍA DE COMPRA ]</p>
      <h2 className="text-[12px] md:text-[14px] font-bold text-foreground mb-2">
        ¿Necesitás ayuda para decidir?
      </h2>
      <p className="text-[11px] font-mono normal-case leading-relaxed text-foreground/85 mb-4">
        Mandanos un mensaje con tu presupuesto, el uso que le vas a dar y los componentes que estás mirando. Revisamos compatibilidad y prioridades antes de que compres.
      </p>
      <Link
        href="/contacto#asesoria-pc"
        onClick={() => trackAdvisoryCta({ surface, ctaId: 'request_pc_advisory' })}
        className="inline-flex min-h-11 items-center border-4 border-secondary bg-secondary px-4 text-[10px] uppercase font-bold text-secondary-foreground"
      >
        Enviarnos un mensaje
      </Link>
    </section>
  );
}
