# D02 — Integración local del formato de kit de RAM, 12/10/2026

El parche preparado el 11/10 está integrado sobre una copia del main vigente y probado en la aplicación. **Estado: integrado, revisado y probado localmente; sin publicación ni reemplazo editorial.** Dueño: coordinador Codex. Revisión independiente: `ramkit_integration_review`, GPT-6.1 Sol/high, sólo lectura. D02/G02 y la RAM de la guía de tres millones continúan abiertos.

## Fuente, alcance y preservación

Base leída en GitHub: `d1081e196f2818a96f5b6d01794ebc1e385b859a`. Sus dos consumidores conservaban exactamente los blobs del parche preparado: prefiltro `bdb1285f0eecfa02aa5986b33b03faa4880e4e14` y precios de guía `a4c9bd0f291b410f30baa114d6a64c73e0564477`. Main remoto no certifica por sí mismo la versión servida por Cloudflare.

Se comprobó rama, HEAD, remoto, diff y escritores antes de cambiar la copia autorizada `/Users/johnortiz/.codex/worktrees/comparador-confianza/comparador-hardware-argentina`. La rama anterior `codex/capacidad-costo-cero`, HEAD `0237cb8e111229addab63c04ac6b41de2d5c48f7`, conserva su trabajo y sus antecedentes. La integración vive en `codex/ram-kit-integration-20261012`, creada desde la base vigente. La principal mezclada no se reseteó, limpió ni actualizó mediante pull.

Cuatro archivos propios de aplicación:

- `src/lib/catalog/guide-ram-kit.ts`: lectura de composición y normalización de espacios.
- `src/lib/persistence/product-read-helpers.ts`: prefiltro del kit con espacios equivalentes y rechazo de una especificación ambigua.
- `src/lib/seo/budget-guide-pricing.ts`: comparación del kit y contradicciones de URL/títulos de origen, incluida la ruta decodificada.
- `src/lib/seo/guide-ram-kit-contract.test.ts`: 35 casos del contrato.

Los cuatro SHA256 coinciden con la R3 revisada el 11/10. [Evidencia y hashes](EVIDENCIA.json). El bundle histórico se conserva sin reinterpretar su estado antiguo; su [nota de ubicación](../2026-10-11-ram-kit/UBICACION-2026-10-12.md) explica dónde quedó la fixture.

## Defecto, comportamiento y cierre local

La fuente intacta distinguía `2x16GB`, `2 x16GB` y `2 x 16 GB`. Podía descartar un kit equivalente o omitir la composición al leer una especificación espaciada. El slug equivalente `2-x-16gb` también podía ser rechazado. La publicación Golden Tech 188718 aporta el ejemplo real que motivó la reproducción; su precio o identidad no se renuevan por ejecutar fixtures.

La corrección admite esas tres escrituras para la misma composición. Conserva cantidad de módulos, capacidad por módulo y total, DDR, velocidad, CL, modelo, color, RGB y formato. Una composición contradictoria, incluso en el título observado o con separadores URI codificados, no permite comparar la oferta. Siguen activos stock, identidad y ventanas de frescura. No se modificaron el validador central, el umbral 0,8, las asociaciones, MPN, catálogo, selección editorial ni fechas.

Se volvió a ejecutar la misma matriz de 35 casos contra los **consumidores intactos de d108**: **17 fallos y 18 aprobadas**. Contra la integración real: **35/35 aprobadas**. El helper puro nuevo está disponible en el arnés de la baseline para aislar los dos consumidores que ya existían; no se atribuye ese helper a main. [Baseline](logs/ram-kit-baseline-d108.log), [integración](logs/ram-kit-after-d108.log), [configuración del contraste](vitest.ram-before.config.mts).

Comprobaciones proporcionales:

- **133/133** en cinco archivos focales, con dependencias del lock: Next **16.3.8**, TypeScript **5.9.3** y Vitest **4.1.11**. ESLint de los cuatro archivos: exit 0.
- TypeScript con configuración normal: exit 0. Build Next con entorno E2E aislado: exit 0. No se ejecutó otra suite amplia ni se llama a esto una mejora de CPU o latencia.
- Revisor independiente: **16 comprobaciones de consumidores y 3 de prefiltro**, sin hallazgos materiales abiertos ni escritura de archivos, DB o navegador. [Revisión](REVISION.md).
- PostgreSQL: **6/6 fixtures literales** del operador `~*` utilizado por `imatch`: tres variantes positivas y tres composiciones distintas negativas. Sin consulta de ofertas ni modificación de tablas. Es una comprobación del filtro, no un replay SQL completo. [Consulta y resultado](postgres-prefilter-fixtures.json).
- Navegador local con estilos: **3/3**. Guardado/recuperación del borrador con IDs, comparación A/B al visitar una ficha y regresar, y ancho móvil real de **390 px** sin desborde. Escritorio **1280 px**. Datos de fixtures y todas las solicitudes externas o no GET/HEAD bloqueadas por el arnés. [Logs](logs/ramkit-browser-run-final-captures.log), [regreso A/B](logs/ramkit-browser-run-comparison-final.log), [arnés](ramkit-browser.test.ts), [configuración](playwright.ram-kit.config.ts).

La primera envoltura ESM falló antes de ejecutar tests. Después, dos aserciones de consentimiento agotaron el tiempo porque la compilación QA no tenía el identificador GA ficticio documentado. Se corrigió el arnés y se recompiló con ese entorno, sin cambiar la aplicación ni debilitar aserciones. El primer TypeScript también encontró 30 errores de una fixture offline antigua en `tmp`: sus **120 archivos** se preservaron byte por byte fuera del glob de Next; después pasó la configuración normal. Package, lock y tsconfig versionados permanecen intactos. Los logs de esos intentos se conservan.

El recorrido público del 12/10 **no está comprobado**: Chrome bloqueó la carga antes de la aplicación. Las respuestas HTTP 200 y estos tests de fixtures no sustituyen escritorio/móvil público. El reporte diario conserva la captura y separa esta limitación de una caída productiva.

## Reproducción, reversión y pendiente

Desde esta rama:

```sh
npx vitest run src/lib/seo/guide-ram-kit-contract.test.ts
npx eslint src/lib/catalog/guide-ram-kit.ts src/lib/persistence/product-read-helpers.ts src/lib/seo/budget-guide-pricing.ts src/lib/seo/guide-ram-kit-contract.test.ts
npm run typecheck
```

Para el contraste de baseline, extraer con `git show d1081e1:<ruta>` los dos consumidores a la carpeta declarada en la configuración y ejecutar `npx vitest run --config <configuración-baseline>`. Debe fallar 17 de los mismos 35 casos. La copia de esta configuración y los logs permiten reconstruir el arnés; sus paths son del entorno de esta revisión.

Criterio de cierre **local** cumplido: aplicación exacta sobre la base vigente, mismo universo antes/después, guardas conservadas, revisión independiente y verificaciones de aplicación. El defecto **público** sigue pendiente de una publicación expresamente autorizada y comprobación del siguiente ciclo natural/runtime. Reversión: revertir sólo el commit de esta unidad; no revertir migraciones, capacidad ni reparaciones ajenas.

La guía 3M mostró **6/7**, subtotal **ARS 2.006.154** a las 14:35 UTC aproximadamente. Patriot `PVV532G600C36K`, destino CG17061, no tiene observación nueva válida en ese corte. La candidata Corsair 188718 conserva SKU de tienda `EL_CORM5VR2X1660`, no MPN de fabricante; su observación del 12/10 a las 10:18:20.785 UTC ya estaba vencida al control. MPN/QVL/EXPO y siete ofertas elegibles simultáneas siguen pendientes. No se adoptó esa RAM ni se extendió la revisión editorial.

Siguiente acción concreta: conseguir evidencia del MPN exacto de la RAM candidata o recuperar una publicación válida del Patriot seleccionado, y preparar la propuesta editorial completa con siete ofertas recientes, compatibilidad y costos adicionales separados. Esta integración no autoriza publicar, despachar refresh o sustituir modelos.
