import type { Metadata } from 'next';
import { Mail, MessageSquare, Shield } from 'lucide-react';
import { RetroPageShell } from '@/components/layout/RetroPageShell';
import { buildPublicPageMetadata } from '@/lib/seo/metadata';
import { buildMailtoHref, SITE_NAME, SUPPORT_EMAIL } from '@/lib/site-config';

export const metadata: Metadata = buildPublicPageMetadata({
  path: '/contacto',
  title: 'Contacto',
  description: `Contactá a ${SITE_NAME} para reportar precios incorrectos, productos mal agrupados, enlaces rotos, tiendas nuevas o consultas del comparador.`,
});

export default function ContactoPage() {
  const supportMailto = buildMailtoHref(`${SITE_NAME} - Consulta`);

  return (
    <RetroPageShell
      title="CONTACTO"
      subtitle="Consultas generales, reportes de precios o errores de agrupacion. Esta pagina busca dejar claro que informacion sirve y que esperar."
    >
      <div className="space-y-4 text-[10px] uppercase text-foreground">
        <div className="border-2 border-border p-4 bg-muted/30">
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            Si detectas un precio roto, una URL incorrecta, un producto mal agrupado o quieres sumar una tienda, este es el punto de referencia para contacto operativo del proyecto.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
        <div className="border-2 border-border p-4 bg-muted/30">
          <Mail className="w-5 h-5 text-primary mb-3" />
          <h2 className="text-secondary font-bold mb-2">[ EMAIL ]</h2>
          {SUPPORT_EMAIL && supportMailto ? (
            <a href={supportMailto} className="leading-relaxed normal-case text-[11px] tracking-normal font-mono text-primary underline break-all">
              {SUPPORT_EMAIL}
            </a>
          ) : (
            <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
              Canal de correo pendiente de configuracion publica. Antes de monetizar conviene definir un email operativo real.
            </p>
          )}
        </div>

        <div className="border-2 border-border p-4 bg-muted/30">
          <MessageSquare className="w-5 h-5 text-primary mb-3" />
          <h2 className="text-secondary font-bold mb-2">[ QUE ENVIAR ]</h2>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            Incluye URL, nombre del producto, tienda involucrada y una descripcion breve del problema para acelerar la revision.
          </p>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30">
          <Shield className="w-5 h-5 text-primary mb-3" />
          <h2 className="text-secondary font-bold mb-2">[ REPORTES ]</h2>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            Si un precio parece absurdo o una ficha no corresponde al mismo producto, lo tratamos como prioridad porque afecta confianza y comparacion.
          </p>
        </div>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30">
          <h2 className="text-secondary font-bold mb-2">[ TIEMPOS ]</h2>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            No hay SLA formal todavia. Mientras el proyecto siga en etapa de mejora, las respuestas y correcciones dependen de disponibilidad operativa.
          </p>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30 space-y-3">
          <h2 className="text-secondary font-bold">[ REPORTES UTILES ]</h2>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            Los reportes más valiosos son los que ayudan a verificar problemas concretos: producto mal agrupado, enlace roto, precio imposible, stock inconsistente o una categoría que no refleja bien la intención de búsqueda. Si envías capturas o ejemplos específicos, el análisis suele ser mucho más rápido.
          </p>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            También es útil indicar si el error aparece en desktop o mobile, si se repite en varias páginas y si el problema impacta comparación, confianza o navegación. Eso permite priorizar mejor entre correcciones editoriales, técnicas o de scraping.
          </p>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30 space-y-3">
          <h2 className="text-secondary font-bold">[ ALCANCE DEL CONTACTO ]</h2>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            Este canal está pensado para consultas relacionadas con el comparador. No gestionamos ventas, cobros, garantías, devoluciones ni soporte post compra de las tiendas enlazadas. Para cualquier operación comercial concreta, la referencia válida siempre es el comercio de destino.
          </p>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            Si en el futuro el proyecto suma analytics, newsletters o integraciones comerciales más complejas, esta página se ampliará con canales y tiempos de respuesta más formales para mantener expectativas claras.
          </p>
        </div>
      </div>
    </RetroPageShell>
  );
}
