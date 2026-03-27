import type { Metadata } from 'next';
import { Mail, MessageSquare, Shield } from 'lucide-react';
import { RetroPageShell } from '@/components/layout/RetroPageShell';
import { buildPublicPageMetadata } from '@/lib/seo/metadata';
import { buildMailtoHref, SITE_NAME, SUPPORT_EMAIL } from '@/lib/site-config';

export const metadata: Metadata = buildPublicPageMetadata({
  path: '/contacto',
  title: 'Contacto',
  description: `Canales de contacto, reportes y consultas sobre ${SITE_NAME}.`,
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
          <p className="text-secondary font-bold mb-2">[ EMAIL ]</p>
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
          <p className="text-secondary font-bold mb-2">[ QUE ENVIAR ]</p>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            Incluye URL, nombre del producto, tienda involucrada y una descripcion breve del problema para acelerar la revision.
          </p>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30">
          <Shield className="w-5 h-5 text-primary mb-3" />
          <p className="text-secondary font-bold mb-2">[ REPORTES ]</p>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            Si un precio parece absurdo o una ficha no corresponde al mismo producto, lo tratamos como prioridad porque afecta confianza y comparacion.
          </p>
        </div>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30">
          <p className="text-secondary font-bold mb-2">[ TIEMPOS ]</p>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            No hay SLA formal todavia. Mientras el proyecto siga en etapa de mejora, las respuestas y correcciones dependen de disponibilidad operativa.
          </p>
        </div>
      </div>
    </RetroPageShell>
  );
}
