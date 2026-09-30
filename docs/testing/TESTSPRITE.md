# TestSprite en Comparador Hardware

Estado al 30/09/2026: cuenta y API key verificadas; integración MCP habilitada
localmente. Cuenta Free con 150 créditos al iniciar y 140,5 restantes al cerrar la pasada. El paquete está fijado en `@testsprite/testsprite-mcp@0.0.46` para evitar
cambios inesperados. Node.js >= 22; la máquina ya cumple ese requisito.

## Activación

1. Crear una cuenta desde [TestSprite](https://www.testsprite.com/auth/cognito/sign-up).
2. Crear una API key en el [dashboard](https://www.testsprite.com/dashboard/settings/apikey).
3. Guardarla **localmente**, sin pegarla en el chat, en `.env.testsprite.local`:

   ```dotenv
   TESTSPRITE_API_KEY=tu_clave
   ```

   Este archivo está ignorado por Git. Restringir su acceso con
   `chmod 600 .env.testsprite.local`. El launcher nunca lee `.env.local` ni
   reenvía al MCP las claves de Supabase o cron.

4. En `.codex/config.toml`, habilitar el bloque `mcp_servers.testsprite` cambiando
   `enabled = false` a `enabled = true`. La configuración es local, también ignorada
   por Git. Abrir una nueva sesión de Codex para cargar las herramientas.
5. Iniciar la app con `npm run testsprite:serve`. Búsqueda y detalle usan fixtures;
   las páginas editoriales aún pueden leer datos públicos. El servidor desactiva
   scraping/refresh interno y de guías, y vacía credenciales administrativas.
   No ejecutarlo simultáneamente con Playwright: ambos usan el puerto 3100.

El launcher se puede comprobar con `npm run testsprite:mcp`; sin clave falla con
un mensaje explícito. No imprime credenciales. Con clave espera mensajes MCP;
esto por sí solo no ejecuta tests.

## Primera ejecución

- Consultar `testsprite_check_account_info` y verificar créditos antes de generar.
  No adquirir plan ni créditos automáticamente.
- Usar `testsprite_bootstrap` con `localPort: 3100`, `type: "frontend"`,
  `testScope: "codebase"` y el path absoluto del proyecto.
- En la configuración de TestSprite, cargar [TESTSPRITE-PRD.md](./TESTSPRITE-PRD.md).
- Generar resumen, PRD normalizado y plan frontend con `needLogin: false`.
- Revisar que el plan conserve las exclusiones del PRD antes de ejecutarlo.
  TestSprite ejecuta pruebas en su nube y conecta la app local mediante un túnel;
  no usar cuentas administrativas o datos personales en esa app.
- Ejecutar primero un subconjunto de navegación/búsqueda. Corregir fallos
  confirmados y repetir esos IDs antes de ampliar la pasada.
- Conservar resultados, capturas y grabaciones bajo `testsprite_tests/`, que está
  ignorado por Git; publicar solo un informe sanitizado con evidencia pertinente.

## Cobertura que requiere una segunda fase

La suite existente cubre búsqueda/errores, filtros, paginación, categorías,
armador, navegación, auth negativa, CSP y responsive. Varias pruebas usan mocks;
no prueban disponibilidad real, persistencia Supabase ni rendimiento Cloudflare.

La pasada Playwright agregó guías, comparativas editoriales e índice/CSV.
Quedan por verificar con casos explícitos y datos apropiados: comparación dinámica,
login válido y callback OAuth, logout, favoritos, alertas, consentimiento y admin autenticado. Los últimos requieren usuarios/entorno de prueba aislados.
Las pruebas de producto o búsqueda que carecen de datos deben reportar `skip`;
no contarlas como recorridos aprobados.

El informe de la pasada local y los probes públicos se guarda en
[VALIDACION-2026-09-30.md](./VALIDACION-2026-09-30.md).

## Fuentes oficiales consultadas

- [Instalación y API key](https://docs.testsprite.com/mcp/getting-started/installation)
- [Primera prueba y ejecución en nube](https://docs.testsprite.com/mcp/getting-started/first-test)
- [Herramientas MCP y créditos](https://docs.testsprite.com/mcp/core/tools)
- [Datos y credenciales](https://docs.testsprite.com/mcp/maintenance/security-compliance)
- [Control de consumo](https://docs.testsprite.com/mcp/maintenance/cost-performance)

## Skills oficiales

TestSprite publica dos skills con su CLI oficial `@testsprite/testsprite-cli@0.13.0`:

- `testsprite-onboard`: preparar una suite inicial, revisar recorridos concretos y
  ejecutar dos o tres pruebas de humo.
- `testsprite-verify`: elegir pruebas relacionadas con un cambio, revisar los pasos
  y evidencias del fallo, corregir un defecto confirmado y repetir la prueba.

Se verificaron desde la fuente oficial y se descargaron en una carpeta temporal
para guiar esta pasada. La integración de Codex aún figura como experimental en
la documentación; su instalador agrega una sección administrada a `AGENTS.md`.
No se modificó ese archivo ni se impuso una ejecución en nube en cada cambio futuro.
El pedido original utiliza MCP, por lo que se conserva esa vía para ejecutar.

Instalación ofrecida por el proveedor para Codex:

```bash
npx --yes @testsprite/testsprite-cli@0.13.0 agent install --target codex --dir .
```

Fuente: [Integración oficial con agentes](https://docs.testsprite.com/cli/core/agent-integration)
y [repositorio oficial de la CLI](https://github.com/TestSprite/testsprite-cli).

Resultados de la ejecución real: [TESTSPRITE-RESULTADOS-2026-09-30.md](./TESTSPRITE-RESULTADOS-2026-09-30.md).
