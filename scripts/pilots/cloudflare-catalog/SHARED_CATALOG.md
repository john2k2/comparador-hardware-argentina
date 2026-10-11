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

`--stage` obtiene tres fuentes públicas y guarda publicaciones con hash y fecha real. No modifica `product_prices`. `--refresh` reclama hasta 25 ofertas seleccionadas **antes** de obtener otra captura. Sólo admite CPU/GPU/RAM con prueba estricta. Ofertas recientes, en backoff o con fuente alterada no se fuerzan. Cada invocación inicia otro proceso para no reutilizar una captura anterior al lease.

Un tercer argumento opcional guarda un recibo nuevo; se rechaza sobrescribirlo. El marcador y el recuento de ofertas deben coincidir con el snapshot. No acepta una URL de Supabase ni envía datos a D1.

Ensayo del 11/10/2026: 357/357 ofertas observadas, 15 lotes y 45 solicitudes HTTP; 1.708 publicaciones privadas en diez familias. Repetir la operación inmediatamente eligió cero ofertas y realizó cero lecturas de fuentes. Pruebas: seis casos de staging/selección, cuatro de consumo compartido y regresiones de cola.

Esta herramienta local no está programada para toda la base. El LaunchAgent existente sigue renovando y enviando **la muestra del piloto** con vencimiento y presupuesto. No confundir ambos alcances.

Reversión: detener consumidores, restaurar una copia SQLite anterior y retirar estas herramientas. No revertir fechas mediante actualizaciones SQL parciales. Detalle y recibos en `docs/direccion/PILOTO_ASOCIACIONES_2026-10-11.md`.
