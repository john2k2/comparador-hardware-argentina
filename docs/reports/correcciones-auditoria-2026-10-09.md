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

## A05 — Contacto y documentos públicos

`/contacto` se resuelve con la configuración de correo del servidor en ejecución.
Se excluye de los documentos prefabricados: antes la URL limpia podía mostrar
contacto pendiente mientras la variante con parámetros sí tenía correo. La caché
breve de ejecución sigue disponible. Los documentos que sí se generan conservan
también HSTS y Permissions-Policy.

Validación: test de caché sobre URL limpia, parámetros y navegación RSC; E2E
`contact-runtime.spec.ts` aprobado en Chrome sobre build local. Comprueba tres
enlaces de correo, la variante de asesoría y la navegación desde el armador con
`qa@example.test`. No abre el cliente de correo ni envía mensajes. La dirección
de prueba pertenece exclusivamente al entorno E2E.

Reversión: restaurar la lista de documentos y `public-document-cache`, con sus
tests y la variable de correo del harness. Antes de publicar, construir con la
configuración real; no reutilizar los artefactos del entorno E2E como publicación.

## A06 — Sitemap sin falsos vacíos

Los lectores distinguen respuesta vacía confirmada de fallo de transporte o datos
inválidos. Ante indisponibilidad, índice y páginas devuelven `503`, `no-store` y
`Retry-After`; una página vacía confirmada conserva `404`. Un último conteo válido
en memoria permite anunciar todas sus páginas, sin cachear esa contingencia.
Cada intento de lectura vence a los 2,5 segundos; el conteo admite dos intentos.

Validación: tests del lector y de ambos route handlers dentro de la tanda focal
de 83 pruebas aprobadas. Incluyen cero confirmado, `null`, cadena vacía, datos
malformados, excepciones, reintento y conservación del conteo válido. El harness
invoca los handlers y verifica estado, cabeceras y XML; no precisa navegador.

Reversión: `src/lib/seo/sitemap.ts`, ambos handlers y sus tests. No hay cambios SQL.
Límite: esto corrige la respuesta ante el fallo; no acelera por sí solo la consulta
productiva ni garantiza que Google ya haya vuelto a procesar el sitemap.
