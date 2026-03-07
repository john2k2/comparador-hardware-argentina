import type { Metadata } from 'next';
import { RetroPageShell } from '@/components/layout/RetroPageShell';

export const metadata: Metadata = {
  title: 'Politica de Privacidad',
  description: 'Politica de privacidad de Comparador Hardware Argentina.',
};

export default function PrivacidadPage() {
  return (
    <RetroPageShell
      title="POLITICA DE PRIVACIDAD"
      subtitle="Version inicial. Este contenido puede actualizarse cuando se incorpore analitica y panel administrativo completo."
    >
      <div className="space-y-4 text-[10px] uppercase text-foreground">
        <div className="border-2 border-border p-4 bg-muted/30">
          <p className="text-secondary font-bold mb-2">[ DATOS ]</p>
          <p className="leading-relaxed">Se utilizan datos de busqueda y navegacion para operar el servicio y mejorar resultados.</p>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30">
          <p className="text-secondary font-bold mb-2">[ FINALIDAD ]</p>
          <p className="leading-relaxed">Optimizar rendimiento, estabilidad de scrapers y experiencia de usuario.</p>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30">
          <p className="text-secondary font-bold mb-2">[ CONTACTO ]</p>
          <p className="leading-relaxed">Para consultas de privacidad, usa la pagina de contacto del sitio.</p>
        </div>
      </div>
    </RetroPageShell>
  );
}
