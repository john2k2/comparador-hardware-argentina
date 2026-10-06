# Escaneos y entrada de Workers · 05/10/2026

El candidato incorpora la protección de `b1c6a4f` del checkout principal en
la entrada real `custom-worker.mjs`. Esa entrada conserva el evento del
scheduler y los exports de OpenNext; no se reemplaza por otra entrada.

Los destinos inequívocos de escaneo reciben 404 de texto, sin caché y con
`noindex`. HEAD no devuelve cuerpo. Las rutas normales conservan el request,
el entorno, el contexto, las cookies y los errores de Next.

Se comprobaron 113 escenarios unitarios de la guarda y una prueba operativa
que empaqueta la entrada real y comprueba fetch, scheduled y exports. La
verificación final de la aplicación incluye 1.429 unitarias aprobadas
(dos omitidas preexistentes), 20 operativas, lint y TypeScript.

El build de OpenNext/Workers terminó correctamente. Los resultados de
TestSprite, navegador y lectura pública se registran por separado en el
informe del candidato. Un build aprobado no acredita por sí solo el runtime
público ni el estado del catálogo.

No se cambian precios, stock, identidad, fechas de observación, permisos de
base de datos, CSP, cron ni credenciales. La publicación de producción se
evalúa con las pruebas del candidato y su procedimiento de reversión.
