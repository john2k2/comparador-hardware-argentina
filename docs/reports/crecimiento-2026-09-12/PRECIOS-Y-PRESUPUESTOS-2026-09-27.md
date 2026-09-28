# Precios comprables y presupuesto de $2 millones — 27/09/2026

Corte iniciado el 27/09; comprobaciones finales continúan el 28/09 UTC, todavía 27/09 en Argentina y Chile. Jonathan autorizó actualizar precios, usar la siguiente oferta disponible y rearmar la guía para respetar ARS 2.000.000. La revisión humana editorial de G20 sigue pendiente; esta autorización define el presupuesto y no certifica ensayos de hardware.

## Cambios publicados

Commits: 1c13884, 08c2b59, 1899718, c08ec9f y 4124240. Workers Builds de 4124240: 54ae2ad5-ce7b-4e4d-8474-14c814349be2, success.

- Las guías muestran únicamente filas con ofertas de precio positivo, observación real de ≤3 h, stock informado y sin revisión de identidad pendiente. Si la más barata falla esos controles, se usa la siguiente elegible. El desempate favorece la oferta individual solo si el precio es igual; ya no antepone una oferta individual más cara a una agrupada válida.
- Lectura por modelo para las siete categorías, hasta dos consultas de ocho candidatos por pieza y dos solicitudes concurrentes. Una oferta individual recién observada puede entrar sin esperar su agrupación. No se restauró la lectura de miles de productos que consumía CPU del Worker.
- Un kit de RAM de escritorio no se descarta por contener kit. Un CPU que incluye Wraith Stealth no se confunde con combo de CPU y motherboard. Se conservan rechazos de PCs completas, SODIMM, variantes CPU/GPU incorrectas, generación/capacidad/frecuencia RAM incompatibles y ofertas pendientes de identidad.
- Mother MSI PRO B650M-B: los números de generaciones admitidas y el código interno entre paréntesis no se interpretan como velocidad de RAM. La comparación conserva el sufijo del modelo: B650M-B no equivale a B650M-P.
- Venex: búsqueda real resultado-busqueda.htm, en singular. La ruta anterior devolvía el catálogo inicial aunque la consulta no correspondiera. URLs sin tracking keywords, dominio HTTPS controlado y stock basado en señales explícitas; no se presume in-stock para todas las tarjetas.
- La persistencia a pedido actualiza products.last_scraped_at con la fecha real de observación. La primera migración que tocaba updated_at no resolvió el orden porque el trigger protege la firma de contenido; la segunda corrigió esa causa. No se cambió la fecha de product_prices ni se renovó frescura sin respuesta de una tienda. Archivos de migración alineados con versiones efectivamente aplicadas. RPC conserva lease, URL/tienda/producto exactos y permisos restringidos.

## Selección revisada

AM5 se conserva. El 7600 incluye Wraith Stealth en la publicación comprobada; la RAM baja de 32 GB a un módulo de 16 GB y el SSD pasa de Fury Renegade a NV3. Son decisiones explícitas para entrar en el presupuesto. La guía explica límites de ampliación, capacidad/ancho de banda y perfiles de memoria.

| Pieza | Oferta elegible (ARS) | Tienda |
|---|---:|---|
| Ryzen 5 7600 + Wraith Stealth | 354.700 | CompraGamer |
| ASRock RX 7600 Challenger OC 8 GB | 533.350 | CompraGamer |
| ADATA XPG Lancer Blade White RGB DDR5 16 GB 5600 CL46 | 436.400 | CompraGamer |
| Kingston NV3 NVMe 1 TB | 290.950 | CompraGamer |
| MSI PRO B650M-B AM5 | 146.200 | CompraGamer |
| MSI MAG A650GN II 650 W Gold | 100.829 | SCP Hardstore |
| Cooler Master Elite 302, tres ventiladores | 71.999 | Mexx |
| Total de componentes | 1.934.428 | |

Margen hasta objetivo: ARS 65.572. Precios observados, sujetos al medio de pago y disponibilidad posterior; envío, armado, licencia, monitor y periféricos no incluidos. No hay pruebas físicas del conjunto ni garantía de frecuencia 5600. La fuente oficial de AMD describe el 7600 y Wraith Stealth, y MSI identifica B650M-B como AM5/DDR5 con M.2 2280 PCIe4 y formato mATX: [AMD](https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html), [MSI](https://www.msi.com/Motherboard/PRO-B650M-B/Specification).

La RAM de ARS 421.350 se descartó: el catálogo la había agrupado con el nombre de la variante Black y la publicación correspondía a White. Jev marcó model-conflict (0,81); se conserva needs-review y no se elimina el conflicto para abaratar el presupuesto. La siguiente oferta consistente es White RGB de ARS 436.400 (0,87). La agrupación de variantes de RAM queda como asunto de calidad de G02/G16; la exclusión protege esta guía, pero no resuelve todas las colisiones del catálogo.

## Evidencia y límites

Jobs medidos a pedido: 3cf99db2 partial 2/5; 22d60189 completed 1/1 motherboard; 3d2f5e2a completed 1/1 gabinete; 1c2f3d2c partial 2/3 CPU/SSD y RAM con URL antigua; 95390103 completed 1/1 alternativa Black. El workflow de RAM descriptiva 36361208552 obtuvo ofertas actuales, con resultado de identidad por variante conservado. Los dos intentos Venex anteriores sin observaciones se registran como fallidos; el intento descriptivo con ruta corregida 36360539556 actualizó una oferta, aunque su baja confianza la excluye de la recomendación. Un workflow exitoso no implica que todos sus productos sean recomendables.

Evidencia local privada, excluida de Git: cortes/2026-09-27/precios-presupuestos/. Incluye respuestas de tiendas, solicitudes públicas, resultados de jobs sin lease ni hash de solicitante, pruebas locales y comprobación pública por tamaños. No son siete ciclos útiles diarios de G02 y no sustituyen su muestra fija.

Pruebas: 752 unitarias aprobadas y dos omitidas; lint, TypeScript y build aprobados. Regresión del presupuesto completo, cooler incluido frente a combo/tray, capacidad/generación/módulos RAM, sufijo de motherboard y selección por menor precio válido.

G01 continúa en observación; G02 y G20 siguen abiertos. Las guías de $1M y $3M necesitan rearmado y fuentes completas antes de presentarlas como listas completas de compra. No se solicita AdSense ni se habilita contacto a sponsors por este corte.

Comprobación pública final 28/09/2026 00:16 UTC: escritorio1280 y móvil390; seis respuestas200; sin erroresJavaScript ni desbordamiento; listas sin filas sin oferta. $2M7/7 total1934428; $1M1/7 subtotal71999; $3M2/7 subtotal1180478. Capturas inspeccionadas; enlaces de las siete piezas y fechas observadas incluidos en PUBLICO-FINAL.json.

## Resguardo de los modelos comprobados — 28/09/2026, 00:36 UTC

La revisión posterior encontró un riesgo en la selección dinámica: términos genéricos B650 y Mid Tower podían reemplazar la motherboard por otra ATX conservando el Elite 302, que solo admite Mini-ITX/mATX. La guía de $2M fija MSI PRO B650M-B y Cooler Master Elite 302 como modelos de esa pareja. El selector exige el modelo declarado también para referencias históricas; un sufijo distinto o una placa ATX más barata no reemplazan esas piezas. Se conserva la selección de la siguiente tienda con oferta elegible del modelo comprobado.

Fuentes oficiales consultadas: [MSI PRO B650M-B](https://www.msi.com/Motherboard/PRO-B650M-B/Specification), mATX y PCIe 4.0; [Cooler Master Elite 302](https://www.coolermaster.com/en-global/products/elite-302.html), Mini Tower y soporte Mini-ITX/mATX. El título comercial de Mexx dice Mid Tower; se conserva como nombre de la oferta, pero la descripción editorial utiliza el formato del fabricante. La guía enlaza ambas fuentes. La fuente de alimentación ya no promete margen genérico para upgrades: requiere revisar conectores y el modelo elegido.

754 pruebas unitarias aprobadas y dos omitidas; lint y TypeScript aprobados. Dos regresiones verifican exclusión de otras motherboards/sufijos y variantes de gabinete, tanto en ofertas actuales como en referencias. Publicación y comprobación pública de este resguardo pendientes en este corte. No certifica QVL, BIOS ni un ensayo físico de todo el conjunto. El armador libre y las otras guías conservan su evaluación de compatibilidad pendiente; no se declara resuelto globalmente ese asunto.
