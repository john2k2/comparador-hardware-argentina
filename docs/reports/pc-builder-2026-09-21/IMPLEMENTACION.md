# Armador de PC y actualización de ofertas a pedido

Fecha local: 21 de septiembre de 2026. Implementación y verificación locales completas. Activación pública pendiente de migración, despliegue y configuración del consumidor de la cola.

## Qué puede hacer el usuario

En `/guia/armar` puede buscar y elegir CPU, motherboard, memoria, placa de video, almacenamiento, fuente, gabinete y refrigeración. Cada pieza permite elegir una oferta concreta de tienda. RAM y almacenamiento permiten de una a cuatro unidades o kits.

El presupuesto suma contado o el total de cuotas publicado, cantidades y envío ingresado por tienda. Nunca sustituye cuotas faltantes por el precio de contado. Si faltan piezas, una oferta deja de ser utilizable o faltan envíos, presenta un total parcial. El costo de armado, sistema operativo y periféricos queda explícitamente fuera.

Puede guardar un armado en el navegador, recuperarlo, compartir su selección mediante un enlace y descargar un presupuesto de texto. El enlace contiene selección, presupuesto objetivo, modalidad y envíos; los precios y las fechas se vuelven a consultar al abrirlo. El archivo descargado es una foto del presupuesto, con fechas y advertencias.

La sugerencia automática prioriza una combinación con CPU, GPU y fuente que entre en el presupuesto cuando los datos lo permiten. No promete llenar todas las piezas con cualquier monto: una combinación fuera del alcance del catálogo disponible queda incompleta y visible. El catálogo inicial es acotado, con búsqueda por modelo para ampliar cada selección.

## Comprobaciones de calidad

- Socket CPU/motherboard y generación DDR, con advertencias cuando faltan datos; una motherboard Intel sin DDR declarada no se supone DDR5.
- Módulos de RAM frente a ranuras declaradas, potencia de fuente de referencia, anclaje del cooler, formato del gabinete y medidas de GPU/disipador cuando están informadas.
- Una CPU que declara no incluir cooler requiere refrigeración. Si no se sabe si lo incluye, el presupuesto sigue parcial hasta elegir un cooler o contar con ese dato explícito. Una exclusión en la URL de la oferta elegida tiene precedencia sobre el título agrupado.
- BIOS, conectores, calidad de fuente, interfaz de almacenamiento y medidas no informadas quedan pendientes de confirmación. Los cálculos no certifican compatibilidad física ni inventan fichas técnicas.
- Se excluyen ofertas sin stock utilizable, pendientes de revisión de identidad, contradicciones explícitas de modelo, equipos completos, productos usados y ciertos productos mal clasificados (por ejemplo, CPU como cooler o SSD externo como unidad interna).
- Se muestran fechas originales. Una fecha ausente no se reemplaza por la fecha actual.

## Actualización a pedido

1. El navegador solicita revisar hasta ocho ofertas elegidas mediante `POST /api/catalog/refresh`.
2. El servidor comprueba origen, tamaño, formato y existencia exacta de las ofertas. La base guarda la solicitud y aplica deduplicación y límites compartidos entre procesos.
3. GitHub Actions consulta si existe trabajo pendiente. Instala dependencias y arranca el proceso de scraping sólo cuando hay trabajo; consume hasta dos presupuestos por ejecución.
4. El proceso consulta exclusivamente las tiendas seleccionadas. Para CPU/GPU busca por modelo, evitando exigir a una tienda el título comercial de otra. Acepta únicamente la URL exacta y una observación posterior al comienzo del trabajo.
5. Si está habilitado, Jev recibe el nombre del catálogo, el título recién extraído y el texto de la URL para revisar coherencia. Un conflicto explícito se conserva como pendiente de revisión. Jev no determina precios, stock ni compatibilidad.
6. La escritura comprueba el permiso temporal del trabajo y la fecha de la oferta. Una actualización anterior nunca pisa una observación más reciente. Sólo cambia la oferta pedida y agrega historial cuando cambian precio, precio original o stock.
7. El navegador consulta el estado y vuelve a leer sus precios cuando termina. Estados: en cola, ejecutando, completado, parcial o fallido. Una tienda sin respuesta conserva su fecha anterior. La UI nunca interpreta un resultado vacío como actualización exitosa.

El Worker público registra y lee solicitudes; el scraping corre en Node dentro de Actions. No se añadieron nuevos servicios de pago. Los ejecutores estándar de Actions son gratuitos para repositorios públicos; este repositorio era público al verificarlo. El calendario revisa la cola cada cinco minutos y GitHub puede demorar ejecuciones: esto es actualización solicitada con espera visible, sin garantía de tiempo real inmediato. Véanse [facturación de Actions](https://docs.github.com/en/actions/concepts/billing-and-usage) y [sintaxis de programación](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax). Jev consume su propia cuota si se habilita.

### Límites y acceso

- Tres trabajos nuevos por solicitante cada diez minutos; doce globales cada diez minutos y cien globales por día.
- Reutilización de trabajos equivalentes en curso y resultados terminados durante tres minutos.
- Máximo ocho ofertas por trabajo, consulta de tienda de aproximadamente 26 segundos por oferta, permiso de ejecución de diez minutos y vencimiento de cola a los treinta minutos.
- Una sola ejecución de Actions a la vez, compartiendo grupo de concurrencia con el refresh existente.
- RLS en la cola; sin lectura ni escritura directas para `anon` o `authenticated`. RPC exclusivas del servicio del servidor.
- Se guarda un hash con secreto de la IP, no la IP cruda, ni el presupuesto o información de la persona. Se eliminan registros de más de siete días cuando el consumidor vuelve a reclamar trabajo.
- El endpoint administrativo exige la autenticación existente y `CATALOG_REQUESTED_RUNNER=1`; esa variable permanece apagada en el Worker público.

## Evidencia ejecutada

| Validación | Resultado |
| --- | --- |
| Suite Vitest | 655 pruebas aprobadas; dos pruebas de red opt-in omitidas en la suite normal |
| Lint y TypeScript | Sin errores |
| Compilación Next y OpenNext/Cloudflare | Aprobadas; generado `.open-next/worker.js` |
| Playwright Chrome | Cuatro escenarios compuestos aprobados con APIs simuladas |
| Móvil | 390 px, ocho piezas seleccionadas, sin desborde horizontal |
| Migraciones | Aplicadas en PostgreSQL local descartable con tablas reales del proyecto |
| SQL | Permisos, cuotas, deduplicación, expiración, escritura con permiso vigente, conservación de fechas e historial: aprobados |
| Concurrencia real en PostgreSQL | Ocho pedidos simultáneos: un trabajo. Ocho consumidores simultáneos: un trabajo reclamado |
| Catálogo actual | Las ocho categorías respondieron HTTP 200 con 32 productos por consulta en la prueba de lectura; fallos transitorios se muestran como carga incompleta |
| Consulta real a tienda | Mexx: oferta exacta recuperada con precio y fecha nuevos; receptor de persistencia simulado, cero escrituras remotas |
| Barreras HTTP | Consumidor sin autorización: 401; solicitudes desactivadas: 503; identificadores inválidos: 400 |

La [prueba de fuente real](source-probe.json) registra una observación de Mexx para un Ryzen 5 5500 por ARS 158.569, realizada el 22 de septiembre a las 00:55 UTC (21 de septiembre local). Es evidencia histórica de extracción, no una cotización vigente ni garantía de inventario. Se reutilizan las reglas de lectura de stock de los scrapers existentes.

Las pruebas de navegador usan datos sintéticos. Cubren ocho piezas con respuestas concurrentes en orden invertido, dos tiendas, RAM por dos, envíos, cuotas ausentes, guardado/recuperación, enlaces sin precios, descarga con fecha, actualización completa/parcial y error 503. La prueba real consulta una sola tienda y no demuestra disponibilidad de todas.

## Activación pública

Procedimiento de activación ejecutado el 21/09/2026, hora de Santiago:

1. Aplicar en orden `20260922000000_offer_identity_review.sql` y `20260922010000_requested_offer_refresh.sql`. Son aditivas: no borran ni renumeran productos.
2. Publicar la aplicación y el workflow `.github/workflows/requested-offer-refresh.yml` en la rama principal. Verificar las dos variantes del dominio y `/guia/armar`.
3. Confirmar en Actions los secretos que ya usa el catálogo: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` y `CATALOG_REFRESH_CRON_SECRET`.
4. Habilitar la variable de repositorio `ENABLE_ON_DEMAND_REFRESH=1` para que corra el consumidor. Luego establecer la misma variable en el Worker. Mantener `CATALOG_REQUESTED_RUNNER=0` en el Worker; el workflow la activa sólo en su proceso Node.
5. Para usar la revisión Jev, configurar `TYPESAFE_API_KEY` como secreto de Actions y `ENABLE_JEV_OFFER_REVIEW=1` como variable del repositorio. La cola funciona sin Jev; las revisiones anteriores se conservan.
6. Pedir una actualización real de una oferta desde la web, observar el paso por la cola, la ejecución en Actions y la nueva fecha en la UI. Verificar que la oferta y su precio coinciden con la página de la tienda.

Activación realizada: las dos migraciones están aplicadas y registradas en Supabase, las variables del Worker y del consumidor están habilitadas, y la versión está publicada. La prueba solicitada desde el sitio público completó el trabajo `31f42186-5a1c-4ef2-bc25-9f21198c4be0` mediante [Actions 35678345201](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/35678345201): la oferta de Mexx pasó de $157.439 a $158.569 y la página de la tienda mostró ese mismo precio y stock. Jev devolvió confianza 0,62: la oferta queda pendiente de identidad y fuera del total, aunque el precio se haya actualizado. Ver el [cierre de mejoras](../competencia-hardgamers-2026-09-21/IMPLEMENTACION.md).

Para detener nuevas solicitudes, apagar `ENABLE_ON_DEMAND_REFRESH` en el Worker; para detener el consumidor, apagar la variable homónima del repositorio. El armador sigue pudiendo comparar los precios persistidos. No hace falta borrar tablas para revertir la activación.

## Reproducción local

```sh
npm test
npm run lint
npx tsc --noEmit
npx opennextjs-cloudflare build
npx playwright test e2e/pc-builder.spec.ts
```

El último comando usa el servidor de prueba configurado en Playwright. Para el probe de tienda real, levantar primero el sitio en `127.0.0.1:3108` y ejecutar `RUN_REQUESTED_LIVE_PROBE=1 npx vitest run src/lib/catalog/on-demand/worker-live-smoke.test.ts`. La escritura del probe permanece simulada.

El SQL de prueba está en `supabase/tests/requested_offer_refresh.sql`. Requiere una base descartable vacía con el esquema inicial, las migraciones de firmas/historial y las dos migraciones nuevas; rechaza bases con productos y exige `PGOPTIONS='-c app.pc_builder_test=1'`. Al terminar revierte sus fixtures.
