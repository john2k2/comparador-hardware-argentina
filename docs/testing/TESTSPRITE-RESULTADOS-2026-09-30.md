# TestSprite — Comparador Hardware, 30/09/2026

## 1️⃣ Document Metadata

- Entorno: local, frontend anónimo, puerto 3100; scraping/refresh y credenciales administrativas deshabilitados.
- Integración: MCP oficial 0.0.46; criterios de skills oficiales onboard/verify de CLI 0.13.0.
- Datos: búsqueda/detalle sintéticos; algunas páginas editoriales y armador leen catálogo público. No acredita disponibilidad real.
- Alcance seleccionado: 16 IDs distintos; las propuestas duplicadas no se usan como denominador de cobertura.
- La clave y los artefactos crudos quedan locales e ignorados por Git. Sin compras de créditos ni despliegues.
- Cuenta Free: 150 créditos iniciales; 140.5 restantes al cerrar.

## 2️⃣ Requirement Validation Summary

| Caso | Recorrido | Último estado del proveedor | Revisión |
| --- | --- | --- | --- |
| [TC002](https://www.testsprite.com/dashboard/mcp/tests/efdd61a4-9c57-5326-bf8c-54107df862ed/test/860bbf08-0d84-462f-b580-a8460ba65f89) | Buscar Ryzen 5 5600 y abrir su ficha con dos precios de referencia | PASSED | Aserciones del resultado inspeccionadas. |
| [TC003](https://www.testsprite.com/dashboard/mcp/tests/efdd61a4-9c57-5326-bf8c-54107df862ed/test/6691d0f4-c7ea-44ac-8f26-961dc2d93b11) | Buscar Ryzen desde portada y conservar la consulta en los resultados | PASSED | Aserciones del resultado inspeccionadas. |
| [TC008](https://www.testsprite.com/dashboard/mcp/tests/efdd61a4-9c57-5326-bf8c-54107df862ed/test/28429510-b17b-40b5-b4b1-159dcaa581ef) | Comparar Ryzen 5600 y 5700X según el uso | PASSED | CAMBIAR elimina selección y comparación; la consulta puede permanecer. Corroborado en navegador. |
| [TC012](https://www.testsprite.com/dashboard/mcp/tests/efdd61a4-9c57-5326-bf8c-54107df862ed/test/478f9e4c-f2ed-435d-bb22-2f9001199288) | Precio máximo excluye el procesador más caro | PASSED | INCONCLUSO como test automatizado: ambas exportaciones solo afirman que existe una URL. Navegador verifica máximo 200000, una tarjeta 5600, precio 185000 y exclusión de 5700X. |
| [TC014](https://www.testsprite.com/dashboard/mcp/tests/efdd61a4-9c57-5326-bf8c-54107df862ed/test/1f8d4c66-fb2f-4bd5-aabd-a7e12baf79c3) | Orden ascendente y descendente invierten los dos Ryzen | PASSED | Aserciones del resultado inspeccionadas. |
| [TC017](https://www.testsprite.com/dashboard/mcp/tests/efdd61a4-9c57-5326-bf8c-54107df862ed/test/3b4183c5-6493-4544-b0dd-8a7b2c9d2d23) | Búsqueda dentro de procesadores conserva categoría | PASSED | Aserciones del resultado inspeccionadas. |
| [TC019](https://www.testsprite.com/dashboard/mcp/tests/efdd61a4-9c57-5326-bf8c-54107df862ed/test/2ff77039-1adb-480e-9bbb-3fb8467e0cc7) | Ficha muestra ofertas recién observadas con estado visible | PASSED | Aserciones del resultado inspeccionadas. |
| [TC021](https://www.testsprite.com/dashboard/mcp/tests/efdd61a4-9c57-5326-bf8c-54107df862ed/test/13b58510-7a1e-4259-8bc0-51936aaaa23c) | Índice abre editorial RTX 4060 contra RX 7600 | PASSED | Aserciones del resultado inspeccionadas. |
| [TC022](https://www.testsprite.com/dashboard/mcp/tests/efdd61a4-9c57-5326-bf8c-54107df862ed/test/81810bf8-859e-431e-9068-c4410b539d27) | Abrir la guía de un millón desde su índice y revisar sus componentes | PASSED | Aserciones del resultado inspeccionadas. |
| [TC026](https://www.testsprite.com/dashboard/mcp/tests/efdd61a4-9c57-5326-bf8c-54107df862ed/test/383acbff-e905-4148-b960-7839fbebfb78) | Guardar y recuperar el procesador del armador después de recargar | PASSED | INCONCLUSO como test automatizado: presencia de opción no prueba selección. Flujo real corroborado en navegador con ID, aviso y total. |
| [TC027](https://www.testsprite.com/dashboard/mcp/tests/efdd61a4-9c57-5326-bf8c-54107df862ed/test/672ae619-dc0f-4bfe-b265-d252dd69a586) | Índice expone un enlace CSV funcional | PASSED | Aserciones del resultado inspeccionadas. |
| [TC029](https://www.testsprite.com/dashboard/mcp/tests/efdd61a4-9c57-5326-bf8c-54107df862ed/test/9bfba362-98ea-4408-a6a0-dc6e5f293723) | Footer conecta contacto, privacidad y términos | PASSED | Aserciones del resultado inspeccionadas. |
| [TC034](https://www.testsprite.com/dashboard/mcp/tests/efdd61a4-9c57-5326-bf8c-54107df862ed/test/82c0fefc-8d34-431d-aadf-f4e04920980c) | Acceso anónimo muestra formulario sin iniciar sesión | PASSED | Aserciones del resultado inspeccionadas. |
| [TC037](https://www.testsprite.com/dashboard/mcp/tests/efdd61a4-9c57-5326-bf8c-54107df862ed/test/b4b0e1ec-d6df-475a-86f2-83c3d8eaca56) | Menú y búsqueda funcionan en móvil sin desbordamiento | BLOCKED | BLOCKED: el proveedor no ajusta viewport. Menú, navegación, búsqueda y geometría verificados aparte a 390 × 844. |
| [TC038](https://www.testsprite.com/dashboard/mcp/tests/efdd61a4-9c57-5326-bf8c-54107df862ed/test/003a8230-378c-409c-a2e4-80f48deb3f1d) | Búsqueda inexistente muestra un vacío explícito | PASSED | Aserciones del resultado inspeccionadas. |
| [TC039](https://www.testsprite.com/dashboard/mcp/tests/efdd61a4-9c57-5326-bf8c-54107df862ed/test/073c5f72-ce17-444f-94db-f8122bec5767) | Producto inexistente muestra una página no encontrada | PASSED | UI 404 en TestSprite; HTTP 404 y robots noindex verificados por petición complementaria. |

## 3️⃣ Coverage & Matching Metrics

- Estados finales del proveedor en 16 IDs: 15 PASSED, 0 FAILED, 1 BLOCKED.
- Revisión de la evidencia automatizada: 13 casos con aserciones útiles, 2 inconclusos (TC012 y TC026) y 1 bloqueado (TC037). Los tres tienen comprobaciones complementarias en navegador; no se reclasifican sus limitaciones como cobertura automatizada.
- Resultados terminados conservados: 20. No sumar repeticiones como nueva cobertura.
- Primera tanda: 3 PASSED. Tanda ampliada original: 9 PASSED, 3 FAILED, 1 BLOCKED.
- Tres fallos de plan/interpretación se revisaron y repitieron una vez. TC012 también se repitió por falta de aserciones útiles.
- No se calcula cobertura total del sitio a partir de las propuestas generadas. Móvil y metadata tienen evidencia complementaria.

## 4️⃣ Key Gaps / Risks

- Búsqueda pública Ryzen devolvió un 503 intermitente en los probes anteriores; sigue abierto. Estas ejecuciones locales no cierran rendimiento ni estabilidad Cloudflare.
- Login válido, OAuth, logout, favoritos, alertas y admin autenticado requieren una cuenta y entorno aislados; no ejecutados.
- Precios, stock, identidad y siete ofertas elegibles de guías deben contrastarse en tiendas; fixtures no acreditan compra.
- El agente TestSprite no pudo cambiar viewport ni extraer metadata del head. Se preservan esos límites y las pruebas complementarias.
- Python exportado: selectores y estados frágiles; su repetición local no está acreditada. TC012 solo exige URL no nula, incluso tras repetirlo. TC026 usa presencia de opción en vez de valor seleccionado. Ambos quedan inconclusos como pruebas automatizadas; sus flujos reales se verificaron en el navegador.
- En modo estable, home puede listar productos reales que el detalle sintético no resuelve. No atribuir ese límite del entorno de fixtures a la versión pública.
- Se conservó una ejecución de preparación interrumpida fuera del conteo de aprobaciones; no tiene informe terminal utilizable.

Evidencia local: `testsprite_tests/session-2026-09-30/{smoke,expanded,recheck,filter-recheck}/`, `mobile-browser.json`, `not-found-http.json`, `comparison-change-browser.json`, `builder-restore-browser.json`, `filter-browser.json`.

Fuentes: [skills e integración oficial](https://docs.testsprite.com/cli/core/agent-integration), [CLI oficial](https://github.com/TestSprite/testsprite-cli), [MCP](https://docs.testsprite.com/mcp/getting-started/).
