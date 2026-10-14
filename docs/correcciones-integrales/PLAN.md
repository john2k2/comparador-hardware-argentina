# Correcciones integrales — candidata local

Autorización: corregir y probar en local; no publicar. Base conciliada: `5d9baa16a6e433143c40e2678f6f3744fc932a88` (línea publicada de catálogo Mac más corrección de kit RAM). Rama: `codex/correcciones-integrales-local-20261013`.

| Unidad | Criterio de cierre local | Estado |
| --- | --- | --- |
| Portada | Fallo parcial no impide guardar selección válida; portada y ficha leen la misma generación; identidad, stock y frescura conservados | Verificada en local: cuatro ofertas coherentes, escritorio y móvil; lectura inicial 81 ms, mediana de diez siguientes 17 ms |
| Catálogo | Cinco categorías y cuatro pares de variantes del corte real; reparación persistida sin alterar ofertas | Verificado en copia real: 13 fichas reparadas; cinco categorías contrastadas en la API y variantes cubiertas por regresiones |
| Sincronización | Admitir sólo observación posterior de la misma publicación/variante; conservar fecha y stock originales; certificar nueva copia | Cerrado el barrido al corte 14/10 04:03 UTC: diez lotes, 7.292 ofertas distintas leídas, 3.828 admitidas; origen intacto, sin activación |
| Guía de $3M | Siete publicaciones exactas con stock, observación real de hasta tres horas y total hasta $3,3M; DB/API/página coherentes | Verificada localmente: 7/7, $2.847.725 por depósito/transferencia, escritorio y móvil. RAM KLEVV y reparación aislada de CompraGamer 17076; [detalle](GUIA_3M.md) |
| Defensas operativas | Límites de polling; expiración Redis atómica; caída de proveedor con tiempo máximo y rechazo en rutas sensibles | Verificado: 51 pruebas focales; dependencias colgadas terminan en unos 3 s |
| Armador | Selección por uso, presupuesto exacto y explicación de límites/cobertura | Verificado: gaming/general, prioridades de gasto y cobertura; guardar, recuperar, compartir y móvil |
| Sitemap | Índice y página de productos funcionan con el backend de catálogo vigente | Verificado con SQLite real: índice y página de 1.000 URLs responden 200 |
| Capacidad/continuidad | Retención y límites medidos; vida de tareas de caché/medición; comprobaciones CI | Verificado localmente: retención SQL, reinicio de generación, builds y ensayo de Worker. Capacidad remota y continuidad de la Mac siguen pendientes |
| Verificación final | Tipos, lint, pruebas, builds y recorridos sobre la misma implementación; revisión independiente | Detalle y recibos en [VALIDACION.md](VALIDACION.md) |

La recuperación pública sólo puede demostrarse después de una publicación autorizada. Ingresos, regreso de compradores externos, consentimiento y señales comerciales requieren seguimiento con personas y evidencia real. No se cambian las métricas D02/D03/G02 ni se crea otro monitor.

Cada unidad registra sus archivos, pruebas y límites. No se modifica la base remota ni el servicio Mac instalado. No se toca el checkout principal ni sus archivos de auditoría.

El código y los contratos comprobables en local quedan preparados. La validación pública de las cinco ternas originales, los ciclos naturales del productor, la vigencia pública de las siete ofertas de la guía de $3M, la recuperación de GA4 y D03 necesitan su etapa posterior. No se declara el proyecto completo ni rentable por terminar este paquete.

Cierre ampliado del 14/10/2026: barrido y guía de $3M integrados en la candidata `mac-refresh-1791951884566`. La prueba de página real recupera siete piezas; el corte previo v1 de cinco piezas permanece como diagnóstico. No se publicó ni se alteró el servicio instalado.
