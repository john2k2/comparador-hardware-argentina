import type { Metadata } from 'next';
import { RetroPageShell } from '@/components/layout/RetroPageShell';
import { buildPublicPageMetadata } from '@/lib/seo/metadata';
import { SITE_NAME, SUPPORT_EMAIL } from '@/lib/site-config';
import { PRIVACIDAD_FAQ } from '@/lib/seo/faq-schema';

export const metadata: Metadata = buildPublicPageMetadata({
  path: '/privacidad',
  title: 'Politica de Privacidad',
  description: `Politica de privacidad y tratamiento general de datos de ${SITE_NAME}.`,
});

export default function PrivacidadPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(PRIVACIDAD_FAQ) }}
      />
    <RetroPageShell
      title="POLITICA DE PRIVACIDAD"
      subtitle="Documento operativo y honesto sobre el tratamiento basico de datos. Debe revisarse otra vez cuando se active analitica, ads o formularios."
    >
      <div className="space-y-4 text-[10px] uppercase text-foreground">
        <div className="border-2 border-border p-4 bg-muted/30">
          <p className="text-secondary font-bold mb-2">[ DATOS ]</p>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            {SITE_NAME} puede procesar datos tecnicos basicos de navegacion, consultas de busqueda, URLs visitadas y registros operativos para mantener el servicio, detectar errores y mejorar resultados.
          </p>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30">
          <p className="text-secondary font-bold mb-2">[ FINALIDAD ]</p>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            La finalidad principal es operar el comparador, monitorear estabilidad, mejorar agrupacion de productos y analizar problemas de scraping o integridad de precios.
          </p>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30">
          <p className="text-secondary font-bold mb-2">[ TERCEROS ]</p>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            Cuando haces clic en una oferta, sales del comparador y pasas a una tienda externa. Cada comercio tiene sus propias politicas, condiciones y practicas de datos.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="border-2 border-border p-4 bg-muted/30">
            <p className="text-secondary font-bold mb-2">[ CONSERVACION ]</p>
            <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
              Los registros operativos se conservan solo el tiempo necesario para diagnostico, seguridad, rendimiento o mejora del catalogo, salvo obligaciones tecnicas adicionales.
            </p>
          </div>

          <div className="border-2 border-border p-4 bg-muted/30">
            <p className="text-secondary font-bold mb-2">[ CONSULTAS ]</p>
            <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
              {SUPPORT_EMAIL
                ? `Para privacidad o datos, puedes escribir a ${SUPPORT_EMAIL}.`
                : 'Para consultas de privacidad, antes del lanzamiento conviene definir un canal de contacto publico y verificable.'}
            </p>
          </div>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30 space-y-3">
          <p className="text-secondary font-bold">[ BASE OPERATIVA ]</p>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            La información tratada hoy responde sobre todo a necesidades técnicas: funcionamiento del sitio, consultas de búsqueda, estabilidad del catálogo, prevención de abuso y diagnóstico de errores. No vendemos una base de datos de usuarios ni construimos perfiles comerciales personalizados a partir de la navegación dentro del comparador.
          </p>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            Si en etapas futuras incorporamos analítica avanzada, publicidad, cuentas con más funciones o automatizaciones de marketing, esta política deberá actualizarse para reflejar con mayor detalle qué datos se recopilan, bajo qué fundamento y con qué opciones de control para el usuario.
          </p>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30 space-y-3">
          <p className="text-secondary font-bold">[ DERECHOS Y CONTACTO ]</p>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            Si necesitas hacer una consulta vinculada a privacidad, rectificación o eliminación de información asociada a una interacción concreta con el sitio, conviene incluir el máximo contexto posible: fecha aproximada, URL, acción realizada y un canal válido para responder. Eso facilita identificar registros técnicos sin sobredimensionar la retención de datos.
          </p>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            Nuestro enfoque es minimizar datos, conservar solo lo útil para operar y revisar periódicamente qué registros siguen siendo necesarios. La política real debe acompañar la evolución técnica del producto, no prometer más de lo que hoy existe ni ocultar limitaciones operativas actuales.
          </p>
        </div>
      </div>
    </RetroPageShell>
    </>
  );
}
