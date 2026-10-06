# Versión local basada en criterios NN/G

Estado posterior: Jonathan descartó el cambio de identidad visual y pidió conservar el estilo original, aplicando únicamente el orden. La alternativa descrita en el primer corte queda histórica; la vista previa vigente corresponde a la corrección de alcance al final de este documento.

Corte: 03/10/2026, 01:48 UTC; 02/10 a las 22:48 en Santiago. Vista previa: http://127.0.0.1:3112/. Cambios locales, sin commit, subida o despliegue público.

## Solicitud y diagnóstico

Jonathan pidió comparar una propuesta basada en Nielsen Norman Group con la composición anterior, reunir menú y logo y mejorar las letras. Los títulos anteriores cargaban Press Start 2P; numerosos enlaces y textos usaban monoespaciada. Las capas CRT añadían líneas sobre el contenido. La segunda fila permanente de navegación consumía altura adicional.

Los principios de NN/G orientan esta propuesta; no existe una plantilla oficial de NN/G aplicada ni un estudio de nuestros visitantes que acredite mejoras de conversión. La elección de colores y el tratamiento visual son decisiones de esta implementación local. La solicitud explícita de Jonathan permite contrastar una tipografía diferente de la identidad pixel anterior.

## Fuentes y aplicación

- [Menu-Design Checklist: 17 UX Guidelines](https://www.nngroup.com/articles/menu-design/): navegación visible en escritorio, ubicación esperable, etiquetas claras, indicación del recorrido activo y submenús operables al pulsar. Aplicación: cabecera con logo, enlaces y controles en la misma fila, destinos con nombres familiares, estado activo y Más mediante details.
- [Legibility, Readability, and Comprehension](https://www.nngroup.com/articles/legibility-readability-comprehension/): texto suficientemente grande, tipos legibles, contraste y fondo sin interferencias. Aplicación: fuente sans serif del sistema, retiro del CRT y fondos animados, incremento del texto pequeño y títulos en escritura normal.
- [Visual Hierarchy in UX](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/): escala, contraste y agrupación orientan la atención. Aplicación: buscador primero, categorías agrupadas, últimas ofertas y guías, acceso breve a Juegos, comparativas y bajas con evidencia.

## Implementación

- Una sola fila de cabecera. Desde 1280 px aparecen Comparar precios, Armá tu PC, Últimas ofertas, Guías, Juegos si el piloto está habilitado y Más. En anchos menores se ofrece un botón de menú en esa misma fila; abrirlo despliega las rutas. Esta es la regla del código, no una medición visual de todos los tamaños.
- Logo reconocible con icono estático; texto Hardware AR sin glitch ni barridos. Tema claro/oscuro con cambio inmediato. Controles y enlaces con objetivos mínimos de 44 px; categorías y CTA principal de Juegos de 48 px.
- La fuente externa pixel deja de cargarse en esta variante. Los títulos, navegación y texto usan la familia sans serif del sistema. Se retiran corchetes decorativos, mayúsculas forzadas en títulos, sombras duras y efectos CRT. Se conservan bordes rectos, más finos, para contrastar la propuesta sin reconstruir toda la identidad.
- Búsqueda amplia al comienzo, con «Buscá un producto o modelo». Categorías bajo «Explorá por componente» y desplegable «Ver todas las categorías».
- Tarjetas editoriales compartidas para guías y comparativas, con marcos coherentes y límites de líneas. Las tarjetas de productos reciben texto más legible; su elegibilidad comercial conserva los controles de identidad, stock y frescura existentes.
- Juegos conserva su acceso visible y un módulo en el flujo principal, después de guías y antes de comparativas. El módulo mantiene afiliación, condiciones, destino interno y medición consentida. No se añadieron juegos ni se cargó el feed desde la portada.
- Últimas ofertas conserva la selección reciente implementada en el corte anterior: hasta cuatro productos de la lectura acotada de portada, con ofertas elegibles observadas dentro de tres horas. No se presenta como un orden exhaustivo del catálogo ni como un listado de descuentos.

## Evidencia

- 40 pruebas unitarias focalizadas en seis archivos aprobadas: navegación/recorrido activo, texto de portada, selección de ofertas, caché y métricas existentes de GA4/Eneba.
- Lint de los archivos modificados, TypeScript, git diff --check y compilación de producción aprobados. La compilación final generó 52 páginas estáticas y las rutas dinámicas esperadas.
- Se detectó una compilación que todavía entregaba el CSS anterior. Se reconstruyó únicamente la caché de nuestra vista previa; el archivo final 29luv0-r2hxwd.css responde 200 y contiene los estilos de la variante, fuente del sistema, eliminación CRT y ajuste del buscador.
- Lectura HTTP del corte: portada, /juegos-digitales y /guia responden 200, sin digests de error detectados. El HTML de portada contiene la clase ui-review-nng, logo y navegación en el mismo contenedor de fila, el buscador nuevo y Últimas ofertas. Juegos y Guías marcan su recorrido activo en sus respectivas páginas. No hay preloads de fuente ni scripts publicitarios detectados.
- Los pares de colores declarados se comprobaron numéricamente: texto principal 14,76:1 en claro y 16,60:1 en oscuro; texto secundario 7,58:1 y 9,39:1. Son contrastes de tokens; no sustituyen la medición de estilos calculados, estados o imágenes en el navegador.
- Inspección mecánica de Impeccable de los componentes revisados sin hallazgos; no se suprimieron reglas. Su resultado no determina la preferencia visual ni constituye una evaluación de NN/G.

La evidencia HTTP completa queda local en tmp/ui-comparison/nng-http-verification-2026-10-03.json. La composición anterior se conserva como referencia en once archivos .source dentro de tmp/ui-comparison/2026-10-03-before-nng; no es un selector A/B desplegado.

## Límites

La herramienta de navegador conserva el bloqueo de acceso ya documentado. No se eludió mediante otro navegador o control indirecto. No se ejecutaron pruebas de navegador para esta variante: geometría real, hidratación, interacción y aprobación visual siguen pendientes. La lectura de HTML/CSS no acredita que el panel negro de Codex se haya corregido.

La vista previa se inició con scraping, actualización a pedido y escrituras deshabilitados. Precios, stock, fechas, identidades, credenciales, anuncios, configuración de GA4 y selección afiliada no se modifican por este ajuste visual. No se cerraron G02 ni controles de AdSense/comerciales, ni se actualizó su estado en el tablero. Los cortes anteriores conservan su condición histórica.

## Corrección de alcance de Jonathan: 03/10/2026, 01:55 UTC

Jonathan pidió mantener el estilo, los colores y la identidad de la página y cambiar el orden. Se recuperaron globals.css, la fuente Press Start 2P del layout, categorías, títulos con corchetes, tarjetas editoriales, sombras pixel, fondo/CRT y promoción con su CTA rosa desde el respaldo previo. Los once archivos de la alternativa sans serif quedan como referencia local en tmp/ui-comparison/2026-10-03-nng-alternative, con extensión .source; esa variante ya no está activa.

La cabecera mantiene logo y menú en la misma fila y el ancho completo, con accesos verdes, estado activo rosa y sus controles originales de tema/cuenta. Desde 1280 px presenta los enlaces; en anchos menores conserva el menú desplegable en esa fila. La altura mínima baja de 72 a 64 px. Los enlaces monoespaciados usan 14 px y pasan a 16 px desde 1536 px para acomodar los controles. El logo recupera su caja pixelada, sombra y animación. El buscador sigue arriba; últimas ofertas, guías, juegos y comparativas conservan su nueva distribución. Las tarjetas editoriales mantienen marcos y límites de líneas compartidos.

Se conserva la corrección factual «MEJOR PRECIO REGISTRADO» de las tarjetas generales: su ventana de catálogo no debe presentarse universalmente como tres horas. Últimas ofertas sigue filtrando observaciones de hasta tres horas según su contrato propio. No se alteraron valores o fechas de ofertas.

Validación posterior: 40 pruebas unitarias aprobadas en seis archivos, lint, TypeScript, git diff --check y compilación de producción aprobados. La lectura HTTP confirma portada 200, logo y menú en la misma fila del HTML, fuente retro, sombras y los colores oscuros originales; el CSS 3i7l54eo7idv3.css responde 200 y no contiene la clase ui-review-nng. No se detectaron scripts de anuncios ni digests de error. Evidencia local: tmp/ui-comparison/retro-order-http-verification-2026-10-03.json.

La vista previa continúa en http://127.0.0.1:3112/, sin publicación. La revisión visual real y la interacción conservan la limitación de navegador ya documentada: esta lectura verifica entrega de código, no geometría ni hidratación.
