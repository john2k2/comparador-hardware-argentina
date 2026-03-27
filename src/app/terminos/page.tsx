import type { Metadata } from 'next';
import { RetroPageShell } from '@/components/layout/RetroPageShell';
import { buildPublicPageMetadata } from '@/lib/seo/metadata';
import { SITE_NAME } from '@/lib/site-config';
import { TERMINOS_FAQ } from '@/lib/seo/faq-schema';

export const metadata: Metadata = buildPublicPageMetadata({
  path: '/terminos',
  title: 'Terminos de Uso',
  description: `Terminos de uso generales del comparador ${SITE_NAME}.`,
});

export default function TerminosPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(TERMINOS_FAQ) }}
      />
    <RetroPageShell
      title="TERMINOS DE USO"
      subtitle="Marco general de uso del comparador. Sirve como base operativa, pero no reemplaza revision legal profesional."
    >
      <div className="space-y-4 text-[10px] uppercase text-foreground">
        <div className="border-2 border-border p-4 bg-muted/30">
          <p className="text-secondary font-bold mb-2">[ ALCANCE ]</p>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            {SITE_NAME} muestra comparacion de precios, informacion de stock y enlaces hacia tiendas externas. No actua como vendedor, distribuidor ni procesador de pagos.
          </p>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30">
          <p className="text-secondary font-bold mb-2">[ PRECIOS ]</p>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            Los precios pueden cambiar sin aviso y pueden diferir respecto de la ultima actualizacion capturada. El importe final, stock, medios de pago y cuotas validos son los publicados por la tienda de destino.
          </p>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30">
          <p className="text-secondary font-bold mb-2">[ RESPONSABILIDAD ]</p>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            Cada compra se realiza fuera del comparador. La relacion comercial, el despacho, la garantia, los tiempos de entrega y las devoluciones dependen exclusivamente del comercio elegido.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="border-2 border-border p-4 bg-muted/30">
            <p className="text-secondary font-bold mb-2">[ USO RAZONABLE ]</p>
            <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
              No debes usar el sitio para interferir con su funcionamiento, automatizar abuso, intentar extraer datos de forma perjudicial o afectar la experiencia del resto de usuarios.
            </p>
          </div>

          <div className="border-2 border-border p-4 bg-muted/30">
            <p className="text-secondary font-bold mb-2">[ CAMBIOS ]</p>
            <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
              Estos terminos pueden actualizarse cuando cambie el producto, la monetizacion o la infraestructura. La version publicada en el sitio es la vigente en cada momento.
            </p>
          </div>
        </div>
      </div>
    </RetroPageShell>
    </>
  );
}
