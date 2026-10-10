# Actualización de ofertas — 10 de octubre de 2026

## Destinos editoriales

Base de trabajo: `20be619`. La consulta de una pieza recortaba a ocho filas
antes de comprobar modelo y presentación. Ocho variantes recientes podían
ocultar el procesador exacto y dejarlo sin destino para comprobar su oferta.

El reader aplica filtros de nombre antes del límite: modelo, cooler incluido,
Wraith cuando corresponde y atributos del kit de RAM. El resolver conserva
las comprobaciones finales de identidad, precio, stock y tres horas. No se
ampliaron lecturas, concurrencia, ventana comprable ni margen editorial.

Cuatro regresiones reproducen el desplazamiento con reader, mapper y resolver
reales. Las consultas contra PostgREST recuperaron los destinos de los Ryzen
5500, 5700 y 7600, y de la RAM Patriot CL36: 351–1055 ms en este corte.
La lectura fue con credencial pública y sin persistencia. Los precios antiguos
siguen fuera del subtotal hasta obtener una observación nueva válida.

La lectura directa de CompraGamer corroboró 5500, 5700 y 7600 con stock.
La RAM 17061 devolvió `no-observation`: no acredita agotamiento ni disponibilidad.
Una corrección de selección no basta para presentar siete piezas comprables.

La evidencia detallada está en `outputs/actualizacion-ofertas-2026-10-10/`:
`guide-reader-runtime.json`, `fuentes-guia-lectura.json` y
`fuentes-restantes-lectura.json`. Es un corte, no una garantía futura.
