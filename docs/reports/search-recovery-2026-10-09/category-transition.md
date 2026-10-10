# Categoría automática al cambiar de producto

Estado: candidata local, revisada; publicación pendiente.

La prueba real descubrió que, después de buscar RTX 5090, una búsqueda de Ryzen 7600 mantenía automáticamente el filtro de tarjetas gráficas. El catálogo sí tenía dos procesadores elegibles, pero el filtro anterior los ocultaba.

Ahora el estado distingue una categoría inferida de una elegida explícitamente. Una consulta nueva vuelve a inferir sólo la automática. La URL omite esa inferencia para conservar el origen al recargar o volver atrás; la clave de datos conserva la categoría efectiva. La API usa el mismo clasificador. Categorías manuales, tiendas, rango y orden se mantienen, con vuelta a página uno.

Las URL antiguas que contienen `category=` se consideran explícitas; su origen automático anterior no es recuperable y no se ignora un filtro potencialmente elegido por el usuario.

## Verificación

- Antes: caso real `/search?q=ryzen+7600&category=tarjetas-graficas`, cero tarjetas; reproducción automatizada contra build anterior falla porque no aparece Ryzen 7600.
- Después: E2E GPU → CPU → RAM → SSD → atrás aprobada; cada paso valida producto y categoría visibles. Pruebas unitarias cubren inferencia, consulta desconocida, categoría explícita, URL/restauración y equivalencia de clave API.
- Matriz integrada de búsqueda: 19/19 E2E, 177/177 unitarias, lint focal y build de producción aprobados. Revisión independiente sin hallazgos materiales.
- Prueba real en Chrome: RTX 5090 → Ryzen 7600 cambia a procesadores y muestra dos fichas vigentes. Se probaron además RTX 5080, 5070, 9800X3D, NV3 y DDR5. Buscar `9800x3d` sin familia trae también PCs; `ryzen 9800x3d` infiere procesadores y devuelve dos. No se afirma que ocho coincidencias amplias sean ocho procesadores.

Comando E2E: `npx playwright test --config=tmp/playwright-search-recovery.config.ts e2e/search-category-transition.spec.ts`.

Reversión: revertir sólo los cambios en `search-state.ts`, `SearchPageClient.tsx`, la regresión de estado, `search-category-transition.spec.ts` y este documento. No exige cambiar DB ni scrapers y puede revertirse sin retirar el acceso a referencias.

## Ajuste de regresión durante la publicación autorizada

Jonathan autorizó publicar con «si hacelo». `f6b0164` fue publicado por Workers Builds como Worker 209; las siete consultas reales y 41 controles HTTP pasaron. El primer Verify (`38008845558`) encontró una expectativa anterior en `frontend-regressions.test.ts`: el caso de entrada a landing montaba `q=ryzen` sin categoría explícita y esperaba conservar procesadores al borrar el texto. Esa fixture ya no representaba una categoría manual.

Se conserva la prueba de landing con categoría explícita, el destino exacto `/search?category=procesadores`, una sola navegación Next y cero peticiones API competidoras. Un caso nuevo exige que borrar el texto con categoría deducida vuelva a `/search`, vacíe resultados y conserve canonical genérico/noindex, sin navegación Next ni petición API. El código de aplicación no cambió en este ajuste.

Validación focal: 30/30 pruebas de estado e interacción, lint y revisión independiente del diff aprobados. Verify completo se vuelve a ejecutar sobre el commit del ajuste; su resultado final se registra con la evidencia de publicación, sin presentar el primer ciclo fallido como aprobado.
