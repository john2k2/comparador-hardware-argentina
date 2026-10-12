# Operar la búsqueda temporal desde la Mac

La Mac calcula las búsquedas sobre una copia completa del catálogo y Cloudflare entrega las respuestas HTTPS. La alternativa evita cargar toda la base en D1. El piloto privado funciona; la activación de rutas públicas sigue pendiente. Una Mac abierta, conectada y con Internet es una condición de servicio, no una garantía de disponibilidad.

## Estado y alcance

- Catálogo servido: 59.692 productos, 73.827 ofertas históricas, 34 tiendas. Estos totales no acreditan ofertas recientes.
- Actualizador instalado: cada 15 minutos, hasta 500 asociaciones verificadas de CompraGamer. Captura estructurada antes de seleccionar y revalida después de obtener las leases. FullH4rd permanece diferido; los lectores de otras tiendas todavía no forman un barrido automático completo.
- Último corte de cobertura comprobado el 12/10/2026 a las 20:23 UTC: 1.401 observaciones de CompraGamer dentro de 24 horas, 1.396 comparables. Son una parte del catálogo. La elegibilidad de las guías conserva tres horas y selección editorial independiente.
- Un tick sin ofertas elegibles para revisión no cambia sus fechas. En la ejecución de las 20:22 UTC capturó 1.700 publicaciones mediante tres peticiones, observó cero ofertas y promovió un corte certificado en 30,7 segundos. Promover un corte no equivale a renovar precios.
- Las lecturas y escrituras de esos ciclos son locales. No consumen filas D1. Las solicitudes a Workers y sus límites siguen existiendo.

## Servicios instalados

Raíz estable: `/Users/johnortiz/Library/Application Support/ComparadorHardware`. El servicio usa su propia copia del código, build y dependencias; no depende de un worktree abierto.

| Servicio de usuario | Función |
|---|---|
| `ar.com.comparador.mac-catalog` | Next y SQLite readonly, puerto loopback 8825, reinicio del proceso |
| `ar.com.comparador.mac-tunnel` | Cloudflare Tunnel estable, sólo rutas de catálogo permitidas |
| `ar.com.comparador.mac-catalog-refresh` | Tick cada 900 segundos, lock, certificación, promoción y ACK |
| `ar.com.comparador.mac-awake` | Evita suspensión del sistema mientras recibe corriente |

Los LaunchAgents arrancan al iniciar sesión. Un reinicio con FileVault exige desbloqueo e inicio de sesión del usuario. Se probó recuperación del proceso; no se probó reiniciar físicamente la Mac. Cerrar la tapa, apagarla o perder Internet puede interrumpir la búsqueda.

`runtime.json` apunta a `release`, `data` y archivos privados con permisos 600. Sólo se copiaron variables públicas de Supabase para los clientes existentes. Nunca copiar claves privilegiadas al navegador ni registrar tokens del túnel/transporte.

## Actualizar sin escribir la base abierta

El job toma `data/refresh.lock` con PID y nonce; copia el corte servido a un área propia, aplica observaciones válidas y regenera proyección, índice y certificados. Verifica conteos, integridad, hash y reloj antes de guardar un nuevo archivo readonly en `data/snapshots` y cambiar `data/current.json` mediante rename atómico. `previous.json` conserva el corte previo.

El servidor comprueba el candidato, drena las respuestas activas y cambia de proveedor. El job espera un ACK con generación y fingerprint exactos. Sin ACK informa `promoted-unconfirmed`, devuelve error y no poda snapshots. Los fallos de lectura nunca renuevan frescura ni demuestran agotamiento; stock desconocido no es comprable.

La retención sólo elimina derivados reconocidos con recibo propio, hash coincidente y ACK confirmado. Conserva current, previous, copias manuales, archivos desconocidos y recibos. Tiene límite local de almacenamiento de 8 GiB y reserva de 2 GiB; no equivale a una cuota de Cloudflare.

## Recuperación y cambios manuales

1. Revisar `logs/server.log`, `logs/refresh.log` y el recibo del tick en `data`; no difundir archivos privados.
2. Para rollback, detener nuevos ticks y tomar **el mismo lock `refresh.lock`** mediante `acquireJobLock` del módulo operativo. No crear un lock inventado ni borrar uno activo. Verificar el hash del archivo de `previous.json`, escribir un temporal y hacer rename a current.
3. Esperar el ACK de salud local protegido para la generación restaurada antes de liberar el lock. No modificar una SQLite que esté abierta. No podar archivos durante una recuperación manual.
4. Para actualizar el build, conservar la versión anterior, detener sólo `mac-catalog`, reemplazar el build completo y bundle juntos, arrancar y verificar salud/API/HTML. No interrumpir el túnel ni la actualización si no es necesario.

## Corte público propuesto

El proxy debe usar rutas **selectivas**, nunca `/*`. Búsqueda, fichas, categorías y comparación interactiva pasan por la Mac. Portada, auth, administración, guías, armador y `/_next/image` conservan el Worker público anterior. No publicar la ruta del catálogo del armador hasta comprobar el flujo de actualización que aún utiliza su backend anterior.

Los archivos `/_next/static/*` del build nuevo viven en `ASSETS`, separados de la Mac. Los hashes antiguos deben resolverse mediante un binding interno al Worker anterior, únicamente ante 404 de ASSETS. Una llamada ordinaria entre workers.dev de la misma zona no acredita ese fallback. Ningún asset reenvía cookies, autorización ni tokens.

La activación requiere configurar modo production, host público exacto, ASSETS y el binding de assets anteriores; quitar el token de acceso del piloto no sustituye esa validación. Configuración y recibos del piloto están en `outputs/produccion-preparacion-2026-10-12/mac-hybrid-proof` y no se versionan porque pueden incluir credenciales en trazas privadas.

Rollback público: restaurar exclusivamente las rutas cambiadas al Worker anterior y retirar las nuevas rutas más específicas; conservar su despliegue original y guardar la tabla de rutas anterior antes del corte. No hacer push a main como mecanismo de corte: Workers Builds desplegaría otros cambios no incluidos en esta prueba.

## Criterios para activar

- [x] Base abierta readonly, autenticación de transporte y candidatos inválidos rechazados.
- [x] Promoción, rollback de corte y recuperación del proceso comprobados en servicio real.
- [x] Tick automático con ACK y retención comprobados; precios fallidos no rejuvenecen.
- [x] Tests unitarios y operativos; build de producción y revisión independiente.
- [x] Piloto remoto: assets nuevos y antiguos disponibles mientras el servicio Mac está caído; API 503 y recuperación 200.
- [x] Interfaz híbrida en Chrome: portada → búsqueda Ryzen, consulta abreviada RAM → ficha → retorno, resultados RAM en escritorio/móvil y comparación 5600/5700X sin ganador de precio cuando falta stock elegible. Paginación 1→2 conservó Ryzen; ordenar por menor precio volvió a página 1 conservando la consulta. Filtros/páginas también comprobaron paridad por API.
- [x] Versión privada `f535e3bd-e320-4c93-ae8b-537815f2c532`: 16/16 consultas iguales a la Mac, mediana 293 ms y máximo 2.259 ms. 36 trazas con CPU de 0–1 ms y outcome ok; incluye comprobaciones de caída, no es una prueba de carga. El proxy no tiene D1. Rutas públicas de Workers consultadas: ninguna, el dominio usa Custom Domains del Worker anterior. Despliegue público anterior `5b77fc37-9fea-48df-aca5-e1c43956f0a6`, versión `4add74ae-b3f4-4165-8040-5f143505c977` al 100%, sin cambios.
- [ ] Activación pública autorizada y comprobada sobre el dominio real.

No declarar toda la aplicación migrada, toda la base fresca ni capacidad gratuita ilimitada. El siguiente trabajo de cobertura es sumar lectores por tienda con identidad exacta y presupuesto medido, sin ampliar automáticamente la elegibilidad editorial.

La consulta `ddr5 32 6000` reconoce capacidad y frecuencia dentro de contexto RAM. No inventa atributos de un producto ni junta kits: exigir `2 x 16` conserva esa restricción. Prueba remota con la base real confirmó KLEVV CL28 de CompraGamer.

Validación final local: 3.022 unitarios pasados y dos omitidos; 288 operativos pasados; 45 focales adicionales de proxy/matcher/motor pasados y dos opcionales omitidos. Build aislado, typecheck y lint correctos. Revisión independiente no encontró bloqueos materiales en el delta; no acredita el resto del proyecto.
