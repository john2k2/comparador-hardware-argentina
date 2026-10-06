# Orden de portada: revisión local del 02/10/2026

Corte: 23:17 UTC. Estado: implementado en local, pendiente de revisión visual del último ajuste. No publicado.

## Criterio de Jonathan

Trabajar primero en local y revisar la composición antes de publicar. Retirar el recuadro grande de presentación, llevar el buscador arriba y evitar que las promociones compitan con la búsqueda. Preparar un lugar coherente para tiendas y publicidad futura. Mejorar la legibilidad del acceso a Eneba.

## Implementación local

- Buscador a todo el ancho al comienzo del contenido, con un título breve; desaparece el panel de presentación y su párrafo.
- Menú principal: comparar precios, armar PC y guías. Comparación entre productos, comparativas e índice siguen accesibles desde Más y desde el menú móvil.
- Un solo navegador de categorías: cuatro visibles y seis desplegables. Se retiran el ticker de tiendas y los accesos repetidos. Los productos vistos sólo aparecen si hay historial.
- Cuatro destacados en tarjetas compactas. Se retira la grilla de populares del inicio y su consulta. El bloque de bajas aparece únicamente si hay bajas detectadas por el historial; no se rellena con otro listado general.
- Columna comercial secundaria desde 1280 px; en pantallas menores pasa debajo del contenido principal. Eneba ocupa esa columna y las tiendas patrocinadas sólo aparecen si están configuradas. No hay anunciantes ficticios ni integración publicitaria nueva.
- CTA de Eneba con tipografía monoespaciada de 16 px y altura mínima de 48 px. Conserva el destino interno, la identificación de afiliación y los controles de consentimiento.
- La promoción no consulta el feed ni descarga precios. La vista del bloque y su clic interno quedan separados de un clic saliente o una venta. La selección de juegos conserva los dos productos revisados; ampliar la selección comercial es una tarea diferente y sigue pendiente.

## Validación y límites

Lint, TypeScript y 13 pruebas unitarias focalizadas aprobados en el corte. La inspección mecánica de Impeccable no reporta hallazgos. Se corrigió también la degradación del componente opcional de populares ante una lectura fallida.

La compilación de producción del ajuste final también terminó correctamente. El proceso de desarrollo permanece escuchando sólo en 127.0.0.1:3112. Compilar no sustituye la inspección visual pendiente ni publica los cambios.

Antes del último ajuste se aprobaron 11 pruebas de portada, cuatro pruebas del acceso/consentimiento de la promoción y ocho de adaptación móvil/tablet. Otras cuatro pruebas del piloto encontraron dos lecturas al correr con Strict Mode de desarrollo, frente a una esperada por el contrato de producción: no se debilitó esa expectativa ni se declaró resuelto. Esa ejecución no acredita el último ajuste de columna y buscador.

La herramienta rechazó el acceso a la pestaña del navegador de Codex con un bloqueo de protocolo. No se intentó eludirlo. La revisión visual final y la ejecución completa del piloto contra una compilación de producción siguen pendientes. No usar las capturas anteriores del recuadro grande como evidencia del diseño actual.

El servidor de desarrollo queda disponible en http://127.0.0.1:3112/. Esta URL es local; no es un despliegue. G02, aprobación AdSense, consentimiento publicitario, ingresos y estado de patrocinadores conservan sus controles independientes. No se modifican credenciales, precios, stock, revisiones de identidad ni tareas de actualización.

## Comprobación de carga solicitada por Jonathan: 23:54–23:58 UTC

El proceso de desarrollo continúa escuchando en 127.0.0.1:3112. HEAD y GET de portada responden 200. El GET completo contiene el título actual «Compará precios de hardware», sin página de error de Next ni digests de error en el HTML recibido. Los 19 recursos locales distintos de JavaScript y CSS referenciados responden 200 con el tipo correspondiente; los 52 elementos script llevan el nonce de su respuesta. El registro del servidor no muestra un error nuevo en estas lecturas.

Esta comprobación acredita transporte, HTML y entrega de recursos; no acredita ejecución de JavaScript, hidratación ni render dentro del navegador de Codex. La causa de la falla descrita por Jonathan sigue sin determinar hasta conocer el síntoma o mensaje de esa pestaña. Se solicitó ese dato. El rechazo anterior de la herramienta de control del navegador se mantiene como limitación separada: no demuestra que sea la causa del fallo visible para el usuario. No se quitaron protecciones CSP/X-Frame-Options ni se utilizaron otros navegadores para eludir ese rechazo.

Jonathan confirmó que el síntoma es una pantalla en blanco. La lectura acotada de registros locales de la aplicación encontró eventos dom-ready de la pestaña en 127.0.0.1:3112, sin un fallo de navegación registrado para esa ruta en el tramo revisado; estos eventos no prueban que la página se haya dibujado correctamente. No se copiaron identificadores de sesión ni otros destinos del navegador al informe.

Se reinició exclusivamente el proceso de desarrollo iniciado para esta revisión, conservando el puerto, los cambios locales y los bloqueos de escritura/scraping. El nuevo GET de portada respondió 200 en 65 ms, con el título actual y sin digests de error. Se pidió al usuario recargar su pestaña para contrastar el síntoma: el reinicio es una comprobación de diagnóstico y no se declara reparación visual confirmada. La documentación oficial admite [vistas previas de aplicaciones locales](https://learn.chatgpt.com/docs/browser?surface=app); no establece la causa de esta pantalla en blanco. No se alteraron permisos del navegador ni se reinició la aplicación completa.

## Diagnóstico posterior: 03/10/2026 UTC, noche del 02/10 en Santiago

La captura enviada por Jonathan conserva título y favicon, pero el área de página está uniformemente oscura después del reinicio. Los registros de la aplicación muestran desmontaje/montaje de la vista y varias secuencias dom-ready de la misma ruta a intervalos cercanos a medio segundo. Ese patrón no determina por sí solo si hubo recargas manuales, recargas del cliente o un fallo de presentación. La conexión HTTP/WebSocket del canal HMR respondió correctamente en una comprobación directa del servidor; no prueba la conexión HMR desde el navegador. La hipótesis de vista enviada a segundo plano se mantiene sin confirmar.

Para aislar el modo de desarrollo, se detuvo nuestro proceso Next dev y se inició Next start en el mismo 127.0.0.1:3112, usando la compilación existente posterior a los cambios de portada. Es una vista previa local de producción, sin HMR ni herramientas de desarrollo; la implementación visual no se volvió a modificar para este diagnóstico. El GET completo respondió 200 en 1197 ms, con el título actual, sin digests de error y con nonces coincidentes. Sus 13 recursos JavaScript/CSS respondieron 200. Se solicitó una recarga al usuario y el resultado visual sigue pendiente; no declarar resuelto el panel oscuro a partir de estos checks de servidor.

La URL de revisión se conserva. Durante este diagnóstico, los próximos cambios de código requieren recompilar y reiniciar esta vista previa para hacerse visibles. La ejecución completa de pruebas de navegador continúa pendiente por la limitación de control documentada.

## Tarjetas y explicación final: 03/10/2026, 00:26 UTC

Jonathan decidió continuar la revisión de diseño sin seguir investigando el panel oscuro. Se unificaron los accesos a guías y comparativas mediante `EditorialLinkCard`, tanto en portada como en `/guia` y `/comparativa`. Comparten borde, espaciado, tipografía y posición de la llamada a la acción. Título y descripción reservan dos líneas y recortan el exceso con puntos suspensivos mediante CSS; el título completo permanece en el enlace y en su atributo `title`. La tarjeta completa conserva navegación con teclado y foco visible. Este cambio no afecta las tarjetas de productos ni los espacios comerciales.

Los títulos de las tres guías en portada muestran el presupuesto de referencia de forma uniforme, sin «Hasta». No se modificaron modelos, precios ni la tolerancia editorial vigente. Se retiró de portada el bloque extenso «Cómo funciona el comparador», cuyo contenido ya está disponible en Acerca/Cómo funciona. El pie conserva los enlaces y explicita en una frase que no vendemos hardware y que la compra se realiza en la tienda. La explicación reutilizada por `llms.txt` se mantiene, con redacción sobre ofertas registradas y fecha de observación en lugar de asegurar que todo el catálogo o stock es del día.

Validación de este ajuste: lint focalizado, TypeScript, ocho pruebas existentes de contenido/enlaces en cuatro archivos, inspección mecánica de diseño sin hallazgos, `git diff --check` y una nueva compilación de producción aprobados. Se reinició exclusivamente nuestra vista previa local con esa compilación, conservando los bloqueos de scraping y escritura. GET de `/`, `/guia` y `/comparativa`: 200, estructura de tarjeta compartida y aclaración del pie presentes, sin digests de error detectados en el HTML recibido; el bloque largo ya no está en portada y los enlaces de las guías se conservan.

El control de servidor no sustituye la revisión visual en el navegador. No se volvió a intentar acceder mediante otro mecanismo tras el rechazo documentado. La vista previa sigue en http://127.0.0.1:3112/; no hubo commit, subida ni despliegue público. Los cortes anteriores permanecen como histórico.

## Navegación y últimas ofertas: 03/10/2026, 01:12 UTC

Jonathan pidió añadir Últimas ofertas, distribuir el menú por todo el ancho disponible y contrastar el cambio con Impeccable. El ajuste continúa únicamente en local y reemplaza la distribución comercial del primer corte; los registros anteriores se conservan como histórico.

La cabecera separa marca/controles de la fila de navegación. Desde 768 px, los accesos se distribuyen a partes iguales por todo el ancho, sin el límite anterior de 1800 px: Comparar precios, Armá tu PC, Últimas ofertas, Juegos cuando el piloto está habilitado y Más. La navegación usa texto monoespaciado de 16 px y altura mínima de 56 px; el menú móvil conserva todos los destinos y objetivos de al menos 44 px. Guías, comparación entre productos, comparativas e índice permanecen en Más. El enlace Últimas ofertas lleva a la sección de portada también desde otras páginas.

Últimas ofertas reemplaza Productos destacados y muestra hasta cuatro tarjetas compactas. Selecciona publicaciones con precio positivo, stock disponible o limitado, URL válida, identidad aceptada según los controles existentes y observación real de hasta tres horas. El nombre debe respaldar la categoría del producto. Ordena por la última observación aceptada, no por una edición de la ficha; los mínimos y estadísticas usan las mismas reglas por tienda que las tarjetas. Una lectura de caché reevalúa la ventana y no renueva fechas. El bloque conserva su acceso al catálogo y distingue falta de ofertas elegibles de un error de lectura.

La selección reutiliza la lectura acotada de portada de hasta 200 registros recientes; no añade scraping ni consultas a tiendas y no acredita un orden exhaustivo sobre todo el catálogo. Oferta significa una publicación comercial disponible según la observación registrada; no implica descuento. Bajaron de precio mantiene su evidencia de historial y excluye las tarjetas ya mostradas arriba para evitar duplicación.

En la primera comprobación apareció una cerradura entre las ofertas: el nuevo filtro de categoría la excluye de portada. Esta guarda de presentación no repara ni elimina su registro del catálogo y no renueva precio, stock o identidad. Los productos cuyo título no permite respaldar la categoría quedan fuera de este bloque hasta reunir evidencia; no se declaran agotados.

El acceso de Eneba queda en la columna principal, después de las guías y antes de las comparativas, además de su enlace en navegación. La columna lateral se reserva a tiendas patrocinadas que estén realmente configuradas. Se conservan los dos juegos revisados, la divulgación de afiliación, el destino interno y las métricas consentidas; no se amplía el feed ni se atribuyen ventas. La superficie de tarjetas home_latest_offers utiliza la instrumentación existente sin cambiar la cuenta de GA4.

El contraste con Impeccable usa sus referencias layout, distill y craft-floor: jerarquía de navegación legible, menos grillas repetidas y una promoción integrada en el recorrido. Se mantiene la identidad pixel art existente. Las inspecciones mecánicas de los componentes cambiados no reportaron hallazgos y no se añadieron supresiones; esto no equivale a aprobación visual.

Validación final: 31 pruebas unitarias focalizadas en cinco archivos, lint de los archivos modificados, TypeScript, git diff --check y compilación de producción aprobados. Se reinició exclusivamente nuestra vista previa de producción en 127.0.0.1:3112, con scraping, refresh y escrituras deshabilitados. Portada, /api/home/sections y /juegos-digitales respondieron 200; el HTML recibido contiene el menú nuevo, una sección Últimas ofertas y una promoción Eneba, sin digests de error ni scripts de anuncios detectados.

En el corte de lectura de 01:12 UTC había cuatro productos elegibles: dos notebooks MSI Cyborg, un cable IDE ASUS y un monitor Philips Evnia. Las cuatro publicaciones de Katech tenían observaciones de 00:14 UTC, precio positivo y stock disponible; estos datos son un corte fechado, no una garantía futura ni una verificación independiente nueva de las tiendas. La cerradura ya no figuraba en Últimas ofertas.

La revisión visual y la hidratación en el navegador siguen pendientes por la limitación ya documentada. No se ejecutaron pruebas de navegador ni se intentó eludirla; los controles de HTML no confirman que el panel oscuro de Codex esté resuelto. El cambio sigue sin commit, subida ni despliegue público. G02 y los controles comerciales/publicitarios continúan independientes de este ajuste.

## Variante NN/G solicitada posteriormente: 03/10/2026, 01:48 UTC

Jonathan pidió reunir navegación y logo y comparar una versión más legible basada en NN/G. Se implementó una cabecera de una fila, tipografía del sistema, títulos sin corchetes y retiro de CRT/sombras duras. Guías vuelve a estar visible; Juegos y Últimas ofertas mantienen sus recorridos. El corte de dos filas anterior queda histórico. Fuentes, detalle, respaldo de comparación, 40 pruebas unitarias aprobadas, compilación y comprobaciones de HTML/CSS se registran en [VERSION-NNG-LOCAL-2026-10-02.md](./VERSION-NNG-LOCAL-2026-10-02.md). La revisión visual sigue pendiente; los cambios permanecen únicamente en local.

## Corrección de alcance posterior: 03/10/2026, 01:55 UTC

Jonathan descartó el cambio de identidad visual. Se recuperaron colores, fuente retro, fondo, bordes y sombras originales; se conserva logo y menú en una sola fila y el nuevo orden del contenido. La versión sans serif anterior queda histórica. Compilación, lint, TypeScript, 40 pruebas unitarias y entrega HTTP de HTML/CSS aprobados. La revisión visual permanece pendiente y los cambios siguen en local. El detalle está en el apartado final de VERSION-NNG-LOCAL-2026-10-02.md.

## Ajuste de ancho solicitado: 02/10/2026, 23:01 Santiago

Jonathan pidió reducir el ancho conservando el estilo y el orden. El contenedor de portada pasa de un máximo de 1760 px a 1440 px, centrado y con sus márgenes interiores adaptables. La cabecera conserva la fila de navegación. Compilación y TypeScript aprobados; lectura HTTP a las 02:01 UTC del 03/10 confirma portada 200 y la regla max-width:1440px en el CSS servido. Evidencia local: tmp/ui-comparison/home-width-1440-verification.json. No se añadieron pruebas para este ajuste de una clase ni se repitieron las pruebas funcionales ya aprobadas. Vista previa actualizada en 127.0.0.1:3112; inspección visual directa pendiente por la limitación documentada. Cambios únicamente locales.
