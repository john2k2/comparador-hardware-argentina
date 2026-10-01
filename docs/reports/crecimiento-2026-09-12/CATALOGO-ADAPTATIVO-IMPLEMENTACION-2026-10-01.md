# Catálogo adaptativo — implementación del 01/10/2026

El catálogo existente entra completo en una cola persistente: 60.781 ofertas de 34 tiendas. Este alta no significa que estén actualizadas, que sean 60.781 productos distintos ni que cada publicación siga existiendo. El descubrimiento de productos nuevos continúa por los adaptadores existentes; no se declara cobertura completa de los catálogos originales de cada comercio.

## Política inicial

| Alcance | Revisión objetivo |
|---|---:|
| Favoritos y alertas activas | 3 h |
| Guías y solicitudes del armador | Conservan su proceso y elegibilidad de 3 h |
| CPU, GPU, RAM, SSD/almacenamiento, motherboards y fuentes | 24 h |
| Cualquier producto con al menos 5 usuarios de ficha o 2 usuarios con clic de salida en el informe semanal | 24 h |
| Gabinetes y refrigeración sin esas señales | 72 h |
| Periféricos y computadoras sin esas señales | 7 días |

Son objetivos sujetos a capacidad y a una fuente que responda. El catálogo general sólo presenta como recientes las ofertas observadas hasta 24 h; una oferta de mantenimiento puede mostrarse como referencia entre revisiones. Las guías y los totales confirmados del armador siguen exigiendo tres horas, identidad y variante correctas, stock informado y las reglas presupuestarias vigentes.

## Ejecución y controles

- GitHub Actions ejecuta `Adaptive catalog refresh` al minuto 41 de cada hora. Puede retrasarse o perder un turno; la cola conserva el progreso. No requiere que el Mac permanezca encendido para revisar precios y evita scraping pesado en el Worker gratuito.
- Cada proceso toma lotes de 24, hasta 2500 ofertas o 17 minutos. Tres tiendas pueden avanzar en paralelo; cada tienda se serializa. Reserva el 25% del lote para mantenimiento y rota entre tiendas.
- Los leases vencen a los 20 minutos. Un error de lectura no cambia el precio ni su fecha. Los reintentos aumentan de una hora a 24 h. No se infiere agotamiento por vencimiento ni porque una búsqueda no encuentre un enlace.
- CompraGamer comparte una lectura completa del feed entre las publicaciones. Las demás fuentes intentan el detalle conocido y luego la búsqueda existente cuando corresponde. No se acepta un producto parecido como sustituto de la URL/ID seleccionado.
- WooCommerce y JSON-LD usan el producto principal. Los relacionados, agregados, múltiples variantes, otra moneda o una identidad contradictoria no se convierten en precios comparables. Los redirects permitidos están limitados a HTTPS y al host configurado de la tienda.
- Se corrigieron adaptadores que asumían stock por encontrar un precio. Una observación válida de precio con disponibilidad no informada guarda `unknown`; nunca se convierte en stock positivo. Guías y armador no la consideran elegible.
- El historial agrega cambios reales de precio/stock. Una lectura válida sin cambio adelanta la fecha de observación y no duplica el historial. Se guarda procedencia de la publicación y se identifica el precio especial de CompraGamer, sin inventar condiciones de pago de las otras tiendas.
- Cola, interés de Analytics y resúmenes operativos tienen RLS y no permiten acceso anónimo/autenticado. Sólo el proceso privilegiado los opera. Los resúmenes del nuevo barrido se conservan 30 días; el historial de precios conserva su política existente.

## Analytics

Se actualizó `Seguimiento Comparador Hardware`, conservando su horario diario de las 10:00. Desde el lunes 12/10/2026 importa semanalmente agregados de siete días completos terminados tres días antes, con IDs de productos existentes y ocho días de vigencia. No copia credenciales de Google a GitHub.

Se consultan usuarios únicos de `view_item` y `outbound_store_click` por `pagePath`. Sólo los eventos de fichas `/product/<ID>` permiten esta atribución inicial: los clics desde tarjetas de búsqueda, portada u otras secciones no se atribuyen todavía por producto en este agregado. No confundir este alcance parcial con todos los clics del sitio.

No se usan días anteriores al 03/10: el filtro de IP interna no elimina el historial anterior. Tampoco se usa `request_count` del API como demanda humana. Si faltan datos o una lectura de Analytics falla, no se inventan ceros ni se renueva una señal vieja. Los datos vencen y la categoría conserva su frecuencia base. No se alteran umbrales, guías ni despliegues automáticamente.

## Evidencia y límites

- Cola inicial: 60.781 ofertas; 5.888 kB antes de agregar la categoría local de planificación.
- Selección del lote: 9.121 ms en la primera consulta real; tras evitar lecturas repetidas de productos y ordenar columnas pequeñas, 722 ms para 24 ofertas. Es una medición, no una garantía de latencia.
- Piloto 1: 24 intentos, una observación guardada, cero comparables.
- Piloto 2: 48 intentos, 13 observaciones guardadas y 10 comparables. Son publicaciones distintas; no constituyen un experimento para atribuir una mejora porcentual.
- Hay URLs antiguas, categorías incorrectas, bloqueos y detalles que requieren adaptadores específicos. El barrido los registra y no los disfraza como productos frescos. La limpieza de identidad/categorías y la reparación de esas fuentes siguen siendo necesarias para alcanzar cobertura alta.
- Búsqueda real: RTX 5060 por relevancia 1.306 ms; Ryzen 5600, 200 ms; precios ascendentes con mínimo de $100.000, 1.038 ms. El caso global sin query y con mínimo bajó a 3.757 ms al evitar inspección de ofertas que ese orden no necesita. No ampliar el catálogo servido al Worker sólo porque el test SQL pase.
- Validación: pruebas de leases, permisos, mantenimiento, promoción por Analytics, observaciones desconocidas, rechazo de observaciones viejas/futuras e historial sin duplicados en PostgreSQL aislado. 1.018 pruebas de aplicación aprobadas, 17 pruebas de navegación/móvil/consentimiento aprobadas, tipos y lint aprobados y build OpenNext aprobado.

La meta de al menos 95% del subconjunto prioritario observado en 24 h se evalúa con siete días reales. Todavía no está lograda. Cobertura por observación y disponibilidad para comparar son indicadores distintos.
