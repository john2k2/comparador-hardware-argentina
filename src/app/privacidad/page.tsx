import type { Metadata } from 'next';
import { AnalyticsPreferencesButton } from '@/components/functional/AnalyticsPreferences';
import { headers } from 'next/headers';
import { RetroPageShell } from '@/components/layout/RetroPageShell';
import { buildPublicPageMetadata } from '@/lib/seo/metadata';
import { SITE_NAME } from '@/lib/site-config';
import { serializeJsonLd } from '@/lib/seo/serialize-jsonld';
import { PRIVACIDAD_FAQ } from '@/lib/seo/faq-schema';

export const metadata: Metadata = buildPublicPageMetadata({
  path: '/privacidad',
  title: 'Politica de Privacidad',
  description: `Conocé cómo ${SITE_NAME} trata datos técnicos, búsquedas, registros operativos y enlaces externos para operar el comparador de hardware.`,
});

export default async function PrivacidadPage() {
  const nonce = (await headers()).get('x-content-security-policy-nonce') ?? undefined;
  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(PRIVACIDAD_FAQ) }}
      />
    <RetroPageShell
      title="POLITICA DE PRIVACIDAD"
      subtitle="Actualizada el 9 de octubre de 2026. Cuentas, analítica opcional y controles para tu navegador."
    >
      <div className="space-y-4 text-[12px] uppercase text-foreground">
        <div className="border-2 border-border p-4 bg-muted/30">
          <h2 className="text-secondary font-bold mb-2">[ DATOS ]</h2>
          <p className="leading-relaxed normal-case text-[12px] tracking-normal font-mono">
            {SITE_NAME} puede procesar datos tecnicos basicos de navegacion, consultas de busqueda, URLs visitadas y registros operativos para mantener el servicio, detectar errores y mejorar resultados.
          </p>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30">
          <h2 className="text-secondary font-bold mb-2">[ FINALIDAD ]</h2>
          <p className="leading-relaxed normal-case text-[12px] tracking-normal font-mono">
            La finalidad principal es operar el comparador, monitorear estabilidad, mejorar agrupacion de productos y analizar problemas de scraping o integridad de precios.
          </p>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30">
          <h2 className="text-secondary font-bold mb-2">[ TERCEROS ]</h2>
          <p className="leading-relaxed normal-case text-[12px] tracking-normal font-mono">
            Cuando haces clic en una oferta, sales del comparador y pasas a una tienda externa. Cada comercio tiene sus propias politicas, condiciones y practicas de datos.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="border-2 border-border p-4 bg-muted/30">
            <h2 className="text-secondary font-bold mb-2">[ CONSERVACION ]</h2>
            <p className="leading-relaxed normal-case text-[12px] tracking-normal font-mono">
              Los registros operativos se conservan solo el tiempo necesario para diagnostico, seguridad, rendimiento o mejora del catalogo, salvo obligaciones tecnicas adicionales.
            </p>
          </div>

          <div className="border-2 border-border p-4 bg-muted/30">
            <h2 className="text-secondary font-bold mb-2">[ CONSULTAS ]</h2>
            <p className="leading-relaxed normal-case text-[12px] tracking-normal font-mono">
              Para consultar, rectificar o solicitar la eliminación de tus datos, usá el{' '}
              <a href="/contacto" className="underline underline-offset-4">canal de contacto del sitio</a>.
              {' '}Incluí solo la información necesaria para identificar tu consulta; no envíes contraseñas ni códigos de acceso.
            </p>
          </div>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30 space-y-3">
          <h2 className="text-secondary font-bold">[ BASE OPERATIVA ]</h2>
          <p className="leading-relaxed normal-case text-[12px] tracking-normal font-mono">
            El sitio es un proyecto independiente de Jonathan Ortiz. Cloudflare sirve la web y procesa dirección IP y datos técnicos para seguridad y diagnóstico; Supabase almacena el catálogo y los datos de autenticación, favoritos y alertas si usás una cuenta. Estos proveedores pueden procesar datos fuera de tu país. No vendemos una base de datos de usuarios.
          </p>
          <p className="leading-relaxed normal-case text-[12px] tracking-normal font-mono">
            Hoy no cargamos anuncios de AdSense. Antes de activarlos actualizaremos la política y los controles aplicables. La elección de analítica no autoriza publicidad personalizada ni sustituye una plataforma de consentimiento certificada para los territorios donde Google la exige.
          </p>
        </div>

        <section className="border-2 border-border p-4 bg-muted/30 space-y-3 font-mono text-[12px] leading-relaxed normal-case tracking-normal" aria-labelledby="privacy-google-login">
          <h2 id="privacy-google-login" className="text-secondary font-bold uppercase">Ingresar con Google</h2>
          <p>Si elegís «Continuar con Google», Google comparte con el comparador tu correo electrónico y datos básicos de perfil, como nombre y foto. Supabase gestiona la identificación de tu cuenta y la sesión. Usamos estos datos para permitirte ingresar y asociar tus favoritos y alertas a tu cuenta.</p>
          <p>Ingresar y aceptar analítica son elecciones separadas. El permiso de Google para identificar tu cuenta no autoriza el seguimiento de Analytics. Cada cuenta tiene sus propios permisos dentro del sitio; el ingreso con Google no concede acceso al panel de administración.</p>
          <p>Podés cerrar sesión desde el sitio y retirar el permiso desde tu cuenta de Google. Estas acciones no eliminan por sí solas los datos de cuenta, favoritos o alertas guardados en Supabase. Para consultar, rectificar o solicitar su eliminación, usá el <a href="/contacto" className="underline underline-offset-4">canal de contacto del sitio</a>.</p>
        </section>

        <section className="border-2 border-border p-4 bg-muted/30 space-y-3 font-mono text-[12px] leading-relaxed normal-case tracking-normal" aria-labelledby="privacy-analytics">
          <h2 id="privacy-analytics" className="text-secondary font-bold uppercase">Google Analytics, solo si aceptás</h2>
          <p>Si elegís «Aceptar analítica», cargamos Google Analytics 4 para medir visitas, búsquedas, vistas de productos, clics hacia tiendas e intenciones de contacto. Google puede recibir datos técnicos, páginas visitadas y datos de esos eventos, y usar cookies como <code>_ga</code> para distinguir navegadores. No enviamos el contenido de tus correos, contraseñas ni datos bancarios como eventos comerciales.</p>
          <p>Sin una elección afirmativa vigente no cargamos la etiqueta de Analytics. Google Signals y la publicidad personalizada permanecen desactivados en nuestra configuración. La elección se guarda en este navegador hasta 180 días; si el almacenamiento está bloqueado, aplica solo a la visita actual. Podés rechazar analítica sin perder las funciones del comparador.</p>
          <p>Podés retirar tu elección desde «Preferencias de privacidad». Detenemos los nuevos eventos, eliminamos las cookies de Analytics accesibles para este sitio y recargamos la página si la etiqueta ya estaba cargada. Esto no borra automáticamente datos que Google ya recibió.</p>
          <AnalyticsPreferencesButton enabled={Boolean(process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID)} />
          <p>Más información en <a href="https://policies.google.com/privacy?hl=es" className="underline underline-offset-4" target="_blank" rel="noopener noreferrer">Privacidad de Google</a> y <a href="https://policies.google.com/technologies/partner-sites?hl=es" className="underline underline-offset-4" target="_blank" rel="noopener noreferrer">uso de datos en sitios asociados</a>.</p>
        </section>
        <section className="border-2 border-border p-4 bg-muted/30 space-y-3 font-mono text-[12px] leading-relaxed normal-case tracking-normal" aria-labelledby="privacy-storage">
          <h2 id="privacy-storage" className="text-secondary font-bold uppercase">Almacenamiento funcional y terceros</h2>
          <p>El navegador guarda preferencias visuales, armados, productos vistos y caché de fichas mediante almacenamiento local o de sesión. Podés borrarlos desde el navegador; perderás los datos guardados en ese dispositivo. Las cuentas, favoritos y alertas asociados requieren gestionar los datos de la cuenta.</p>
          <p>Algunas imágenes provienen de fabricantes o comercios y pueden solicitarse a sus servidores. Al abrir una oferta salís hacia una tienda con políticas propias. Si escribís por correo, el proveedor procesa tu dirección y mensaje para permitirnos responder; no publicamos esas consultas como métricas personales.</p>
          <p>La selección de juegos digitales utiliza enlaces afiliados de Eneba. No cargamos sus etiquetas ni cookies dentro del comparador: el enlace transmite nuestro identificador público al abrir la tienda, que gestiona su propia privacidad y atribución. Con tu consentimiento de analítica medimos la vista de esta selección y el juego cuyo enlace abrís; esos clics no se registran como ventas.</p>
          <p>La preferencia de analítica caduca a los 180 días. Los registros operativos, datos de cuenta, correos y eventos ya enviados tienen finalidades y configuraciones propias de cada proveedor. No afirmamos un plazo único que no hayamos verificado ni un borrado instantáneo en servicios externos.</p>
        </section>

        <div className="border-2 border-border p-4 bg-muted/30 space-y-3">
          <h2 className="text-secondary font-bold">[ DERECHOS Y CONTACTO ]</h2>
          <p className="leading-relaxed normal-case text-[12px] tracking-normal font-mono">
            Si necesitas hacer una consulta vinculada a privacidad, rectificación o eliminación de información asociada a una interacción concreta con el sitio, conviene incluir el máximo contexto posible: fecha aproximada, URL, acción realizada y un canal válido para responder. Eso facilita identificar registros técnicos sin sobredimensionar la retención de datos.
          </p>
          <p className="leading-relaxed normal-case text-[12px] tracking-normal font-mono">
            Nuestro enfoque es minimizar datos, conservar solo lo útil para operar y revisar periódicamente qué registros siguen siendo necesarios. La política real debe acompañar la evolución técnica del producto, no prometer más de lo que hoy existe ni ocultar limitaciones operativas actuales.
          </p>
        </div>
      </div>
    </RetroPageShell>
    </>
  );
}
