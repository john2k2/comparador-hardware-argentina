# Entregar la búsqueda antes de registrar su demanda

La búsqueda esperable no debe esperar una escritura auxiliar de demanda del catálogo. La API ahora registra ese trabajo con `after`, conservado por Next mediante `waitUntil`. Si el lector se invoca sin contexto HTTP compatible, conserva la escritura esperada y vuelve a comprobar la vigencia del precio después de esperar. Una falla de demanda se registra sin datos sensibles y no invalida una página leída correctamente.

También registra demanda cuando una respuesta de caché tiene total cero. Es un vacío auténtico, sin inventar productos ni repetir la lectura SQL; mantiene la señal para que el runner investigue ese catálogo. Esa guardia es necesaria antes de permitir que SSR guarde páginas vacías. No inicia scraping adicional por un vacío ni cambia el rate limit.

No modifica `ProductPrice.lastUpdated`, stock, identidad, elegibilidad de tres horas ni la respuesta ante un fallo SQL. No transforma un precio antiguo en cotización actual. El trabajo auxiliar sigue consumiendo recursos del Worker y puede fallar; ya no prolonga por sí solo la respuesta del usuario en un contexto compatible.

## Verificación y límites

- `npx vitest run src/app/api/search/route.test.ts`: 32 pruebas aprobadas en el estado final de esta unidad. Incluyen contexto HTTP, fallback directo, pérdida de respuesta, sanitización, una sola señal y caché vacía.
- Laboratorio con un servidor Next de producción real y Supabase simulado en loopback: primera respuesta de `mouse` en 489 ms, repetición en 6 ms, mientras la escritura auxiliar tardó 2.401 ms; ambas se entregaron antes de finalizar esa escritura. La fecha original se conservó. La búsqueda sin cobertura respondió en 20 ms y también conservó su señal auxiliar.
- TypeScript y lint aprobados; compilación OpenNext y Wrangler `--dry-run` aprobados. El adapter instalado conserva el contexto de `waitUntil` requerido por `after`.

Es una prueba local con credenciales ficticias, no una medición pública ni una ejecución del Worker productivo. La búsqueda pública inicial de 6,1–6,9 segundos sigue siendo la línea base hasta publicar y repetir las mediciones.

Los detalles agregados del laboratorio están en `runtime.json` del cierre y la custodia local privada. Los avisos del navegador sobre secciones de home sin datos son del servidor de fixtures sin una base externa disponible; ese laboratorio no acredita ofertas reales.

## Reversión

La unidad incluye `src/lib/search/search-route-handler.ts`, su prueba `src/app/api/search/route.test.ts` y este documento. Revertirla vuelve a esperar demanda antes de responder. Si SSR continúa guardando vacíos, conservar la guardia de demanda para total cero: revertir ambos cambios de búsqueda juntos es la reversión completa independiente del scheduler y del archivo comprimido.

Fuente primaria de la decisión: [contrato de Next para after](https://nextjs.org/docs/app/api-reference/functions/after). La prueba del adapter corresponde a la versión instalada, no a una promesa de compatibilidad de todas las plataformas.
