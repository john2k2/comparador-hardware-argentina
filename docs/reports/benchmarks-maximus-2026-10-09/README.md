# Reparaciones R01 y R02: candidata local comprobada

Corte:09/10/2026 en Santiago (10/10 UTC). Base de producción utilizada:`e52a4df55f959875916a7dd991435c5f0101eac3`. Rama local:`codex/benchmarks-maximus-20261009`. No se mezcló el checkout principal ni se publicaron estos cambios.

## Resultado verificable

| Reparación | Antes | Candidata comprobada | Pendiente para cierre público |
| --- | --- | --- | --- |
| Benchmarks CPU | Ryzen7600 enlazaba7600X; números sin versión acreditada |26 modelos contrastados con el chart oficial Geekbench7; valores, identidad, versión, metodología y fecha de consulta; cada lado muestra su propia fuente | Publicación y repetición en el dominio real |
| Benchmarks GPU |30 índices relativos sin derivación verificable | Se retiran esos puntajes; precios y especificaciones permanecen; el comparador explicita la falta de benchmark | Recuperar puntajes sólo con evidencia adecuada; no bloquea esta corrección |
| Maximus | El lector devolvía una oferta corroborada con condición special y persist_adaptive_offer la rechazaba | La misma respuesta pública y fecha original se guardan en PostgreSQL local y llegan al mapper y a la página; el runner distingue confirmación, rechazo e incertidumbre | Aplicar la migración acotada, observar una escritura productiva nueva y comprobar API/UI y continuidad |

El caso Maximus es ITEM12032, SKU100-100000593WOF, Ryzen5 7600X, ARS339.300 e in-stock a01:18:02.752 UTC. No significa que toda Maximus estuviera caída: otras rutas ya habían guardado ofertas. Tampoco se ha recuperado toda la cobertura del catálogo.

## Pruebas realizadas

- Control integrado de código: lint y tipos aprobados,2395 tests unitarios aprobados y2 omitidos ya existentes;199 controles de operación aprobados. Tras endurecer la guarda de procedencia,103 tests focales CPU/comparación aprobados y nuevo typecheck de build aprobado.
- Navegador sobre servidor construido:98 escenarios distintos cubiertos. Primera pasada:96 aprobados y2 fallos de una expectativa demasiado amplia de la prueba Maximus. Revisión independiente confirmó que un ratio individual de CompraGamer vigente es válido aunque Maximus sea rechazado; se corrigió sólo esa expectativa, exigiendo cero ratios en Maximus, uno en el control y ningún ganador. Repetición focal:4/4 aprobados. La aplicación no fue alterada para esconder el dato válido.
- Los escenarios nuevos cubren7600 frente a7600X, GPU sin evidencia, CPU no cubierta, Maximus guardado y Maximus rechazado, en escritorio1440px y móvil390px. Se incorporan al comando de pruebas críticas de CI.
- Chrome con el catálogo público real y la aplicación local: selección de Ryzen7600/7600X y RTX4060/RX7600, fuentes, valores, abstención por antigüedad y abstención de rendimiento GPU comprobadas. Móvil390px sin desbordamiento global; sin errores de consola en el corte. Las fechas de las ofertas no se modificaron.
- PostgreSQL focal:30 controles aprobados, con rechazo antes y persistencia/comparabilidad después. Precio, stock, ID, SKU y timestamp literales conservados; fixtures históricas rechazadas; permisos de función preservados; reversión de definición ensayada.
- PostgreSQL CI completo:83/83 migraciones,15/15 archivos de regresión SQL, fastpath de precios actuales y2/2 casos de concurrencia aprobados. Bootstrap original sin permisos adicionales. PostgreSQL17.11 local frente a17.6.1.063 remoto: no se afirma equivalencia de todas las extensiones/configuraciones de Supabase.
- Revisión independiente:26 registros cotejados contra capturas de las dos series del chart; defecto de guarda encontrado, reproducido, corregido y revisado de nuevo. Ningún hallazgo pendiente de esa revisión.
- Empaquetado de publicación aprobado con Next 16.3.8/Turbopack y OpenNext 1.20.6, después de aislar físicamente las dependencias locales. El ensayo de Wrangler terminó correctamente sin subir nada: 5.331,53 KiB comprimidos. Los intentos previos de reutilizar un build QA desde dependencias enlazadas no eran equivalentes al flujo completo y fallaron; los logs se conservan. No se cambió la configuración productiva para conseguir este resultado.

## Evidencia y reproducción

Los informes [benchmarks.md](benchmarks.md) y [maximus.md](maximus.md) detallan fuentes, contrato y pruebas focales. Los recibos, respuestas públicas y capturas están en el directorio hermano `../evidence/` del repositorio aislado:

- `maximus-live-result.json`, `maximus-12032-page-live.html`, `maximus-12032-detail-live.txt` y hashes de ambos cuerpos.
- `maximus-persistence-regression.json`, `maximus-persisted-product.json`, `persist-adaptive-offer-before.sql` y `sql-ci-replay.json`.
- `geekbench-chart-single.json`, `geekbench-chart-multi.json`, capturas del chart y contradicción de versión en páginas nominales.
- `verify.log`, `e2e.log`, `e2e-report-initial.json`, `e2e-maximus-final.log`, `e2e-report.json` y capturas bajo `e2e-results`.
- `opennext-production-build.log` y `wrangler-dryrun.log` acreditan el empaquetado final, no un despliegue.
- `local-real-catalog-desktop.png`, `local-real-catalog-mobile.png`, `local-real-gpu.png` y sus DOM; `public-comparison-before.png` conserva el antes publicado.

Los ensayos de navegador usan reloj fijo sólo para reproducir capturas; no reescriben fechas. Las pruebas SQL crean y eliminan exclusivamente su propio cluster local. La aplicación local de catálogo real carece de claves privilegiadas y tiene desactivado el refresh.

## Operación concreta propuesta

1. Confirmar que main y la definición productiva siguen en las revisiones revisadas. Publicar únicamente los commits de esta rama y comprobar CI/Cloudflare; compilar en el entorno productivo con su configuración existente. El paquete local de prueba usa claves públicas ficticias y no debe subirse.
2. Aplicar sólo `20261010011643_allow_maximus_observed_special_price.sql`: añade Maximus a la lista de condiciones special admisibles. Abortará si el MD5 previo no es `f66ccd0f002da0ddf8b8b4f8e8ecd992`. No modifica tablas, fechas históricas ni permisos.
3. Comprobar definición y ACL; verificar una observación Maximus nueva que guarde el siguiente ciclo adaptativo existente. Cotejar ACK, fila, fecha, identidad, condición y API/UI con la publicación exacta. Una lectura de tienda o un ACK aislado no cierra esta etapa. Si ese ciclo no alcanza una oferta Maximus elegible, mantener abierta la comprobación, sin forzar leases ni despachar un barrido adicional.
4. Observar resultados de los ciclos naturales existentes para acreditar continuidad; no crear una segunda automatización ni confundir una ejecución manual con un ciclo programado. Un piloto manual focal requeriría concretar y revisar su operación antes de ejecutarlo: el runner general acepta límites pero no un filtro por publicación exacta.

Reversión: restaurar sólo los commits de aplicación de estas unidades y la definición anterior guardada, con transacción, lock_timeout5s y statement_timeout60s. Comprobar hash y ACL posteriores. No borrar ni redatar precios observados durante la corrección. Si cambia la base o aparece una regresión de identidad, stock o fechas, detener la publicación y revisar la diferencia.

La lectura de capacidad registró942.558.355bytes de base. Esta unidad no declara resuelto R04 ni propone barridos, borrados, ampliaciones de cuota o altas masivas. R01/R02 tienen cierre local; el cierre de producción sigue pendiente.
