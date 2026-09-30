# Validación ampliada — Comparador Hardware, 30/09/2026

Actualización posterior: los tres hallazgos tratados con Jonathan quedaron corregidos o ajustados a su criterio. Este informe conserva el corte previo; ver [correcciones y verificación posterior](CORRECCIONES-2026-09-30.md).
La cobertura se amplió por pedido de Jonathan. El estado de la web publicada
**no está aprobado para cerrar QA**: se reprodujeron errores de búsqueda,
un producto de refrigeración dentro de procesadores y un presupuesto cuyo precio
actual en la tienda supera el máximo. Las suites locales y la navegación pública
por sí solas no detectaban estos problemas de datos y operación.

## Alcance y resultados

| Área | Evidencia y resultado |
| --- | --- |
| Unitarios completos | 978 aprobados, 2 probes externos optativos omitidos, 0 fallos; 158 archivos, 12,10 s. |
| Operaciones | 19 aprobados, sin fallos ni omisiones. |
| Navegador local | 121 aprobados, 0 fallos, 0 omisiones y 0 reintentos; 70,40 s. Última pasada: `e2e-verified-final.json`. |
| Navegación publicada | 6 recorridos aprobados: búsqueda/detalle, guardar/recuperar armado y guía/índice, en escritorio y 390×844. |
| Categoría publicada | 2 fallos: la misma comprobación detecta un cooler entre procesadores en escritorio y móvil. Total de la suite pública: 6 aprobados y 2 fallos, sin omisiones ni reintentos. |
| Búsqueda pública | Matriz de 8 consultas repetidas 3 veces: 22 respuestas correctas y 2 errores 503 en las primeras consultas. Rango, orden, tienda, paginación y vacío comprobados sobre datos reales. La categoría declarada coincide, pero la revisión semántica descubrió el cooler. |
| Auditoría HTTP endurecida | Segunda pasada: 39 comprobaciones, 35 aprobadas y 4 fallos. Tres repeticiones del filtro de procesadores detectan refrigeración; el contraste de guía detecta techo excedido. Todas las búsquedas respondieron 200 en esta pasada, sin borrar los dos 503 iniciales. |
| Índice/CSV | 148 filas, 4 categorías, 37 fechas por categoría. Base 100, fórmula, fechas ordenadas y valores de la tabla visibles comprobados. Limitación estadística detallada abajo. |
| RLS en PostgreSQL local | 30 comprobaciones con dos usuarios y rol anónimo aprobadas. Lectura, edición, transferencia de propiedad, altas y bajas cruzadas bloqueadas; datos propios conservados y transacción revertida. |
| Configuración RLS publicada | Las tres tablas tienen RLS habilitado y políticas por `auth.uid() = user_id`. El trigger de Auth no está expuesto a `anon` ni `authenticated`. Lectura de metadatos; no se crearon usuarios productivos. |
| Migraciones y contratos DB | Las 35 migraciones se reprodujeron en una base local vacía UTF-8. Aprobaron las regresiones SQL de atomicidad, paginación y refresh solicitado, y la prueba de dos escritores concurrentes. |
| Sesión | Login, recuperación tras recarga, logout, confirmación pendiente, cookie HttpOnly/Secure/SameSite y token falso sin acceso admin comprobados. Transporte Supabase Auth simulado; no acredita Google OAuth ni entrega de email real. |
| Consentimiento | 4 casos de aceptación, rechazo, revocación y elección vencida/futura aprobados. Un solo script GA con nonce; anuncios denegados; cookies `_ga` eliminadas al revocar. Google se intercepta y no recibe eventos reales. |
| Administración pública | GET refresh responde 405 con Allow; POST sin credenciales responde 401; bypassDb sin permisos responde 403. No se ejecutó un refresh. |
| Lint, tipos y builds | Lint/tipos aprobados. Build Next y bundle OpenNext para Cloudflare aprobados. Compilar el bundle no acredita sus límites de CPU en producción. |
| TestSprite, pasada previa | 16 casos distintos: proveedor 15 aprobados y 1 bloqueado. Revisión acepta 13, mantiene 2 inconclusos y 1 bloqueado. Los complementos propios cierran filtros, restauración y móvil, sin reclasificar la evidencia débil del proveedor. No se consumieron créditos adicionales en esta ampliación. |

No se suman las pasadas repetidas como casos nuevos. Los dos unitarios omitidos
son `jev-live-smoke.test.ts` y `worker-live-smoke.test.ts`: requieren servicios
externos y/o refresh real. No equivalen a una comprobación exitosa.

## Hallazgos que mantienen QA abierto

### Búsqueda intermitente — prioridad alta

Entre 20:32 y 20:33 UTC, `/api/search?q=ryzen` devolvió 503 en 5.594 ms y
`/api/search?q=rtx&sortBy=price-asc&page=2` devolvió 503 en 3.524 ms.
Las repeticiones posteriores devolvieron 200. No existe una corrección de estos
fallos acreditada por este barrido.

La función publicada ya incluye la ordenación acotada por página. El rol público
`anon` tiene `statement_timeout=3s`. Una llamada directa a la RPC con `p_query=ryzen`
sin categoría devolvió `57014: canceling statement due to statement timeout`
en 3.242 ms; las seis llamadas acotadas a categoría respondieron en 638–1.558 ms.
Esto confirma un problema de presupuesto en la búsqueda global. No prueba por sí
solo la causa exacta del 503 de Ryzen, cuya API infiere categoría. Los logs muestreados
no entregaron la excepción correspondiente a esas dos solicitudes.

Cerrar exige correlacionar la excepción, corregir la causa y repetir consultas
frías y calientes. Una respuesta exitosa posterior no borra el fallo inicial.

### Refrigeración dentro de procesadores — prioridad alta

`/api/search?q=ryzen&category=procesadores&maxPrice=200000&sortBy=price-asc`
entrega primero **Cooler CPU ID-COOLING SE-224-XTS ARGB 220W TDP Negro**, a $34.628,
con ID `megasoft-181699-cooler-cpu-id-cooling-se-224-xts-argb-220w-tdp-negro-compatible-amd-ryzen-am4-am5-intel-lga1851-1700-1200-1151-1150-1155-1156-fan-120mm-pwm-4-pines-antivibracion-181699`.
El detalle también lo muestra. Un chequeo que sólo compare `category === procesadores`
aprueba incorrectamente porque ese dato ya está mal clasificado.

La fila publicada confirma `category=procesadores` y `catalog_component=true`.
La inferencia en `src/lib/catalog/hardware-categories.ts` evalúa “Ryzen” antes de
refrigeración y puede prevalecer sobre la categoría del scraper. Persistencia y
agrupado reutilizan esa decisión. `catalog_standalone` tampoco excluye este accesorio
cuando ya está mal categorizado. Corregir sólo la inferencia futura deja pendiente
la reparación de filas existentes y su admisión en la búsqueda SQL.

Se añadió una regresión pública que falla ante refrigeración presentada como CPU.
Cerrar exige corregir clasificación/selección y reparar los datos persistidos,
conservando procesadores vendidos con cooler incluido y sin contaminar variantes.

### Guía de $1 millón supera el techo al contrastar la tienda — prioridad alta

Corte directo de CompraGamer a las 20:45 UTC, sin escribir el catálogo:

| SKU | Componente | Precio especial ARS |
| --- | --- | ---: |
| 13359 | Ryzen 5 5500 + Wraith Stealth | 175.400 |
| 19298 | ASRock Arc A380 6 GB Challenger | 266.691 |
| 21515 | Mancer DDR4 16 GB 3200 CL19 | 191.850 |
| 17143 | ADATA SU650SS 512 GB | 120.650 |
| 10535 | ASRock B550M-HDV | 115.988 |
| 18257 | Antec CSK650DC AR 650 W | 74.252 |
| 18607 | Antec VX310 RGB | 60.360 |
| **Total** | **Máximo $1.000.000** | **1.005.191** |

Las siete publicaciones informaban stock y eran vendibles. La guía y el API
conservaban $159.450 para el procesador, observados a las 19:23:26 UTC, y mostraban
total $989.241. Las otras seis ofertas coincidían. La diferencia del CPU es
$15.950 y las mismas piezas exceden el máximo en $5.191. La observación anterior
estaba dentro de tres horas; esa ventana no garantiza que el precio siga igual.

Fuente: [catálogo público CompraGamer](https://static.compragamer.com/productos)
y las siete URLs conservadas en la evidencia. Se contrastó `precioEspecial`;
`precioLista` es distinto. Envío, armado, licencia y periféricos no están incluidos.
Cerrar exige observar nuevamente, seleccionar una alternativa compatible dentro
del techo o presentar la guía en preparación. No se modificaron precios ni se
publicó una nueva selección desde esta auditoría.

### Base histórica débil del índice — calidad de datos

Los cálculos del CSV y de la tabla coinciden, pero almacenamiento arranca el
25/08 con 2 productos y una mediana de $25.547.523. La observación del 30/09 incluye
594 productos y mediana $281.700, dando índice 1,10. No se debe interpretar como
una caída uniforme de precios de 98,9%: la composición/cobertura cambió mucho.
La metodología actual declara límites de muestra y sesgo de supervivencia.
Queda revisar la base y su representatividad; no se modificó arbitrariamente la fórmula.

## Integraciones que este entorno no puede acreditar

- No existe una rama de desarrollo Supabase y no hay Docker disponible. Se usó
  PostgreSQL local instalado, sin activar un servicio de pago.
- Google OAuth, confirmación/recuperación por correo y ciclo de tokens del servicio
  Auth real requieren un entorno de identidad aislado. Las pruebas de UI usan
  transporte controlado y están identificadas como tales.
- Favoritos y alertas tienen tablas y permisos, pero la pantalla de cuenta muestra
  “Próximo paso: favoritos y alertas de precio por usuario”. No hay botones/API de
  usuario implementados para acreditar un recorrido completo de esas funciones.
- No se hicieron envíos de contacto, emails, escrituras de catálogo productivo,
  pruebas destructivas ni carga masiva. La matriz pública es una muestra acotada
  de disponibilidad y comportamiento, no una prueba de capacidad máxima.

## Pruebas reproducibles y evidencia

Se endurecieron aserciones de productos, tiendas externas, búsqueda vacía y robots,
y se eliminaron las omisiones condicionales de los recorridos obligatorios.
Playwright ahora desactiva refresh/escrituras privilegiadas y usa un ID GA de prueba
para no depender de la configuración analítica personal. La suite crítica incorpora
sesión y consentimiento.

- `npm test -- --maxWorkers=2`: unitarios.
- `npm run test:ops`: operaciones.
- `npm run test:e2e`: 121 casos locales, build y un worker Chrome.
- `npm run test:e2e:public`: 8 comprobaciones sobre la web publicada; debe fallar
  mientras los coolers sigan en procesadores.
- `npm run test:public`: matriz HTTP y contraste de la guía contra la tienda;
  conserva resultados en JSON y sale con error ante fallos o techo excedido.
- `supabase/tests/user-data-isolation.sql`: base local desechable `catalog_auth_qa`,
  con bootstrap, esquema inicial y migración de usuarios. No ejecutar en remoto.

Evidencia local ignorada por Git: `testsprite_tests/full-validation/2026-09-30/`.
Incluye JSON/logs de cada pasada, contratos DB, respuestas públicas, contraste de
tienda/catálogo y ocho capturas de pantalla públicas. Las primeras pasadas fallidas
se preservan para distinguir correcciones de tests de fallos reales del sitio.

El primer chequeo de GET refresh asumía 401; se corrigió a su contrato real 405.
El mock de signup requería cubrir el parámetro `redirect_to`; se corrigió el matcher.
El enlace de tienda cambia su nombre accesible según viewport; la prueba estricta
se corrigió para verificar ambos enlaces y sus atributos reales. La primera base
local estaba en SQL_ASCII; las 35 migraciones se reejecutaron en UTF-8.

No se realizaron despliegues. La base de pruebas y los servidores temporales se
cerraron después de recoger los resultados.
