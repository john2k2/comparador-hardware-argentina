import type { Metadata } from 'next';
import { RetroPageShell } from '@/components/layout/RetroPageShell';
import { buildPublicPageMetadata } from '@/lib/seo/metadata';
import { SITE_NAME } from '@/lib/site-config';
import { TERMINOS_FAQ } from '@/lib/seo/faq-schema';

export const metadata: Metadata = buildPublicPageMetadata({
  path: '/terminos',
  title: 'Terminos de Uso',
  description: `Leé los términos de uso de ${SITE_NAME}: alcance del comparador, precios aproximados, tiendas externas, responsabilidades y uso razonable.`,
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
          <h2 className="text-secondary font-bold mb-2">[ ALCANCE ]</h2>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            {SITE_NAME} muestra comparacion de precios, informacion de stock y enlaces hacia tiendas externas. No actua como vendedor, distribuidor ni procesador de pagos.
          </p>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30">
          <h2 className="text-secondary font-bold mb-2">[ PRECIOS ]</h2>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            Los precios pueden cambiar sin aviso y pueden diferir respecto de la ultima actualizacion capturada. El importe final, stock, medios de pago y cuotas validos son los publicados por la tienda de destino.
          </p>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30">
          <h2 className="text-secondary font-bold mb-2">[ RESPONSABILIDAD ]</h2>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            Cada compra se realiza fuera del comparador. La relacion comercial, el despacho, la garantia, los tiempos de entrega y las devoluciones dependen exclusivamente del comercio elegido.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="border-2 border-border p-4 bg-muted/30">
            <h2 className="text-secondary font-bold mb-2">[ USO RAZONABLE ]</h2>
            <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
              No debes usar el sitio para interferir con su funcionamiento, automatizar abuso, intentar extraer datos de forma perjudicial o afectar la experiencia del resto de usuarios.
            </p>
          </div>

          <div className="border-2 border-border p-4 bg-muted/30">
            <h2 className="text-secondary font-bold mb-2">[ CAMBIOS ]</h2>
            <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
              Estos terminos pueden actualizarse cuando cambie el producto, la monetizacion o la infraestructura. La version publicada en el sitio es la vigente en cada momento.
            </p>
          </div>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30 space-y-3">
          <h2 className="text-secondary font-bold">[ NATURALEZA DEL SERVICIO ]</h2>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            El comparador funciona como una capa de descubrimiento y referencia. Su valor está en ordenar información pública o capturada desde tiendas para que el usuario tenga una base más clara antes de decidir. Eso no implica garantía absoluta de exactitud permanente, porque el ecosistema de precios, stock y URLs de producto cambia de manera continua.
          </p>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            Usar el sitio implica entender esa naturaleza dinámica. Hacemos esfuerzos razonables para limpiar errores y mejorar agrupaciones, pero siempre puede existir desfase entre la última actualización visible y el estado real del comercio enlazado.
          </p>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30 space-y-3">
          <h2 className="text-secondary font-bold">[ LIMITACION OPERATIVA ]</h2>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            No garantizamos disponibilidad ininterrumpida, cobertura total de todas las tiendas ni ausencia completa de errores en precios, especificaciones o stock. Parte del trabajo del proyecto consiste precisamente en detectar, auditar y reducir esos problemas con el tiempo.
          </p>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            Si utilizas la información del comparador para tomar una decisión de compra, la verificación final debe hacerse siempre en la página oficial del comercio. Los términos de esa tienda, y no los de este sitio, son los que regulan la operación económica final.
          </p>
        </div>
      </div>
    </RetroPageShell>
    </>
  );
}
