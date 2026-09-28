# Imágenes de productos — 28/09/2026

Corte técnico: 20:17 UTC. Solicitud interactiva de Jonathan; no es una ejecución del seguimiento automático.

## Diagnóstico comprobado

- CompraGamer: el mapper resolvía un nombre con `/` inicial contra `/productos`, perdiendo esa carpeta. La URL antigua de la foto del i5-12600KF devolvió 403; la misma foto con `/productos/` devolvió 200 y JPEG. La ficha original de la tienda también carga sus fotos.
- El componente descartaba todas las fotos del host de CompraGamer antes de intentar cargarlas.
- El CSP omitía los orígenes de CompraGamer, Maximus y Venex, aunque las fotos se sirven con un elemento de imagen directo. Dos fotos concretas de Maximus respondieron 200/JPEG.
- Las agrupaciones podían conservar una imagen vacía o el dibujo de reserva aunque otro registro equivalente tuviera foto. La persistencia también podía reemplazar una foto anterior por una observación sin imagen; este comportamiento se comprobó en código y se cubrió con pruebas, sin atribuir retrospectivamente todas las imágenes ausentes a esa causa.
- La ASUS RTX 5060 Ti PRIME OC 8 GB tenía `products.image = null`, con una oferta de XTPC identificada. Su ficha XTPC publica `https://www.xt-pc.com.ar/img/productos/3/VGA2890.jpg`, comprobada con 200/JPEG y 50.168 bytes.

## Arreglo

1. Mapper de CompraGamer con resolución relativa correcta. Reparación al leer URLs antiguas que coincidan con el formato conocido, sin inventar nombres ni consultar tiendas desde cada visita.
2. Eliminación del bloqueo preventivo del componente. Se conserva el dibujo de reserva ante un error real de carga.
3. Orígenes concretos añadidos a la lista compartida de CSP y configuración de imágenes. No se amplían permisos de scripts, conexiones o marcos.
4. Las agrupaciones conservan la primera imagen real de productos que ya se consideran equivalentes. No cambian los criterios de identidad o las ofertas.
5. Persistencia: una observación sin foto conserva la imagen anterior del mismo ID, tanto dentro del lote como en la base. La firma se calcula después de esa elección; una foto nueva real sí puede reemplazar a la anterior.
6. Corrección puntual de `image` para `agrupado-tarjetas-graficas-asus-rtx-5060-ti-prime-8gb-sd7kwr`, condicionada al ID, imagen nula y URL exacta de XTPC. No se disparó refresh ni se actualizaron precios. `products.updated_at` permaneció en 23/09/2026 09:53:18.450704 UTC y la observación XTPC en 23/09/2026 09:53:04.839 UTC.

## Verificación

- 64 pruebas aprobadas en 10 archivos: normalización, hosts, componente, mapper, agrupaciones, lectura, persistencia y deduplicación de escritura.
- TypeScript, lint de los archivos cambiados y compilación aprobados; 51 páginas generadas.
- Chrome con build de producción local y catálogo real: procesadores 12/12 fotos reales cargadas, antes 7/12 y cinco dibujos de reserva; placas de video 12/12 fotos reales cargadas tras la corrección puntual, incluyendo CompraGamer, Maximus y XTPC.
- Las visitas locales se ejecutaron con scraping vivo y refresco interno desactivados. Las comprobaciones de tiendas fueron puntuales.
- Publicación y verificación pública: pendientes al crear este corte; registrar el resultado posterior sin interpretar el build como prueba del navegador.

### Corte público posterior — 20:24 UTC

Código subido en `61e2cc5`. Workers Builds `c04d80ec-01af-4ba5-aa87-a2a898865c19` terminó `success`. Chrome confirmó en el sitio público 12/12 fotos reales cargadas en `/comparar/procesadores` y 12/12 en `/comparar/placas-de-video`, sin dibujos de reserva en esas muestras. Las fotos de CompraGamer tienen ancho natural de 150 px, las dos de Maximus 600 px y la foto reparada de XTPC 610 px. La ficha del i5-12600KF también carga su foto con la ruta `/productos/` correcta. Se leyó nuevamente la fila corregida en Supabase y se confirmó que las fechas de catálogo y de oferta indicadas arriba permanecen intactas. Esta comprobación certifica las muestras y la ficha; no certifica el catálogo completo ni la frescura de precios.

## Límites y seguimiento

La muestra no certifica todas las imágenes del catálogo. Se restauraron los permisos de Venex a partir del contrato de su scraper y del CSP, pero todavía no se verificó una foto concreta de Venex en Chrome. La disponibilidad de una foto no prueba stock, precio reciente, identidad revisada ni permiso de reutilización comercial; los controles de ofertas y los pendientes de derechos de fotografías para AdSense siguen vigentes.

En siguientes controles ligeros, distinguir imagen ausente en catálogo, URL mal construida, bloqueo CSP y fallo real del servidor. Conservar una ficha afectada y su evidencia antes de cambiar el scraper o atribuir el fallo a la tienda.

## Reversión

El código se revierte como una unidad de imágenes, sin incluir los documentos ajenos pendientes. La corrección puntual puede revertirse a `image = null` únicamente para el ID indicado y mientras conserve la URL exacta añadida; no revertir fotos nuevas obtenidas posteriormente ni modificar fechas de ofertas.
