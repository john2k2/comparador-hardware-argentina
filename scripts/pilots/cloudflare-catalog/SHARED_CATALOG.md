# Lectura compartida del catálogo en la Mac

Separa dos operaciones: capturar publicaciones y renovar ofertas existentes. La captura privada de todas las familias no vuelve comprable una publicación ni corrige su asociación.

Preparar el ejecutable desde la raíz de la copia de trabajo:

```bash
npx esbuild scripts/pilots/cloudflare-catalog/shared-catalog-cli.ts --bundle --platform=node --format=esm --packages=external --outfile=outputs/base-completa-mac-2026-10-11/shared-catalog-cli.mjs
```

Ejecutar en procesos separados, sobre la copia certificada `catalog-all.sqlite`:

```bash
node outputs/base-completa-mac-2026-10-11/shared-catalog-cli.mjs --stage outputs/base-completa-mac-2026-10-11/catalog-all.sqlite
node outputs/base-completa-mac-2026-10-11/shared-catalog-cli.mjs --dry-run outputs/base-completa-mac-2026-10-11/catalog-all.sqlite
node outputs/base-completa-mac-2026-10-11/shared-catalog-cli.mjs --refresh outputs/base-completa-mac-2026-10-11/catalog-all.sqlite
```

`--stage` obtiene tres fuentes públicas y guarda publicaciones con hash y fecha real. No modifica `product_prices`. `--refresh` reclama hasta 25 ofertas seleccionadas **antes** de obtener otra captura. Admite CPU/GPU/RAM y SSD con prueba estricta; para SSD conserva el título normalizado completo, además de modelo, capacidad, interfaz y formato. Ofertas recientes, en backoff o con fuente alterada no se fuerzan. Cada invocación inicia otro proceso para no reutilizar una captura anterior al lease.

Un tercer argumento opcional guarda un recibo nuevo; se rechaza sobrescribirlo. El marcador y el recuento de ofertas deben coincidir con el snapshot. No acepta una URL de Supabase ni envía datos a D1.

Ensayo del 11/10/2026: 357/357 ofertas observadas, 15 lotes y 45 solicitudes HTTP; 1.708 publicaciones privadas en diez familias. Repetir la operación inmediatamente eligió cero ofertas y realizó cero lecturas de fuentes. Pruebas: seis casos de staging/selección, cuatro de consumo compartido y regresiones de cola.

Esta herramienta local no está programada para toda la base. El LaunchAgent existente sigue renovando y enviando **la muestra del piloto** con vencimiento y presupuesto. No confundir ambos alcances.

Reversión: detener consumidores, restaurar una copia SQLite anterior y retirar estas herramientas. No revertir fechas mediante actualizaciones SQL parciales. Detalle y recibos en `docs/direccion/PILOTO_ASOCIACIONES_2026-10-11.md`.

Tercera tanda del 11/10: 48 SSD de 26 publicaciones renovados en dos lotes y seis solicitudes; todas comparables. No acredita cobertura completa de almacenamiento. Corte y consumo en `docs/direccion/TERCERA_RECUPERACION_CATALOGO_2026-10-11.md`.

El selector conserva el contexto `specs` del producto. Para RAM con título incompleto admite únicamente la prueba fabricante existente, contrastando el SKU del producto con el SKU real de la captura y su referencia de publicación. Una contradicción de SKU o kit no entra en el lote. El lector vuelve a verificar la captura obtenida después del lease; seleccionar por una captura anterior no renueva la oferta.

Las pausas de tienda, los leases activos y el backoff se excluyen antes del límite de 25 candidatos. Así, 25 ofertas bloqueadas no ocultan otra oferta elegible situada después. Esta lectura no modifica la cola ni acorta sus vencimientos.

Ensayo privado del 12/10/2026, 04:41–04:46 UTC: sobre una copia nueva del catálogo completo se realizaron **412 intentos, 409 observaciones comparables y 60 solicitudes HTTP**, incluida la captura inicial. La captura contiene 1.695 publicaciones en diez familias; las observaciones admitidas abarcan CPU (255), GPU (102), SSD (48) y RAM (4). Tres intentos sin observación conservaron precio/stock/fecha y backoff; no se forzaron reintentos. La cifra no acredita renovación de las 73.827 ofertas del catálogo ni cumplimiento de G02. La copia sigue sin activación y requiere normalización/certificación antes del loader. Recibos privados: `outputs/produccion-preparacion-2026-10-12/QC/REFRESH/`.
