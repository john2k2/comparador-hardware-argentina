import type { Metadata } from 'next';
import { RetroPageShell } from '@/components/layout/RetroPageShell';

export const metadata: Metadata = {
  title: 'Terminos de Uso',
  description: 'Terminos de uso de Comparador Hardware Argentina.',
};

export default function TerminosPage() {
  return (
    <RetroPageShell
      title="TERMINOS DE USO"
      subtitle="Version base para continuar iterando. No reemplaza asesoramiento legal profesional."
    >
      <div className="space-y-4 text-[10px] uppercase text-foreground">
        <div className="border-2 border-border p-4 bg-muted/30">
          <p className="text-secondary font-bold mb-2">[ ALCANCE ]</p>
          <p className="leading-relaxed">El sitio ofrece comparacion de precios y enlaces a tiendas externas.</p>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30">
          <p className="text-secondary font-bold mb-2">[ PRECIOS ]</p>
          <p className="leading-relaxed">Los precios pueden cambiar sin aviso. El valor final siempre lo define la tienda de destino.</p>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30">
          <p className="text-secondary font-bold mb-2">[ RESPONSABILIDAD ]</p>
          <p className="leading-relaxed">Cada compra se realiza en el sitio de la tienda correspondiente.</p>
        </div>
      </div>
    </RetroPageShell>
  );
}
