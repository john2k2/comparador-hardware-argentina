# Completar identidad RAM con evidencia fabricante

Estado: planner puro local, sin integración automática en el lector ni escrituras de catálogo. El registro contiene tres MPN verificadas en fuentes públicas de Corsair el 11/10/2026. No interpreta letras del SKU, no consulta HTTP en runtime y no renueva precio, stock, fecha, clave canónica ni disponibilidad.

## Fuentes y alcance de cada dato

| MPN literal | Campos acreditados |
|---|---|
| CMG16GX4M1E3200C16 | 16 GB, 1x16 GB, DDR4, UDIMM, 3200, CL16, Vengeance RGB RS, negro, RGB |
| CMK8GX4M1E3200C16 | 8 GB, 1x8 GB, DDR4, UDIMM, 3200, CL16, Vengeance LPX, negro |
| CMK16GX5M1B5600C40 | 16 GB, 1x16 GB, DDR5, UDIMM, 5600, CL40, Vengeance, negro; sin RGB por FAQ oficial de esa serie DDR5 |

Fuentes primarias específicas: [RGB RS 16 GB](https://www.corsair.com/us/en/p/memory/cmg16gx4m1e3200c16/vengeancea-rgb-rs-16gb-1-x-16gb-ddr4-dram-3200mhz-c16-memory-kit-cmg16gx4m1e3200c16), [LPX 8 GB](https://www.corsair.com/ca/en/p/memory/cmk8gx4m1e3200c16/vengeancea-lpx-8gb-1-x-8gb-ddr4-dram-3200mhz-c16-memory-kit-black-cmk8gx4m1e3200c16), [Vengeance DDR5 16 GB](https://www.corsair.com/ww/en/p/memory/cmk16gx5m1b5600c40/vengeance-16gb-1x16gb-ddr5-dram-5600mhz-c40-memory-kit-black-cmk16gx5m1b5600c40), [FAQ Corsair](https://help.corsair.com/hc/en-us/articles/34383413781777-RAM-FAQ). Se usa capacidad y latencia ensayada de la ficha, sin confundirlas con latencia/velocidad SPD. Formato UDIMM se representa como `dimm`, preservando la separación frente a SODIMM.

La ficha LPX no contiene un negativo RGB explícito verificado en esta lectura: el registro deja lighting ausente. No se agrega `sin RGB` por fotografía o ausencia de un campo; un título o specs que afirmen iluminación RGB en ese registro queda pendiente porque no puede corroborarse. No se completan QVL, fabricante de IC, revisión física ni compatibilidad con una placa concreta. Compartir MPN tampoco acredita esas características.

## Contrato del planner

`planRamEnrichment` recibe MPN fabricante, título/SKU/specs del destino y título/SKU/specs de la fuente. Requiere SKU literal idéntica en ambos sujetos y en el registro fabricante; una SKU contradictoria en `specs.SKU` también rechaza. No elimina prefijos `EL_`, `IC_` o `NB_`, no interpreta un ID interno y no convierte un SKU ausente en conocido.

Completa sólo los campos ausentes en el título. Campos estructurados ya presentes deben concordar con la evidencia y conservan su procedencia. Cualquier capacidad, kit, generación, velocidad, CL, forma, color, serie o RGB explícito contradictorio rechaza el plan. Se preserva el título original íntegro junto al título enriquecido y la procedencia por campo: título, specs o fuente fabricante con URL/MPN/fecha.

El resultado debe pasar `exactRamAttributes` y ambos títulos enriquecidos deben conservar una prueba exacta idéntica, incluidos sus sufijos, condiciones y perfil. Añadir identidad no aprueba una oferta. El consumidor existente sigue comprobando publicación, SKU real recibida, observación nueva, precio y stock; un fallo mantiene los datos anteriores. El planner no modifica `proof`, RLS, base remota ni la página publicada.

## Cohorte candidata y límites

Corte de lectura local del 11/10/2026, copia `correcciones-auditoria-web`, HEAD inicial `60f66e1`: 7.160 ofertas RAM / 4.710 productos. Cuatro ofertas CompraGamer tienen título y SKU fuente/destino concordantes con estas tres MPN: `2639e7ea-0d9f-4a66-87d7-3e16a7913198`, `727c2eef-012f-46f5-b9a4-957d2ac64f15`, `0f9c233c-df54-44da-86dc-47f1737dac7c`, `398fe1a7-7f15-4ab4-aab5-97c201f73733`. Son candidatos de identidad; todavía no son observaciones nuevas.

Las 68 ofertas / 50 SKU con título de staging hash válido idéntico al destino no son 68 recuperaciones. No hay donantes de título estricto que completen las ofertas incompletas por igual SKU. Algunas MPN revelan conflictos reales: `CMH16GX5M1E6000Z36` y `CMK32GX5M2E6000Z36` dicen Black en CompraGamer y GREY en Corsair; no se incorporaron al registro. Un alias C16/CL16 tampoco resuelve publicaciones LPX rotuladas RGB ni URLs eliminadas.

## Verificación y reversión

Prueba focal: `npx vitest run src/lib/quality/ram-enrichment.test.ts src/lib/quality/ram-identity.test.ts src/lib/quality/offer-attribute-proof.test.ts`: 89/89, de las cuales 26 pertenecen al planner. TypeScript y ESLint focal sin errores. Verifica enriquecimiento de las tres MPN, preservación de objetos/fechas, contradicciones de variante, SKU interna/ausente, specs y revalidación de títulos.

Runtime local: módulo compilado en memoria con esbuild y ejecutado sobre los cuatro IDs en SQLite `readOnly`, transacción `BEGIN`/`ROLLBACK`: 4/4 planes válidos con SKU y títulos reales guardados; ninguna escritura ni HTTP. No existe una frontera remota ejecutada por esta unidad. Los registros fabricante son públicos y locales.

Aplicación del coordinador: cuatro registros guardados en la tabla privada `pilot_ram_enrichment`, identificados por oferta, publicación y MPN. Guardan títulos originales, hashes del destino y captura, atributos, fuente/fecha por campo y `priceApproved: false`. La captura real de CompraGamer del 11/10 a las 22:15:57.489 UTC volvió a confirmar las cuatro SKU literales y permitió revalidar los planes; se conservaron recibos de ambas versiones de metadata en `outputs/lectores-datos-ram-2026-10-11/`. Las filas completas de producto y precio permanecieron idénticas, incluidos precio, stock, fecha y proof. Cero escrituras remotas. Los datos todavía requieren integración revisada en el consumidor por oferta; no completan specs globales de productos agrupados ni habilitan comparación por sí mismos.

Reversión independiente: retirar `ram-enrichment.ts`, su test y este documento antes de integrar consumidores; no requiere revertir lectores, datos o trabajo ajeno. La aplicación SQLite y su evidencia de antes/después son responsabilidad del coordinador y deben registrarse por separado.
