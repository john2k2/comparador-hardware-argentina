# Validación de pruebas y preparación TestSprite — 30/09/2026

## Resultado

**Actualización posterior:** el barrido ampliado y los hallazgos actuales están en
[VALIDACION-AMPLIADA-2026-09-30.md](./VALIDACION-AMPLIADA-2026-09-30.md).
Los conteos y pendientes de las secciones siguientes corresponden a la primera etapa.

Se ejecutaron las suites propias del proyecto y 16 recorridos distintos de
TestSprite. El proveedor informa 15 aprobados y 1 bloqueado; la revisión de
aserciones acepta 13 con evidencia automatizada útil, mantiene 2 inconclusos y
1 bloqueado. Los tres últimos tienen comprobaciones complementarias de navegador.
Esto no acredita la validación completa de la página: búsqueda pública, sesiones,
permisos y datos reales conservan pendientes explícitos. El 503 observado en los
probes sigue sin una corrección acreditada en esta auditoría.

## Comprobaciones ejecutadas

| Comprobación | Resultado observado |
| --- | --- |
| Lint y tipos | Aprobados; revisión adicional de los nuevos/últimos specs también aprobada. |
| Vitest completo, `npm test -- --maxWorkers=2` | 978 aprobados, 2 omitidos, 0 fallos; 158 archivos, 30,56 s. |
| Operaciones, `npm run test:ops` | 19 aprobados, 0 fallos. |
| Barrido completo Playwright | 113 aprobados, 2 omitidos, 0 fallos; 3,7 min, un worker Chrome. |
| Repetición tras corregir omisiones de búsqueda | 10 aprobados, 0 omitidos, 0 fallos; 1,2 min. Incluye orden ascendente/descendente y paginación con 13 productos. |
| Nuevas páginas editoriales | Los 8 casos de guía, comparativa, índice y CSV aprobaron en escritorio y móvil dentro del barrido completo. |
| Build de producción local | Aprobado como preparación de Playwright. |
| Servidor `npm run testsprite:serve` | Inició; búsqueda y detalle fixture dieron 200; admin sin sesión dio 401. Se cerró al finalizar. |
| Servidor MCP TestSprite 0.0.46 | Cuenta conectada; 16 casos distintos ejecutados. Créditos: 150 iniciales, 140,5 finales. La comprobación previa sin clave fue una etapa inicial. |
| Launcher local | Falta de clave produce error explícito; prueba con proceso simulado comprobó path del proyecto y que no reenvía las claves Supabase/cron del entorno. |

Las cifras de las pasadas de navegador **no se suman**: la repetición vuelve a
ejecutar casos ya cubiertos. Tras eliminar un duplicado y corregir ordenamiento,
el inventario actual es de 114 casos; su evidencia combina el barrido completo y
la repetición focalizada. No se volvió a ejecutar el inventario completo después
de esos dos últimos cambios de tests.

Los dos unitarios omitidos son probes externos optativos de Jev y refresh real:
`src/lib/ai/jev-live-smoke.test.ts` y
`src/lib/catalog/on-demand/worker-live-smoke.test.ts`. No cuentan como aprobados.

## Hallazgos corregidos

- Búsqueda estable enlazaba productos fixture cuyo detalle consultaba la base
  real: los recorridos acababan en 404. Ahora el detalle en modo E2E resuelve el
  mismo catálogo sintético y mantiene 404 para IDs desconocidos. Dos unitarios
  verifican que ese modo no consulta la base.
- Las ofertas fixture tenían fecha fija de abril; ahora representan observaciones
  sintéticas al iniciar el servidor, compatibles con la ventana de tres horas.
  No representan disponibilidad comercial real.
- Se corrigieron selectores ambiguos de navegación y expectativas antiguas de
  rango de precios, especificaciones y regreso a categoría.
- Se reemplazaron salidas silenciosas por aserciones o estados explícitos. Los
  controles obligatorios fallan si faltan; no se ocultan como skips.
- El caso antiguo de paginación buscaba un botón `NEXT >>` y no tenía suficientes
  productos. Se retiró el duplicado: `e2e/search-pagination.spec.ts` verifica el
  recorrido con 13 productos y enlaces de página actuales.
- Ordenamiento no debe omitir la prueba si todavía está cargando. Ahora espera
  resultados y verifica sus nombres en orden ascendente y descendente.
- Detalle móvil comprueba contenido, enlace de tienda y ausencia de desbordamiento.

El primer Vitest completo, ejecutado junto al build/E2E, tuvo un timeout de 5 s en
`frontend-regressions.test.ts`. Sus 19 casos pasaron aislados y el Vitest completo
pasó después con dos workers. Se conserva el primer fallo; no se modificó lógica
de la página para ese timeout. El primer Playwright tuvo 98 aprobados y 9 fallos;
los recorridos afectados pasaron tras las correcciones.

## Búsqueda pública: falla intermitente abierta

Dominio: https://www.comparador-hardware.com.ar. Requests GET anónimos; estos
probes no solicitaron refresh ni operaciones administrativas.

| Ruta | HTTP | Latencia observada | Resultado |
| --- | --- | --- | --- |
| `/api/search?q=ryzen`, primera consulta | **503** | 3.634 ms | Error al buscar productos de manera global. |
| `/api/search?minPrice=100000&sortBy=price-asc` | 200 | 3.167 ms | 12 productos, 22.802 resultados. |
| `/api/search?q=rtx&sortBy=price-asc&page=2` | 200 | 3.639 ms | 12 productos, página 2, 1.788 resultados. |
| `/api/search?category=procesadores&sortBy=price-asc` | 200 | 999 ms | 12 productos, 2.945 resultados. |
| `/api/search?q=ryzen`, segunda consulta | 200 | 2.853 ms | 12 productos. |
| `/api/search?q=ryzen`, tercera consulta | 200 | 270 ms | 12 productos. |

Son cortes puntuales, no un benchmark. Una repetición exitosa no cierra el 503.
Pendiente prioritario: correlacionar errores Worker y RPC del catálogo con una
reproducción; verificar de nuevo queries/filtros/paginación después de corregir
la causa. La pasada local con fixtures no prueba esa ruta productiva.

## Cobertura y pendientes explícitos

| Área | Evidencia actual | Qué queda sin acreditar |
| --- | --- | --- |
| Home, categorías, legales, navegación | E2E local. | Render completo de la versión pública tras un despliegue. |
| Búsqueda/filtros/orden/paginación/errores | E2E con datos controlados y probes API públicos. | Resolver el 503 observado y verificar presupuestos de rendimiento. |
| Producto y frescura | E2E fixture, tests de ofertas/identidad/JSON-LD. | SKU, stock y precio en cada publicación comprable real. |
| Armador | Selección, compatibilidad, persistencia local, compartir, descarga y errores mockeados. | Persistencia y refresh de ofertas reales en entorno aislado. |
| Guías y comparativas | Índice → detalle en escritorio/móvil. | Revisión de cada presupuesto y siete ofertas reales elegibles; comparación interactiva de dos productos en E2E. |
| Índice y CSV | Página, descarga, headers y columnas. | Exactitud del agregado respecto de DB; un CSV vacío no acredita filas. |
| Auth y admin | Formulario, error simulado, redirecciones y GET admin no autorizado. | Login válido, OAuth/callback, logout, favoritos, alertas y admin autenticado con cuentas de prueba. |
| Privacidad/analítica | Páginas legales y lógica unitaria existente. | Recorrido E2E completo de consentimiento y activación de analytics. |
| TestSprite | Pasada de 16 casos y revisión de sus aserciones terminadas. | Dos pruebas automatizadas inconclusas; móvil bloqueado por el proveedor. Complementos de navegador guardados. |

## Evidencia y repetición

Evidencia local, ignorada por Git:
`testsprite_tests/local-validation/2026-09-30/` contiene logs del baseline,
unitarios, operaciones, `e2e.json`, `search-rerun.json`, `public-search.json` y
`server-smoke.json`. Los JSON de Playwright conservan resultados por caso.

Para repetir desde el inventario final:

```bash
npm run lint
npm run typecheck
npm test -- --maxWorkers=2
npm run test:ops
npm run test:e2e
```

La activación de TestSprite y el PRD se documentan en
[TESTSPRITE.md](./TESTSPRITE.md) y [TESTSPRITE-PRD.md](./TESTSPRITE-PRD.md).
Los cambios de esta sesión son locales; no se desplegaron.

## TestSprite: puesta en marcha y skills oficiales

Se verificó la cuenta Free (150 créditos iniciales), se habilitó el MCP local y se
cargó el PRD público. La clave queda en `.env.testsprite.local`, ignorada y con
permisos 600. No se subieron variables de entorno ni documentos privados.

Se consultaron `testsprite-onboard` y `testsprite-verify` de la CLI oficial 0.13.0.
La primera generación produjo 36 casos, con duplicados y aserciones genéricas.
Se revisaron los casos elegidos antes de ejecutar; generar casos no cuenta como
cobertura. Tres recorridos iniciales terminaron `PASSED` en el proveedor:

- TC002: búsqueda → ficha Ryzen 5600, identidad, precios de referencia y enlaces.
- TC003: búsqueda Ryzen, dos resultados y consulta preservada en URL.
- TC022: índice → guía de un millón, componentes y aviso de total observado.

El código exportado se inspeccionó para contrastar las aserciones, pero su
reproducción local aún no está acreditada: contiene selectores frágiles. Los
resultados en nube no prueban que los archivos Python se puedan repetir sin
correcciones. Las grabaciones se consultan en el dashboard autenticado.

La tanda ampliada incluye 13 casos. TC037 quedó bloqueado porque el entorno de
TestSprite no permite cambiar el viewport a 390 × 844. No se contó como aprobado.
La comprobación complementaria con navegador sí abrió/cerró el menú móvil, navegó
a procesadores desde la portada y buscó Ryzen: viewport 390 × 844, ancho de
documento 378, dos tarjetas y URL `/search?q=Ryzen&category=procesadores`.
Evidencia: `testsprite_tests/session-2026-09-30/mobile-browser.json` y `.jpg`.

La primera tanda se conserva en `testsprite_tests/session-2026-09-30/smoke/`.
Una ejecución de preparación interrumpida no se agrega a las cifras de aprobación.

### Diagnóstico de resultados de la tanda ampliada

El proveedor informó 9 `PASSED`, 3 `FAILED` y 1 `BLOCKED`. Antes de aceptar
las aprobaciones se inspeccionaron sus aserciones:

- TC012: el archivo exportado solo afirma que la URL exista. Esa aprobación es
  insuficiente para acreditar el filtro; se marca inconclusa hasta la repetición.
- TC008: el agente exigió vaciar la consulta y confundió una tarjeta de resultado
  con una selección. La comprobación directa de `CAMBIAR` en Producto B elimina
  la recomendación y presenta el mensaje de comparación incompleta. Se conserva
  la consulta; evidencia `comparison-change-browser.json`.
- TC026: el plan asumía autoguardado. El flujo real usa `Guardar armado` y
  `Recuperar guardado`. Se corrigió el plan, sin cambiar ese comportamiento.
- TC039: la extracción del agente no incluía el head. La respuesta local HTTP
  devuelve **404**, con dos metas robots que contienen **noindex** y UI not-found.
  Evidencia `not-found-http.json`. La repetición frontend verifica el estado visible;
  HTTP y metadata quedan acreditados por una comprobación complementaria.

Los resultados originales se conservan en `session-2026-09-30/expanded/`; no se
reescriben fallos históricos como aprobados.

### Cierre de la ejecución TestSprite

Se completaron 16 IDs distintos, con 20 resultados terminados contando
repeticiones. El proveedor informa 15 `PASSED` y 1 `BLOCKED` como últimos
estados. La revisión de aserciones acepta **13 casos con evidencia automatizada
útil**, mantiene **2 inconclusos** (TC012 filtro y TC026 recuperación) y
**1 bloqueado** (TC037 móvil). No se informa una aprobación total de la página.

TC012 repitió una exportación que solo comprueba URL no nula. TC026 comprueba que
el dropdown contenga una opción, sin exigir que sea el valor seleccionado. Sus
verdes no acreditan regresiones. Las comprobaciones reales complementarias sí
verificaron máximo 200000 → una tarjeta Ryzen 5600 de 185000 y, para recuperación,
el ID del procesador guardado, el aviso de recuperación y el total pendiente.

Las repeticiones de TC008 y TC039 quedaron aprobadas después de corregir el plan.
La metadata y el HTTP 404 se verificaron por separado. Móvil permanece bloqueado
en TestSprite y aprobado en la comprobación complementaria del navegador.

Cuenta Free: **150 créditos iniciales, 140,5 restantes** al cierre. No se compraron
créditos. El informe de casos, links y límites está en
[TESTSPRITE-RESULTADOS-2026-09-30.md](./TESTSPRITE-RESULTADOS-2026-09-30.md).

## Condiciones pendientes para cerrar la validación de la página

La cantidad de casos no equivale a cobertura de todas las funciones. La siguiente
matriz separa la primera pasada de lo necesario para cerrar la validación.

| Prioridad | Área | Evidencia necesaria para cerrar | Estado al revisar el informe |
| --- | --- | --- | --- |
| P0 | Búsqueda pública | Reproducir/correlacionar el 503, corregir una causa confirmada y comprobar nombre, categoría, tienda, rango, orden y páginas en la versión desplegada, con consultas frías y repetidas. | Corrección no acreditada; probes puntuales no prueban estabilidad. |
| P0 | Sesión y permisos | Login válido, logout, sesión vencida, favoritos/alertas persistentes y aislamiento entre dos usuarios de prueba. Un visitante o usuario normal no debe acceder a operaciones administrativas. | Flujos positivos e integración de permisos pendientes; formulario y GET admin anónimo ya tienen evidencia parcial. |
| P0 | Datos reales | Producto de resultados corresponde al detalle y a la variante de tienda; oferta vieja/sin stock no entra como precio actual; total de armado/guía respeta componentes y presupuesto. | Fixtures y reglas locales probados; integración con publicaciones comprables pendiente. |
| P1 | Regresiones de filtros y guardado | Aserciones repetibles sobre cantidad/identidad/orden de resultados y valor seleccionado recuperado, usando casos deterministas propios. | TestSprite exporta controles insuficientes; comprobar y reutilizar la cobertura Playwright existente antes de agregar duplicados. |
| P1 | Entorno desplegado y errores | Recorridos públicos en móvil/escritorio; errores de red, timeouts y recuperación; ausencia de errores JS/CSP que impidan operar. | Cobertura local existente; no acredita toda la versión desplegada. |
| P1 | Integraciones de contenido | CSV con filas consistentes, páginas y metadata, consentimiento de analítica y enlaces externos correctos. | Evidencia parcial de render, columnas y headers; exactitud e integración restantes pendientes. |
| P1 | Inventario final | Ejecutar completo el inventario Playwright final de 114 casos, conservando skips justificados y resultados del mismo estado del código. | La evidencia actual combina barrido anterior y repetición focalizada. |

No hace falta duplicar todos los casos en TestSprite ni agregar otra herramienta
para cada área. Vitest cubre reglas; Playwright aporta regresiones deterministas;
TestSprite ayuda con exploración y recorridos. Las comprobaciones reales de
sesión, datos y versión desplegada deben registrarse aparte. La validación no
se cierra con fallos críticos abiertos o con verdes sin aserciones útiles.
