# Piloto de afiliación de Eneba — integración y seguimiento

Estado del corte de integración: código anterior revisado y portado al checkout de implementación actualizado. Cuenta comprobada tras la activación realizada por Jonathan. Pruebas locales aprobadas; publicación en preparación. Los controles de cobro y los datos de facturación permanecen privados.

## Corte posterior de cuenta e integración

El panel mostró inicialmente «Your account is not active» y solicitó completar la información de afiliados. Jonathan informó que habilitó la cuenta durante esta revisión. Tras recargar `/affiliates/overview` desapareció ese aviso y se conservaron el identificador público y la comisión del 5%. Esto acredita la desaparición del bloqueo administrativo visible, no una venta atribuida ni un pago bancario verificado. No se leyeron ni copiaron datos de facturación.

Se confirmó nuevamente el feed real a las **19:03:28 UTC del 02/10/2026**: las dos fichas seleccionadas coincidieron en ID, SKU, título, región, moneda, disponibilidad y destino. Precios del corte: Chivalry II ARS 8.971,18 y Knights of Pen & Paper ARS 4.288,33. Son datos históricos del feed, con cargos finales y vendedor sujetos a comprobación en Eneba.

La especificación pública enlazada desde el panel confirma `country`, `currency`, `af_id`, `type`, `link_locale`, `size` y `from`. No documenta una selección por lista de IDs: el piloto conserva una sola página de seis filas. Que un producto deje de aparecer en ella no significa agotamiento. Esta muestra prueba la integración y los enlaces; no representa demanda de juegos ni todo el catálogo de Eneba.

La respuesta y la caché se validan también al leerlas: filas malformadas, SKU alterado, destino ajeno, moneda duplicada y revisión editorial cambiada no habilitan precios. El navegador recibe texto editorial conocido, no títulos arbitrarios del feed o de la caché.

Se conservan las pruebas de la implementación original como cortes históricos. La integración posterior aprobó **62 pruebas unitarias** de Eneba y analítica, lint, TypeScript, build y **19 pruebas de navegador** del piloto y consentimiento. La prueba de navegador bloquea proveedores externos y destinos reales: verifica emisión a `dataLayer`, no recepción por Google ni comisión en Eneba.

## Encaje y alcance

La sección `/juegos-digitales` contiene dos claves para PC, con acceso desde Información en el pie de página. Tiene modelo, parser y espacio de caché propios. No incorpora licencias a `Product`, categorías de hardware, búsqueda, ranking, comparativas ni guías de componentes. El piloto tiene `noindex, nofollow` y no se añadió al sitemap.

Antes de editar se revisaron los cambios locales, el catálogo, páginas editoriales, caché compartida, consentimiento, eventos GA4 y documentación de la versión instalada de Next.js. Los cambios previos en búsqueda, precios, scraping, home y pruebas móviles se conservaron. La verificación final compara los hashes de los 17 archivos que ya tenían cambios seguidos por Git.

La afiliación aprobada, comisión del 5% en compras elegibles y cookie de 30 días son datos confirmados por Jonathan para esta tarea. El identificador público es `Comparador_Hardware_Argentina`. El código del 5% de descuento sigue pendiente: no se anunció ni se creó uno.

## Feed y evidencia real

Se leyó la [documentación del panel de Eneba](https://my.eneba.com/affiliates/product-feed) y su [especificación enlazada](https://docs.google.com/document/d/1o6s06BNg1on1T2L_oaeW1aLJ-1-5SiETZGPriqfyp98). Se descargó una sola página XML v3 y una CSV v3 con estos parámetros:

```text
version=3
currency=ARS
country=ar
type=game
link_locale=latam
af_id=Comparador_Hardware_Argentina
size=6
from=0
```

`giftcard_country` no se utiliza. No se siguió la paginación `rel=next`. Ambos formatos devolvieron seis filas iguales en ID, título, precio, enlace, región y stock. XML: 11.757 bytes; CSV: 5.959 bytes. La muestra se obtuvo el 02/10/2026 a las 17:37:51 UTC. La implementación consume solamente XML porque la muestra CSV no incluye el SKU requerido por el control de identidad.

El feed no informa plataforma, edición, restricciones completas ni fecha individual de cada precio. Por eso se revisaron las seis fichas y sus listas de países permitidos. ARS nunca se toma como prueba de activación. GLOBAL y LATAM tampoco se consideran suficientes por sí solos. El navegador estaba ubicado en Chile: las claves argentinas advertían que allí no se podían activar, mientras la lista permitida incluía Argentina.

| Producto de la muestra | Plataforma y sistema anunciados | País y restricciones comprobados | Selección |
| --- | --- | --- | --- |
| Yakuza: Like a Dragon | Xbox Live; Windows y Xbox | Sólo Argentina; cuenta e IP en un país con servicio Xbox Live. Juego sin Deluxe anunciado. | Excluido: primera selección limitada a Steam y Epic. |
| Fishing Sim World: Pro Tour | Xbox Live; Xbox One / Series X | Sólo Argentina; restricción de cuenta e IP. Inglés. No se confirmaron extras de una Special Edition. | Excluido: consola y extras sin confirmar. |
| The Banner Saga 2 | Xbox Live; Xbox One / Series X | Sólo Argentina; restricción de cuenta e IP. Inglés; sin edición especial anunciada. | Excluido: consola. |
| Chivalry II | Epic Games; Windows | Argentina figura en LATAM; juego base, clave digital; ficha en inglés. | Incluido. |
| Afterlife Work | Steam; Windows | Argentina figura en GLOBAL; clave digital; sólo ruso anunciado. | Excluido por idioma. |
| Knights of Pen & Paper | Steam; Windows, Mac y Linux | Argentina figura en GLOBAL; juego base; español entre los idiomas. Sin extras Deluxe anunciados. Los sistemas listados no prueban compatibilidad con versiones modernas. | Incluido. |

Las dos fichas incluidas se revisaron a las 17:48:55 UTC. Los enlaces abiertos llegaron al producto correspondiente y conservaron `af_id`; Eneba añadió sus parámetros UTM. No se compró ni activó una clave.

La comprobación local del servidor volvió a leer el feed real a las 18:02:41 UTC y entregó:

| Juego | Precio observado en ARS |
| --- | ---: |
| Chivalry II | 8.970,45 |
| Knights of Pen & Paper | 4.287,98 |

Son observaciones fechadas, no cotizaciones actuales ni precios finales garantizados. En Eneba, el vendedor destacado podía tener un precio distinto del mínimo del feed. La UI dice «Desde, según el feed de Eneba», muestra moneda y fecha del feed, avisa de posibles cargos y pide confirmar vendedor e importe final.

El resumen verificable, parámetros, seis filas, decisiones y respuestas locales está en [EVIDENCIA.json](./EVIDENCIA.json). Las capturas de comportamiento automatizado usan precios sintéticos; la vista local y las capturas `desktop-live.jpg` y `mobile-live.jpg` usan el feed real. Los archivos brutos y capturas se guardaron en `tmp/eneba/`, excluido de Git.

## Controles y consumo

- Lista cerrada de dos productos. Se exige coincidencia de ID, SKU, título, región, tipo de producto, stock explícito, ARS y precio positivo.
- Enlace HTTPS directo al slug revisado, sin credenciales, puertos ni fragmentos; exactamente un `af_id` correcto. Usa `rel="sponsored nofollow noopener noreferrer"`.
- Se conserva `Last-Modified` del feed como fecha del origen. Leer la caché no renueva esa fecha. La UI la identifica como fecha del feed, porque no existe fecha individual de cada oferta.
- Precios elegibles por menos de seis horas; caché hasta esa misma fecha límite. La pestaña los oculta al vencer, revisando el reloj cada 30 segundos y al recuperar foco, sin nuevas consultas. También se comprueba el vencimiento al hacer clic.
- Revisión editorial de activación por menos de siete días. La revisión actual vence el **09/10/2026 a las 17:48:55 UTC**. Para renovarla hay que revisar las fichas, sus restricciones y actualizar la fecha y `ENEBA_REVIEW_VERSION`.
- Una petición al feed por fallo de caché, máximo seis filas y 256 KiB; timeout de ocho segundos; sin redirecciones, paginación ni reintentos automáticos. Errores: caché de una hora y estado «Precios sin verificar», sin deducir agotamiento.
- Reutiliza `shared-cache` con el scope `eneba-affiliate-pilot`; no requiere tablas ni migraciones. Reúne consultas simultáneas dentro del proceso. La caché compartida reduce consultas entre instancias, pero no es un bloqueo distribuido ni un límite global de peticiones.
- No hay cron nuevo ni refresh forzado desde el navegador. Cada visita consulta una vez la API y recibe el snapshot disponible. Si una fila sale de la primera página del feed, no se amplía la muestra para buscarla.

## Medición de clics y condiciones comerciales

Se consultó la configuración real de GA4 del Comparador: propiedad `553934279`, flujo `15766410122`, ID público `G-7BHXTCQFTP`. «Clics de salida» está habilitado; no hay condiciones multidominio que excluyan Eneba ni etiquetas de sitio conectadas adicionales. No se modificó la configuración.

La integración posterior registra `affiliate_pilot_view` una vez por navegación, después de resolver la muestra y únicamente con consentimiento. Si el visitante acepta más tarde, se conserva una sola vista. `affiliate_outbound_click` identifica juego, plataforma, posición, CTA y campaña `eneba_pc_ar_20261002`; conserva el precio observado como contexto, sin emitir `purchase`, leads ni clics de hardware. La campaña es un parámetro de nuestra analítica, no un filtro confirmado del panel de Eneba.

Para medir el piloto, usar los eventos `affiliate_pilot_view` y `affiliate_outbound_click` en `/juegos-digitales`. No sumarlos con el `click` automático de medición mejorada ni con `outbound_store_click`. Los parámetros propios requieren dimensiones personalizadas si se quiere desglosarlos en informes estándar: su registro en GA4 y la recepción real siguen pendientes. Antes de esa configuración puede comprobarse el evento y la ruta; no inventar el desglose por juego. Son clics, no compradores ni ventas. Las ventas elegibles y comisiones deben corroborarse en Eneba. La [documentación oficial de GA4](https://support.google.com/analytics/answer/9216061?hl=es) describe la medición mejorada genérica, que se conserva como señal auxiliar.

Se revisó la sección [Recursos de afiliados](https://my.eneba.com/affiliates/resources), que ofrece logos y banners propios. No se encontró autorización específica para crear piezas propias con sus marcas; el piloto sólo usa el nombre del comercio en texto y no incluye logos, portadas ni banners. Antes de crear esas piezas se debe confirmar el permiso correspondiente. No se crearon campañas de Google Ads ni Shopping; esta promoción queda excluida de ambas vías.

## Validación y publicación pendiente

| Comprobación | Resultado |
| --- | --- |
| Unitarias de feed, servidor, caché, GA4 y footer | 59 aprobadas en cinco archivos. |
| Tipos TypeScript y lint del proyecto | Aprobados. |
| Build de producción de Next.js | Aprobado con las rutas nuevas. |
| Playwright del piloto y consentimiento | 14 aprobadas; escritorio 1440 px, móviles 360 y 390 px. |
| País, moneda, identidad, edición, stock y enlaces | Filtros de inclusión/exclusión y destinos incorrectos probados. |
| Feed roto, HTML, error HTTP/red, fecha ausente/vieja/futura y exceso de tamaño | Precios ocultos y espera por caché de error. |
| Precio vencido con la pestaña abierta | Se oculta sin consultar de nuevo; no se declara agotado. |
| Clic saliente | Abre la ficha exacta; cero eventos manuales de analítica o ventas. |
| Feed real en servidor local | Dos ofertas; segunda lectura idéntica, sin renovar fechas. |
| Piloto desactivado | Página y API 404; enlace del footer ausente. |
| Inspección visual | Escritorio y móvil con datos reales; precio, plataforma, región y aviso visibles. |

Revisión posterior del hook de diseño: `side-tab` era un adorno prescindible del encabezado. Se retiró el borde lateral grueso y se alineó el contenido con las fichas; la aclaración «Juegos para PC · selección inicial» se conserva debajo del título. No se añadieron excepciones ni se dejó pendiente ningún hallazgo. El detector devolvió cero hallazgos, el lint del componente pasó y se repitieron las tres pruebas de visualización a 1440, 360 y 390 px con build actualizado. Las capturas y el diff aislado se renovaron después de la corrección.

La prueba local no demuestra la recepción de eventos nuevos en producción ni la ejecución en Cloudflare Workers. No se enviaron clics sintéticos a la propiedad. Jonathan pidió incorporar el piloto y confirmó la activación administrativa: la publicación usa `ENEBA_AFFILIATE_PILOT_ENABLED=1` en la configuración del Worker. El código conserva el cierre por defecto cuando esa variable está ausente o vale `0`. Tras publicar se debe verificar ruta, feed, footer, móvil, consentimiento y enlaces. La evidencia final se registra en `INTEGRACION.json`.

Para reproducir las pruebas: `npx playwright test --config=playwright.eneba.config.ts` ejecuta el build y el servidor de prueba con el piloto activo y credenciales de escritura vacías. Sin la variable de activación en el entorno, el piloto queda cerrado. No se modificaron archivos de entorno del proyecto.

## Plan acotado y criterio de decisión

- **02/10:** integrar y publicar dos juegos en una sección propia, aviso de afiliación, acceso desde el footer, sin anuncios ni cambios de ranking de hardware. Confirmar activación administrativa y estado técnico. Comprobar ventas y atribución con resultados reales posteriores.
- **05/10:** primer control semanal de integridad y precios del feed, restricciones de activación, recepción GA4 y estadísticas accesibles de Eneba. Renovar la revisión editorial sólo después de leer las fichas. La revisión actual vence el 09/10 a las 17:48:55 UTC. El monitor registra y avisa, no cambia código ni fechas de revisión.
- **Cada lunes hasta 30/10:** separar usuarios consentidos que vieron la selección, usuarios con clic y cantidad de clics. Calcular la proporción de usuarios con clic sobre usuarios de la sección sólo con períodos y cobertura comparables. Registrar solicitudes al feed y errores operativos, sin inferir que un API 200 acredita venta o entrega de una clave.
- **30/10:** revisar continuidad, manteniendo comisiones validadas por Eneba, ventas pendientes/revertidas y tiempo operativo separados. Con menos de 50 usuarios con clic, tratar la conversión como muestra escasa y evitar conclusiones firmes o expansión masiva. El umbral es una regla inicial propuesta, no una garantía estadística.
- Pausar enlaces ante un destino incorrecto, región/edición contradictoria o bloqueo de afiliación. Ocultar precios vencidos sin deducir agotamiento. Retirar el piloto con la variable en `0`, sin borrar histórico.

El código de descuento sigue sin confirmación específica y no se anuncia. Tampoco se considera Eneba un sponsor con pago fijo. G02 continúa P0: seis fechas útiles verificadas y muestra fija sin oferta aceptada de menos de tres horas en el corte de 18:27 UTC. El último catálogo adaptativo nativo se midió por separado; no suma una séptima fecha de G02. El alta del piloto no cierra confiabilidad, métricas comerciales, AdSense ni contacto local de servicios de PC.
