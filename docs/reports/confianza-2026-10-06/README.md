# Primera entrega: confianza en ofertas

**Estado: candidata local verificada, sin publicar.** Rama `codex/confianza-precios-identidad`, preparada desde `origin/main` `f899ced036eccc785915f0e6635a0fa4fc7920cc`. Se confirmó de nuevo esa referencia al finalizar las pruebas del 06/10/2026.

Se adaptaron las intenciones útiles de la rama de producto; no se importaron ramas ni archivos completos que sustituyeran reparaciones recientes. La copia principal y los otros worktrees conservaron sus cambios. Esta candidata usa el lector canónico vigente, caché v5, custom-worker.mjs y los controles actuales de identidad/variante y destino.

## Resultado para el usuario

- Una notebook abreviada como NB/Not no aparece como una GPU suelta en el comparador o el armador.
- Abrir la ficha desde el comparador conserva la publicación elegida. Volver recupera los IDs A/B y relee sus ofertas; no guarda precios antiguos en la selección.
- Destacado, lista y rango usan el mismo conjunto de ofertas recientes. Las referencias más bajas quedan visibles, separadas del mínimo reciente y con sus fechas originales.
- Al vencer la observación de 24 horas se retira el destacado o se elige otra oferta elegible. Esto no consulta tiendas, no rejuvenece fechas ni infiere agotamiento.
- Se conservan patrocinio, enlaces/reportes, consentimiento, lectores y Worker vigentes. Guías/armador mantienen tres horas y el armador conserva el máximo exacto elegido.

## Verificación de esta candidata

| Control | Resultado y límite |
|---|---|
| `npm run verify` | Lint y tipos aprobados; **1.631 unitarias aprobadas**, dos omitidas preexistentes; **20 controles operativos aprobados** |
| Regresiones focalizadas | **122 pruebas aprobadas**, ocho suites: 46 identidad/armador, 39 origen/recuperación, 37 presentación de ofertas |
| OpenNext | Compilación y bundle completos; ocho documentos públicos generados y verificados. Conserva el aviso existente sobre middleware Node experimental |
| Wrangler dry-run | Bundle aceptado localmente; terminó con `--dry-run: exiting now`. No subió código |
| Navegador integrado | **24/24 recorridos**, Chrome, un worker, cero retries/flaky/omitidos; comparación, ficha completa, vencimiento, errores, armador y CSP |
| Capturas refinadas | **6/6** recorridos focalizados repetidos después de cerrar el panel de privacidad para capturar desktop/móvil sin superposición |
| Wrangler local con catálogo real | CPU y GPU, paridad API/lista/destino del destacado, conservación de fechas, ida/vuelta de A/B y carga del armador. Cero excepciones de página |
| Revisión independiente | Revisó identidad, elegibilidad, recuperación cancelable y contratos conservados. El desfase de un intervalo de 30 s se corrigió con un timer al próximo vencimiento |

El primer intento de navegador dejó dos fallos de harness: esperaba `$100.000` en una UI que formatea `$ 100.000`. Se corrigió el matcher para aceptar el espacio de moneda conservando el importe exacto; el resultado integrado posterior fue 24/24. El primer probe real comprobó el destino antes de terminar una navegación cliente; se añadió la espera de URL, conservando la aserción del ID. Los logs originales y posteriores están en `tmp/confianza/`, ignorados por Git.

## Corte real del catálogo

`catalogo-real.json` registra el corte **06/10/2026 18:53:36 UTC** y las fechas originales de las ofertas. La CPU agrupada Ryzen 5 5600 mostró tres ofertas recientes elegibles y nueve referencias pendientes; su destacado coincidió con la primera oferta reciente. La GPU Gigabyte Aero RTX 4060 tenía una referencia anterior y ningún destacado reciente. Se recuperaron los IDs del Ryzen 5 5600 y Ryzen 7 5700X al regresar de la ficha.

Las cinco lecturas API del corte devolvieron 200. Son muestras de una candidata local con datos públicos reales; no son p95, Core Web Vitals, capacidad del plan gratuito ni una comprobación de compra en las tiendas. Se usaron claves públicas de lectura y flags que deshabilitan scraping, refresh interno, pedidos y scheduler; no se enviaron pedidos de comprobación, no se modificó la base ni cuentas externas.

El armador cargó en runtime real y sus seis escenarios de comportamiento aprobaron con catálogo sintético controlado. **No se certificó una PC comercial de siete piezas con este corte.** La cobertura agregada, G02 y `REFRESH_CLAIM_FAILED` siguen abiertos; esta entrega no los cierra.

## Unidades y reversión

| Unidad | Alcance |
|---|---|
| `01-identidad.md` · `c6d45e5` | Equipos NB/Not fuera de componentes; tests de identidad y armador, navegador con mala clasificación |
| `02-regreso.md` · `e848055` | Origen y publicación, filtros de búsqueda, recuperación cancelable por IDs y errores parciales |
| `03-precios.md` · `f6e4074` | Mínimo/orden/rango, referencias y vencimiento sin renovar observaciones |
| Evidencia y harness | Fixtures de detalle aisladas, configuración de la batería, harness local y este informe; se puede retirar sin alterar los controles de negocio |

Cada unidad se guarda como un commit local con su verificación y frontera de rollback. Las capturas y JSON derivados se cuentan como evidencia generada; el código, tests y documentación propios se cuentan completos para el presupuesto de revisión. La rama ampliada de fichas/benchmarks se conserva para otra entrega.

## Reproducir

Ejecutar `npm run verify`. Compilar con `npx opennextjs-cloudflare build`, sin modo estable E2E, con scraping/refresh deshabilitados y claves de escritura vacías. Luego ejecutar `npx playwright test --config=playwright.confianza.config.ts`; la configuración reutiliza el build y levanta únicamente su servidor de prueba.

Para el corte real, iniciar `npx wrangler dev --local --ip 127.0.0.1 --port 3143 --inspector-port 9243 --show-interactive-dev-session=false` con `.dev.vars` local de lectura y controles operativos deshabilitados. Ejecutar `OFFER_CONFIDENCE_REPORT_DIR=tmp/confianza-real node scripts/qa/verify-offer-confidence.mjs`. El harness sólo admite localhost; no hace clic hacia tiendas ni verifica una compra. Sus resultados pueden variar con las observaciones reales del catálogo.

## Evidencia visual

Capturas sintéticas de comportamiento: `precios-escritorio.png`, `precios-movil.png`, sus versiones de viewport y `comparador-regreso.png`. Capturas de catálogo real sobre Wrangler local: `cpu-real.png`, `gpu-real.png`, `comparador-real-regreso.png`. Las primeras prueban casos controlados; las segundas documentan el corte real indicado arriba.

Publicación y validación posterior en el dominio siguen siendo pasos separados. Antes de otra funcionalidad, investigar la llamada y causa reales de `REFRESH_CLAIM_FAILED` y medir recuperación útil del catálogo con los criterios existentes.
