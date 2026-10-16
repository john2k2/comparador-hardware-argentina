# D02 — Error de catálogo del armador separado de selección vacía

Estado: **preparado, probado y revisado localmente; no publicado**. Dueño: coordinador. Fuente publicada leída el 16/10: `7079c612242c54dc4b7be50596fd07fa697a8cc5`. Rama propia `codex/builder-catalog-state-20261016`, sobre `4acea9a` (diagnóstico Mac anterior, todavía local). Esta unidad no incluye ese diagnóstico en una autorización de publicación.

## Defecto y criterio de cierre

La página pública `/guia/armar?pesos=3000000` devolvió timeout para seis categorías durante el recorrido del 16/10. El aviso global informa el fallo, pero cada tarjeta afectada dice «No hay ofertas aptas en esta selección». Esa afirmación confunde una lectura fallida con un resultado vacío. Un único reintento GET recuperó cuatro categorías; motherboard y GPU siguieron fallando. CPU y RAM elegidas y subtotal ARS 2.169.558 se conservaron. No se guardó un armado público ni se pulsó actualizar ofertas.

Resultado esperado: la tarjeta de una categoría fallida informa que no se pudo cargar su catálogo. Una respuesta válida vacía conserva el mensaje de selección sin ofertas. Las piezas elegidas, el subtotal, el reintento y la búsqueda mantienen su comportamiento. La reparación **no resuelve ni diagnostica la causa de los timeouts**.

Cierre local: reproducir el mensaje incorrecto con el componente anterior; comprobar fallo → reintento vacío → búsqueda con oferta, conservación de selección/subtotal y ancho real en escritorio/móvil, con revisión independiente. El cierre productivo queda pendiente de publicación autorizada y prueba acotada del recorrido publicado.

## Cambio

- `PcBuilder.tsx`: usa el estado existente `failedSlots` para elegir el mensaje de la tarjeta; no cambia consultas, tiempos, frescura, compatibilidad, identidad, presupuesto ni selección automática.
- `e2e/pc-builder.spec.ts`: añade aserciones al fallo/recuperación existente y un caso fallo → vacío sin pérdida de CPU/subtotal.
- `fixture-server.mjs`: monta el componente real con tres productos sintéticos, CSS compilado local y límites de red. Sólo escucha en `127.0.0.1:3046`, GET; sustituye Analytics, refresh y enlaces auxiliares. CSP bloquea conexiones externas y formularios. No representa datos reales ni el servidor Next completo.

## Pruebas del 16/10

Antes del cambio, el montaje del componente anterior mostraba el falso mensaje de ausencia ante GPU503 (`fixture-before.json/png`). Después:

- 68/68 pruebas focales de `client`, `model` y `persistence`; typecheck, ESLint focal, sintaxis del helper y diff aprobados.
- Chrome con estilos, escritorio 1440×900: seis comprobaciones aprobadas; GPU503 usa error, reintento consulta sólo GPU y conserva CPU/RAM/ARS150.000, vacío confirmado usa selección vacía, búsqueda recupera GPU y subtotal ARS450.000 sigue parcial.
- Chrome móvil: **innerWidth390, scrollWidth378**, mismo fallo → vacío → búsqueda. Guardar y recuperar únicamente el armado sintético del origen local restauró CPU/RAM/GPU y presupuesto ARS1.500.000; subtotal ARS450.000, todavía parcial. No se abrió WhatsApp ni ningún comercio desde el montaje.
- Primera aserción del total de escritorio comparó «Total parcial» con texto renderizado en mayúsculas y falló. Se corrigió sólo el comprobador a minúsculas; se conservan resultado inicial y final. No fue un cambio del producto.
- Primera captura móvil tenía scrollWidth568: el único elemento fuera de ancho era el JSON del contador de QA. `overflow-wrap:anywhere` corrige sólo ese contador; se conserva la captura anterior y la medición posterior.
- Los dos E2E se descubrieron con `--list`; **no se ejecutó la suite Playwright/Next**. La comprobación de comportamiento de esta unidad fue el montaje real con fixtures en Chrome. Ejecutar esos dos E2E sobre la fuente integrada antes de publicar.

Reproducción desde esta raíz, con dependencias y CSS compilado ya disponibles:

```sh
npx vitest run src/lib/pc-builder/client.test.ts src/lib/pc-builder/model.test.ts src/lib/pc-builder/persistence.test.ts
npm run typecheck
npx eslint src/components/pc-builder/PcBuilder.tsx e2e/pc-builder.spec.ts docs/reports/builder-catalog-state-2026-10-16/fixture-server.mjs
node --check docs/reports/builder-catalog-state-2026-10-16/fixture-server.mjs
node docs/reports/builder-catalog-state-2026-10-16/fixture-server.mjs
```

Abrir el origen local en pestaña propia: elegir CPU/RAM, comprobar GPU503, reintentar, buscar RTX4060, elegir GPU, guardar, cambiar presupuesto/quitar GPU y recuperar. No tocar enlaces externos. Detener sólo este helper al finalizar; hoy quedó detenido.

Revisión independiente: `mac_deadline_phase_review_15`, GPT-6.1 Sol/high, perfil del proyecto `comparador_reviewer`, sólo lectura. Sin hallazgos materiales; comprobó también siete controles en memoria del mock y el delta del contador. SHA256 revisados:

- Componente: `cf62d02ab9571a2d1a294d5b0c4e4ca041eb77151f6baa0fc7a9d7e8bcd9ea99`.
- E2E: `7687813616f1235d6b9d921c68e929c986b49266b2f0fa3898db22518d64ee25`.
- Helper: `e7e94639b54d3015ca9c88c8c9fbf4dac0794762465345dfa8c3b91e14a60918`.

## Reversión, evidencia y siguiente acción

Revertir únicamente el commit de esta unidad en la rama propia; no tocar producción, el diagnóstico Mac anterior ni copias ajenas. No se ha revertido nada. No hubo push, deploy, refresh, reinicio productivo o escritura remota.

Evidencia real y sintética separada en `/Users/johnortiz/Documents/Proyectos/comparador-hardware-argentina/docs/reports/crecimiento-2026-09-12/cortes/2026-10-16/`. `builder-before*` y `builder-after-retry*` son producción; `fixture-*` son el montaje sintético. El corte diario conserva fuentes, horas, guardas de analítica y límites.

Acción concreta pendiente: conciliar este commit de mensaje sobre la fuente vigente, ejecutar los dos E2E y publicar sólo con autorización interactiva. Mantener pendiente el timeout de motherboard/GPU y elegir después una única causa de cobertura GoldenTech/Dinobyte con recibos existentes; esta corrección semántica no recupera ofertas.
