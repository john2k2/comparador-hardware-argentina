# Validación de RAM contra la ficha actual

La aprobación de fabricante de una oferta debe coincidir con la RAM que se
devuelve al comprador: nombre, SKU, generación, capacidad, kit, velocidad y
formato. Una clave canónica heredada no basta para reunir variantes.

Las estadísticas aceptan el contexto del producto actual. Sin ese contexto,
las pruebas de fabricante v2 fallan cerradas; el contrato anterior v1 se
conserva. El mapper y el saneador aportan los datos actuales y conservan las
observaciones pendientes sin devolver un mínimo comprable falso. El detalle
compara las especificaciones de ambas fichas antes de reunir sus ofertas.

La selección comprable excluye stock desconocido antes de escoger una
publicación por tienda, para que una publicación barata con stock desconocido
no oculte una alternativa del mismo modelo que sí tiene stock informado.

Verificación local: 11 suites, 170 tests aprobados; TypeScript y lint aprobados.
La revisión independiente reprodujo el rechazo de las dos regresiones de
stock y kit contradictorio. Los tests ejercitan mapper, saneador y detalle;
no prueban precios actuales de las tiendas ni una publicación en producción.

Recuperación: revertir esta unidad de estadísticas/contexto, saneador,
mapper, detalle y contraste RAM junto con sus tests. No modifica datos
almacenados ni habilita otro backend.
