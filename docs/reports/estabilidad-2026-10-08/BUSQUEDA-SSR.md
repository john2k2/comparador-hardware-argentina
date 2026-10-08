# Compartir la lectura inicial de resultados

La página de búsqueda SSR ahora reutiliza la misma caché pública validada de la API, con la misma clave normalizada y el mismo TTL de tres minutos. Las solicitudes iguales simultáneas comparten una lectura pendiente dentro de un proceso. No se agregó un proveedor ni otra cuota.

Cada consumidor comprueba después de esperar que el mínimo mostrado siga siendo elegible. Si vence, relee la página una sola vez; no filtra productos después de paginar ni inventa un total. Un fallo SQL llega al estado de error y no se guarda como éxito vacío. La falla de la caché opcional conserva el acceso a la base. El modo de fixtures sigue siendo explícito.

Las páginas realmente vacías también pueden guardarse. Por eso esta unidad depende de la guardia de demanda para total cero de [la API](BUSQUEDA-API.md), aplicada primero. No cambia el precio histórico, la fecha de observación de cada oferta, la identidad, el stock ni la ventana de frescura.

## Verificación y límites

- Regresiones focales para claves equivalentes, filtros, orden, página, mínimo vencido mientras se espera, opt-in de no disponibles, error SQL y falla de caché aprobadas. La verificación general registra los conteos finales en el cierre.
- Servidor Next de producción real con Supabase simulado en loopback: 20 solicitudes HTTP SSR simultáneas devolvieron 200 y compartieron una sola RPC. El HTML incluyó el producto de laboratorio. No hubo llamadas a servicios remotos.
- TypeScript, lint, build OpenNext y ensayo Wrangler `--dry-run` aprobados. Treinta recorridos Chrome de búsqueda, filtros, paginación, armador, hidratación y errores pasaron con fixtures explícitas.

Esto acredita la reducción de lecturas repetidas en el laboratorio. Una búsqueda distinta o una caché vacía sigue necesitando SQL, y agrega la lectura de caché. La coalescencia no une distintos procesos o isolates ni unifica las lecturas pendientes SSR y API. No se demuestra todavía que el primer resultado público de 6–7 segundos quede resuelto.

El resultado público se debe verificar después de publicar, en búsquedas nuevas y repetidas, escritorio y móvil, y cerca del vencimiento real de una oferta. La RPC y sus máximos acumulados siguen siendo un frente abierto; no se cambió SQL ni se añadieron índices para disimularlo.

## Reversión

Esta unidad comprende `src/lib/search/read-initial-search-page.ts`, su prueba y este documento. Revertirla vuelve a una lectura inicial por solicitud SSR; la API puede conservar la entrega previa a demanda y la guardia de vacío sin depender de esta caché.

Fuente primaria de la decisión: [caché y memoización en Next](https://nextjs.org/docs/app/guides/caching-without-cache-components). La caché aplicada es la existente del proyecto; no se supone que una RPC POST de Supabase se deduplica automáticamente por utilizar Next.
