# GEO Schema & Structured Data Report — comparador-hardware.com.ar

Fecha: 9 de septiembre de 2026. Revisión de generación TypeScript y rutas públicas indexadas.

## Puntaje schema: 71/100 — base sólida, entidad incompleta

| Superficie | Schema detectado | Estado |
|---|---|---|
| Sitio | `Organization`, `WebSite`, `SearchAction` | Válido y server-rendered; faltan `description`, `sameAs`, `knowsAbout` y contacto cuando `SUPPORT_EMAIL` no está definido. |
| Producto | `Product`, `Offer`, `Organization`, `BreadcrumbList` | Correcto para ofertas agrupadas; disponibilidad se mapea explícitamente. |
| Comparativas/guías | `WebPage` y `FAQPage` | Incluyen `dateModified`; falta `Article`/`TechArticle`, `datePublished`, autor y publisher editorial. |
| Índice de precios | `Dataset`/`WebPage` | Dirección correcta; su valor dependerá de publicar una serie no vacía. |

## Validación y faltantes

- Se usa JSON-LD, con serialización que evita romper etiquetas script. Es una fortaleza.
- `Organization` no debe recibir `sameAs`, fundador, dirección, premios ni perfiles inventados. Hoy se marca como faltante, no como código para copiar y pegar.
- Categorías renderizadas en servidor emiten `FAQPage`; producto agrega `BreadcrumbList`, `Product` y `AggregateOffer` para ofertas comparables.
- `FAQPage` puede ayudar a extracción IA, pero no garantiza rich results en comercio.
- Falta confirmar con Rich Results Test cuando termine la inestabilidad 503; los datos de código no sustituyen la respuesta publicada.

## Acción recomendada

Primero configurar soporte público y perfiles reales. Después ampliar `Organization` solo con `description`, `contactPoint`, `sameAs` y `knowsAbout` verificables. No añadir ratings/reviews ni `Person` ficticias.
