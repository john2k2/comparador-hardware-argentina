# Jerarquía y recorridos con criterios de Nielsen Norman Group

Corte: 03/10/2026, 00:44 UTC; noche del 02/10 en Santiago. Revisión estructural de la versión local, sin publicación ni cambios de código en este corte. Jonathan pidió incorporar Juegos al análisis de distribución. Las recomendaciones son hipótesis de diseño para contrastar, no resultados de un estudio de nuestros visitantes.

## Fuentes y criterio

- [Visual Hierarchy in UX: Definition](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/), NN/G, 17/01/2021: escala, contraste y agrupación deben indicar qué merece atención primero. Aplicación propuesta: buscador dominante, recorridos secundarios legibles y módulos comerciales delimitados.
- [Banner Blindness Revisited](https://www.nngroup.com/articles/banner-blindness-old-and-new-findings/), NN/G, 22/04/2018: ubicaciones y tratamientos asociados a anuncios pueden hacer que se ignore contenido útil. Aplicación propuesta: el acceso a Juegos debe existir en navegación; no depender exclusivamente del bloque afiliado lateral. Mantener visible su condición comercial, sin disfrazarla de resultado orgánico.

NN/G es una fuente de criterios de usabilidad; esta revisión no es un servicio contratado, una certificación ni una evaluación realizada por NN/G.

## Evidencia actual del código

- `src/lib/seo/primary-nav-links.ts`: las entradas principales son Comparar precios, Armá tu PC y Guías. Juegos no aparece en ese menú ni en su lista secundaria; el menú móvil reutiliza ambas listas.
- `src/components/home/HomePageClient.tsx`: el buscador precede a categorías; después aparecen recientes cuando existen, destacados, guías, comparativas y bajas. La promoción de juegos y las tiendas patrocinadas comparten una columna posterior a todo ese contenido. La columna se coloca a la derecha desde `xl` (1280 px) y debajo del contenido en tamaños menores. Esta es una constatación del orden y las clases; no se midió cuánto la ven los usuarios.
- `src/components/home/EnebaPromotion.tsx`: enlaza internamente a `/juegos-digitales`, explica plataformas y afiliación. No consulta el feed. No es una impresión publicitaria de Google ni un enlace saliente a Eneba.
- `src/components/layout/SiteFooter.tsx`: existe un enlace adicional a Juegos digitales cuando el piloto está habilitado.
- `src/app/juegos-digitales/page.tsx` y `src/components/digital-games/DigitalGames.tsx`: sección independiente, con controles de habilitación, afiliación, vigencia del feed y revisión de activación. La selección es un piloto de dos productos; no representa demanda del público ni un catálogo amplio de ofertas.

## Recorridos y objetivos

| Intención | Entrada propuesta | Siguiente paso | Evidencia de éxito |
| --- | --- | --- | --- |
| Buscar un componente conocido | Buscador y categorías | Ficha y oferta de tienda | Encontrar el modelo correcto y visitar un comercio; clic no equivale a compra |
| Elegir una PC | Armá tu PC y guías por presupuesto | Componentes, compatibilidad y ofertas | Entender qué elegir y poder seguir hacia las tiendas o solicitar asesoría; intención de contacto no prueba recepción |
| Buscar juegos para PC | Juegos en navegación y acceso contextual en portada | Selección con plataforma, activación, vendedor y precio fechados | Visita a la selección y clic elegible a Eneba; venta/comisión sólo con evidencia del afiliado |
| Evaluar el proyecto como negocio | Información para comercios y contacto | Propuesta y canal comercial | Consulta recibida y verificable; no abrir un cuarto recorrido dominante para todos los visitantes |

## Dos alternativas concretas

### A — Búsqueda principal con Juegos accesible (recomendada)

- Cabecera: Comparar precios · Armá tu PC · Juegos · Más. Guías conserva su bloque en portada y un acceso en Más; también permanece en el menú móvil. El enlace de Juegos debe seguir la misma habilitación del piloto para evitar destinos desactivados.
- Portada: buscador → categorías → recientes opcionales/destacados → guías → módulo breve Juegos para PC → comparativas/bajas → pie. El módulo de juegos sale de la columna comercial; debe existir una sola instancia y conservar afiliación, condiciones y destino interno. El CTA propuesto es «Ver juegos» y la aclaración comercial queda al lado del contenido, no oculta en un tooltip.
- Anunciantes futuros conservan un espacio propio, rotulado y separado de la selección afiliada. Si no hay anunciantes configurados, no se muestra una caja vacía. La columna comercial no debe reducir el ancho principal sólo porque exista el piloto de juegos.
- Móvil: mismo orden de contenido, Juegos identificable en el menú y módulo dentro del flujo principal. No depender del pie ni añadir una barra flotante para compensar la estructura.

Ventaja: conserva el propósito del comparador y hace descubrible el recorrido de juegos. Incertidumbre: hay que comprobar si la posición del módulo tras guías es suficiente; el menú reduce la dependencia de hacer scroll. La selección inicial sigue siendo pequeña y no debe anunciarse como un gran catálogo.

### B — Tres entradas con el mismo peso

- Cabecera con los tres destinos; bajo el buscador, tres accesos equivalentes: Componentes, Armá tu PC y Juegos. Después, contenido agrupado por esos recorridos y un espacio comercial independiente.
- Móvil: tres filas apiladas antes de las categorías y listados.

Ventaja: presenta de inmediato todas las posibilidades. Riesgo: añade opciones sobre la búsqueda y consume espacio inicial en móvil; otorgaría a un piloto de dos juegos el mismo peso que al catálogo y al armador. No hay evidencia actual suficiente para justificar ese peso equivalente. No recomendar B únicamente porque tenga más posibilidades de monetización.

## Medición y prueba de uso

El código de `src/lib/eneba/analytics.ts` diferencia `affiliate_promo_view`, `affiliate_promo_click`, `affiliate_pilot_view` y `affiliate_outbound_click`, bajo consentimiento. La vista de promoción mide presencia geométrica de al menos la mitad del bloque; no prueba lectura ni atención. Los clics repetidos no son usuarios únicos y no deben sumarse a los clics automáticos de GA4 o de hardware.

- Comparar exposición del módulo con aperturas desde ese mismo módulo usando periodos y denominadores coherentes; no dividir indiscriminadamente todos los clics por todas las vistas.
- Si se implementa el acceso de navegación, registrar su origen separado del módulo: cabecera, menú móvil o portada. No reutilizar el evento de exposición del módulo para un enlace de navegación.
- Medir visitas de la selección, estados ready/empty/error y clics salientes. Datos ausentes, no consentidos o todavía no recibidos quedan no verificados, no cero. No atribuir una variación a la distribución sin suficiente evidencia comparable; cambios locales no son un experimento público.
- Probar tres tareas con usuarios: encontrar una CPU concreta, encontrar una guía de PC y encontrar un juego con su plataforma/condiciones. Registrar aciertos, desvíos y tiempos observados, sin inventar tasas ni un umbral universal.
- La comparación GA4 y la recepción de estos eventos no se consultaron en este corte. Los cambios de cobertura de consentimiento y la exclusión interna no retroactiva impiden usar datos antiguos como una prueba limpia del diseño nuevo.

## Decisión y límites

Se recomienda A como base de revisión local; la preferencia por mezclar juegos conocidos y ofertas sigue vigente, pero ampliar la selección requiere publicaciones concretas y restricciones revisadas, no sólo reordenar la portada. No se añadieron productos, imágenes, precios, anuncios ni cambios de scraping. El piloto mantiene sus controles de activación y frescura.

Jev no figura entre las herramientas disponibles en esta sesión tras buscar su nombre y `evaluate_options`; no se hizo una consulta ni se le atribuye la recomendación. La comparación queda basada en código y fuentes, con las incertidumbres explícitas. No se cerraron tareas operativas ni se alteró el tablero. La revisión visual del navegador sigue pendiente por la limitación previamente documentada; no se intentó eludirla. Los cortes anteriores se conservan.
