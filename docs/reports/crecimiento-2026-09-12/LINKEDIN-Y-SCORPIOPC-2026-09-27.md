# Publicación de LinkedIn y siguiente paso de ScorpioPC — 27/09/2026

## Publicación confirmada

- Autor verificado en la interfaz: perfil de Jonathan Ortiz (`jonathanortiz-dev`); no la página de John Labs.
- Audiencia: todo el mundo. Comentarios: cualquier persona.
- Enlace: https://www.linkedin.com/feed/update/urn:li:activity:7510072782949556224/
- Confirmación: LinkedIn mostró «Se ha publicado» y abrió el detalle con el texto propio.
- Enlace del texto acortado por LinkedIn: `https://lnkd.in/d6hxhCNt`. Su página de salida mostró el destino con `utm_source=linkedin`, `utm_medium=organic_social`, `utm_campaign=feedback_20260927`, `utm_content=perfil_jonathan`.
- La tarjeta de vista previa enlaza el dominio raíz sin estos parámetros: no atribuir todos sus clics al enlace etiquetado ni asumir que todo acceso tiene UTM. No se siguió el enlace para no generar una visita de prueba innecesaria.
- [Captura de publicación](cortes/2026-09-27/linkedin/publicacion-confirmada.png).
- No se promocionó ni se contrató una prueba de pago. No se publicaron afirmaciones de compatibilidad QVL, frescura garantizada, confianza de tiendas ni cantidades de usuarios.
- Métricas del post y visitas/leads de GA4: todavía no verificadas. Un contador lateral inicial de impresiones no se usó como cifra de rendimiento de esta publicación.

### Texto publicado

Estoy desarrollando Comparador Hardware Argentina y busco feedback de quienes compran componentes, arman PCs o trabajan con hardware.

La página reúne ofertas de tiendas argentinas para comparar opciones y permite preparar un presupuesto de PC eligiendo piezas y tiendas. También puede usarse para buscar componentes para una PC gamer o de trabajo.

Me ayudaría que la prueben con un modelo o un armado que tengan en mente y me cuenten:

• ¿Encontraron el componente que buscaban? ¿Qué filtro o tienda falta?
• ¿Se entiende el precio, la forma de pago y cuándo se actualizó la oferta?
• ¿Qué resultó confuso o difícil de usar, especialmente desde el celular?

Si encuentran un precio incorrecto o un enlace roto, dejen el producto y qué pasó para poder revisarlo.

https://www.comparador-hardware.com.ar/?utm_source=linkedin&utm_medium=organic_social&utm_campaign=feedback_20260927&utm_content=perfil_jonathan

Somos un comparador: no vendemos hardware ni procesamos las compras. Cada compra se realiza en la tienda elegida; los precios y el stock pueden cambiar, así que conviene revisar la fecha y confirmar las condiciones en el comercio.

Gracias por probarla. Las críticas y recomendaciones nos ayudan a decidir qué mejorar primero.

#Hardware #PC #Argentina

## ScorpioPC: propuesta concreta de inclusión

Es una tienda que pidió aparecer, no un sponsor confirmado. La investigación y sus límites están en [QVL, tienda y difusión](QVL-TIENDA-Y-DIFUSION-2026-09-27.md). Hoy se abrió nuevamente su página oficial de contacto, que publica ubicación, horarios y vías comerciales de atención; esto no verifica cumplimiento de ventas o garantías.

1. Preparar una respuesta sin prometer inclusión ni aval. Solicitar un enlace público de identidad fiscal/comercial verificable y la modalidad de acceso al catálogo (feed, exportación o interfaz permitida), frecuencia de actualización, stock y precios por medio de pago. No pedir contraseñas ni tokens.
2. Si existe autorización de contacto y recibimos información suficiente, verificar que el contacto representa a la tienda y probar una muestra fija de diez productos: modelo/MPN/condición, URL, precio y medio de pago, stock y fecha. Hacerlo con peticiones espaciadas; no activar scraping pesado ni un refresh desde la automatización.
3. Incorporarla al catálogo solo si hay identidad y datos utilizables, con los mismos criterios de ordenamiento y precios que las demás tiendas. Mantener visible la fecha observada y condiciones de pago. La aparición no implica aval de confianza.
4. Evaluar patrocinio por separado, con etiquetado explícito, cifras verificadas y propuesta revisada. No cobrar para alterar el ranking orgánico ni prometer clientes.

### Respuesta preparada, todavía no enviada

¡Gracias por acercarnos ScorpioPC! Nos interesa evaluar su incorporación al comparador. Para revisarla, ¿nos pueden compartir un enlace público con la identidad comercial/fiscal y decirnos si disponen de un feed, exportación o forma autorizada de consultar productos, precios y stock? También necesitamos distinguir los precios por medio de pago y saber con qué frecuencia se actualizan. Con esa información podemos probar una muestra y confirmar si la integración es viable. La inclusión en el catálogo y cualquier eventual patrocinio se evalúan por separado; todavía no podemos confirmar su incorporación.

No se envió esta respuesta: Jonathan preguntó qué hacer con la tienda, sin autorizar todavía un contacto específico en este turno. G13/G16 conservan sus criterios y estados globales.

## Renovación de la imagen social — 27/09/2026

Jonathan señaló que la tarjeta de LinkedIn se veía pequeña y genérica. La imagen anterior (`og-image.png`) es azul, usa un símbolo de computadora que renderizó como figura blanca y letras pequeñas. Se creó una imagen nueva coherente con el estilo retro, fondo oscuro, rosa y verde, título grande y copy sin precios ni garantías. Archivo: `public/og-image-2026-09-27.png`, 1200 × 630, 723924 bytes. La anterior se conserva para no romper enlaces históricos.

Se centralizó la URL social predeterminada en `src/lib/seo/metadata.ts` y se actualizó layout, búsqueda/categorías, artículos editoriales y fallback de producto. Guías/comparativas también explicitan Twitter. Las fotos reales de producto siguen teniendo prioridad; no se cambiaron canonical ni reglas de indexación. Los usos antiguos como Organization.logo no se cambiaron: no son la tarjeta social y merecen una revisión específica de identidad visual.

Validación: ESLint y TypeScript aprobados; 34 pruebas existentes de metadata aprobadas; compilación de producción aprobada. Se inspeccionó la imagen completa y [la miniatura de 128 px](cortes/2026-09-27/linkedin/og-miniatura.png). En el servidor local de producción, portada, categoría procesadores y armador respondieron 200 con OG/Twitter de la nueva versión; imagen servida como image/png. [Evidencia de HTML](cortes/2026-09-27/linkedin/og-html-local.json).

**Pendiente:** despliegue público y comprobación desde el crawler de LinkedIn. No se declara cambiada la tarjeta publicada. Según [ayuda oficial de LinkedIn](https://www.linkedin.com/help/recruiter/answer/a6233775), Post Inspector actualiza la vista previa para publicaciones nuevas; las existentes conservan su tarjeta. Si Jonathan decide reemplazar el post, conservar primero texto y enlace, verificar posibles comentarios/reacciones y documentar el nuevo enlace. No se borró ni duplicó la publicación actual.

## Despliegue y reemplazo confirmado — 2026-09-27T20:43:51.064624+00:00

Jonathan autorizó explícitamente publicar esta versión y reemplazar el post recién creado conservando el texto. Cambio publicado en main: `3bc2d78` (ocho archivos de imagen y metadata). Workers Builds terminó correctamente: [build 2d34432e-5a6c-467a-a07d-6ffd12cffeb7](https://dash.cloudflare.com/a80650839fdd1917a4585c51e5c0522b/workers/services/view/comparador-hardware-argentina/production/builds/2d34432e-5a6c-467a-a07d-6ffd12cffeb7). Los cambios QVL y demás cambios locales se preservaron fuera de este commit.

Comprobación pública posterior: portada, /comparar/procesadores y /guia/armar respondieron HTTP 200 con OG/Twitter de la imagen nueva; la imagen respondió 200, image/png y 1200 × 630. [Evidencia](cortes/2026-09-27/linkedin/og-html-produccion.json). Una petición inicial con urllib recibió 403; la comprobación con curl y la captura independiente de LinkedIn obtuvieron 200. No se cambió la protección del sitio. Post Inspector volvió a leer la portada y mostró la nueva tarjeta: [captura](cortes/2026-09-27/linkedin/inspector-nueva-imagen.png).

**Post activo para el seguimiento:** [https://www.linkedin.com/feed/update/urn:li:activity:7510076468136194048/](https://www.linkedin.com/feed/update/urn:li:activity:7510076468136194048/). Se verificaron autor Jonathan Ortiz, visibilidad global, texto conservado, enlace abreviado del cuerpo, tarjeta nueva y comentarios abiertos. [Captura de publicación](cortes/2026-09-27/linkedin/publicacion-nueva-confirmada.png). LinkedIn muestra una tarjeta horizontal pequeña en esta interfaz; la imagen es más legible, pero el tamaño de la tarjeta lo determina LinkedIn.

El [post anterior](https://www.linkedin.com/feed/update/urn:li:activity:7510072782949556224/) quedó reemplazado y LinkedIn confirmó «Publicación eliminada»: [evidencia](cortes/2026-09-27/linkedin/post-anterior-eliminado.png). Antes del retiro no aparecieron comentarios ni contadores de reacciones en su detalle; no se transfieren métricas. Los 7/8 de «Impresiones de la publicación» vistos en el lateral son un indicador del perfil, sin atribución comprobada a un post, por lo que no se registran como impresiones del post nuevo ni como cero. Las visitas y conversiones de la campaña siguen pendientes de medición.

El historial anterior se conserva como corte previo; su estado «pendiente de despliegue» queda superado por este corte. ScorpioPC permanece en evaluación y sin contacto nuevo. No se cierran G02, G10, G13 o G16 por este cambio.

Nota de publicación: las capturas y archivos de cortes se conservan localmente; no se incluyen en el repositorio público porque pueden contener datos de sesiones o conversaciones. Los enlaces a cortes son referencias de evidencia local.
