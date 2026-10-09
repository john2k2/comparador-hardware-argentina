# Correcciones de la auditoría web — 09/10/2026

Candidata local sobre `5ef6a9dfbb5b5dbeba59901fc76bb9202823f89a`, rama
`codex/correcciones-auditoria-web`. El checkout principal con cambios ajenos se
conservó intacto. Este documento registra correcciones y pruebas de la candidata;
no acredita recuperación de producción.

## A04 — Guardado de la selección pública

El proceso de medición configuraba al escritor de Supabase, pero no al lector
público. Podía guardar una selección vacía como si hubiese leído el catálogo.
El guardado ahora exige ambos clientes, valida y limita el contenido público, y
conserva la fecha real de cada oferta. No publica relleno como bajas de precio.

Los procesos existentes reciben la clave pública de lectura; al terminar un ciclo
correcto `guides` o `priority`, se prepara la selección desde los datos ya guardados.
Este paso no vuelve a consultar tiendas ni modifica la cadencia del cron.

Evidencia de origen: el [proceso de medición del 09/10](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37938812977)
reportó el guardado público; la lectura de la fila confirmó cero ofertas y cero
bajas. Se comprobó la existencia de los nombres de los secretos, sin exponer valores.

Validación local: `save-observed-snapshot.test.ts` cubre lector ausente sin escritura,
error de lectura/escritura, vacío legítimo, sanitización y fechas. Forma parte de la
tanda focal de siete archivos y 83 pruebas aprobadas, registrada en
`outputs/correcciones-auditoria/unidades-estables.log`, y de `npm run verify`.
No se ejecutó el colector contra producción.

Reversión: retirar los cambios de los dos workflows y de
`save-observed-snapshot.ts` junto con su test. No requiere migración ni borrado de datos.
Pendiente productivo: observar un ciclo natural, su fila guardada y la portada
resultante. Mantener tres horas por oferta y el vencimiento del corte; un job verde
no demuestra por sí solo cobertura suficiente.
