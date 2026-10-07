# Estudio y optimización del Comparador — 07/10/2026

**Código publicado y comprobado.** Fuente `614caa1d30ce5381f064cda406a1e96a015f52af`, con cinco nuevas unidades revisadas sobre `a149fc2`. Worker `b9a4905d` al 100%, Workers Builds y CI aprobados, 32 comprobaciones públicas y confianza real escritorio/móvil aprobadas. [Recibo y límites de publicación](publicacion/README.md). La publicación previa `527cd6b` contiene las seis reparaciones operativas iniciales; sus recibos conservan su corte histórico.

- Búsqueda: relectura cuando vence el mínimo de la página cacheada, sin filtrar después de paginar ni inventar totales.
- Lecturas simultáneas: una promesa pendiente para parámetros equivalentes dentro del mismo proceso; límite de 200 claves, sin caché de resultados ni unión de permisos, demanda o telemetría.
- Armador: el reloj de cotización invalida ofertas vencidas y se actualiza al volver a la ventana, sin renovar timestamps ni hacer solicitudes adicionales.
- Comparación: separa carga, vacío y error, permite reintentar sin perder la otra selección y rechaza filas malformadas antes del render.

Lint y tipos aprobados; **1.985 unitarias y 41 operativas** aprobadas; dos omisiones preexistentes. **13 recorridos integrados** con estilos de la aplicación en escritorio/390 px aprobados; build OpenNext aprobado. El primer control global detectó cuatro fixtures antiguas incompletas: se corrigieron dos definiciones de datos, conservando sus aserciones y límites de tiempo. El cierre del navegador demoró y terminó naturalmente; su causa permanece sin determinar.

[Plan público de dirección](PLAN-DE-DIRECCION.md), [consultas y actualizaciones](consultas-actualizaciones.md), [componentes y producto](componentes-producto.md), [verificación exacta](evidencia/verificacion.json), [capacidad de lectura](evidencia/capacidad.json), [revisión F1](revision-f1.md), [revisión F2](revision-f2.md), [revisión de producto](revision-producto.md).

Los agregados de la cuenta GA4 y su informe completo se conservan en la copia local de dirección; no se incluyen en este repositorio público. Las pruebas usan fixtures donde se indica y no acreditan una PC comercial. La reducción de lecturas N→1 del caso controlado no acredita latencia/CPU productivas ni deduplicación entre isolates. Capacidad, G02/95% y retorno por utilidad permanecen abiertos. No hubo borrado adicional, migración remota, índices, compra, cambio de plan ni refresh manual.
