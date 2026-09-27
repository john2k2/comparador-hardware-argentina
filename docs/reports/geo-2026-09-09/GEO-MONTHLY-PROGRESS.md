# GEO Progress Snapshot — Comparador Hardware Argentina

Periodo evaluado: 1–9 de septiembre de 2026. No se presenta como delta de puntaje completo: la línea anterior no tenía todos los mismos chequeos y Search Console recién acumula datos desde el 24 de julio.

## Ganancias comprobadas

| Indicador | Línea actual | Lectura |
|---|---:|---|
| Search Console | 347 clics, 17,2 mil impresiones, CTR 2%, posición 8,6 | Rendimiento real, no estimado. |
| Queries | 780 | Ya existe cobertura temática medible. |
| Semrush AR | 148 keywords, +32,14% | Estimación que acompaña, pero no reemplaza GSC. |
| Tráfico Semrush | 56, +93,1% | Señal direccional; no usar como sesiones reales. |
| Home en GSC | 251 clics, 4.386 impresiones | Principal activo actual. |

## Cambios cualitativos desde el baseline de contenido

- Guías indexadas con fecha visible y método de selección.
- Categoría GPU indexada, con FAQs y contenido explicativo que Google ya extrae.
- URLs limpias de categoría existen, pero la migración de visibilidad desde `/search?category=` sigue en curso.

## Problemas nuevos o pendientes

1. Respuestas 503 de Cloudflare después de varias solicitudes durante la auditoría: requiere observación externa para distinguir bloqueo/rate limiting de una indisponibilidad real.
2. CTR 2% con posición media 8,6: el próximo retorno está en snippets/página de destino, no en volumen indiscriminado.
3. Entidad, autoría, benchmarks y datos históricos siguen siendo las mayores brechas GEO.

## Meta para el próximo corte (7 de octubre)

- Cero 503 en monitor externo.
- Más clics por impresión para CPU/GPU sin perder posición.
- Confirmar que `/comparar/...` sustituye a `/search?category=...` en impresiones y clicks.
- Evidencia verificable de Bing WMT/sitemap o documentar que aún no está configurado.
