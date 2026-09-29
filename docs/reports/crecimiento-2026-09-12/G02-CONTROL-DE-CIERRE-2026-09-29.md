# G02 — corrección de variantes y control de cierre

Corte del 29/09/2026, 17:44–17:45 UTC. Solicitud: completar G02 y revisar qué permite cerrar. **G02 permanece en observación; no se cerró ninguna dependencia sin su propia evidencia.**

## Correcciones publicadas

Commit `58a3620`, Workers Build `4190c7c4-5839-4ac1-b881-2b714a270ce2`, success a las 17:49:45 UTC:

- Las claves de GPU ahora distinguen ediciones EVO/ADVANCED/ICE/AERO, versiones 2X/3X, color, tipo de memoria y OC cuando están indicados. El fabricante de la placa prevalece sobre AMD/Intel cuando estos describen el chip. Las claves históricas insuficientes no vuelven a fusionar las fichas en lectura; se conservan los IDs públicos.
- Las contradicciones explícitas entre la ficha y la URL o título observado bloquean la asociación, incluso ante un dictamen anterior `consistent`. Una omisión sigue siendo incertidumbre: no inventa una contradicción, disponibilidad o identidad aprobada.
- Las ofertas recientes de la muestra sin evidencia de identidad vuelven a ser objetivos del próximo ciclo prioritario; antes podían omitirse por su fecha reciente.
- `catalog-freshness-report` añade `identityAccepted3h`, `identityUnverified3h`, `explicitConflicts3h` y cobertura por ficha usando el contrato de identidad de la aplicación. Conserva los contadores históricos, incluida `candidateComparable3h`, con su significado anterior. La ausencia de revisión no se transforma en aprobación de G02.
- `scripts/g02-readiness.mjs` diagnostica los requisitos. No suma ejecuciones manuales, repeticiones horarias del mismo día ni ciclos pendientes de calidad. Nunca cierra tareas: como máximo devuelve `ready-for-review`.

## Resultado real

Fuente: `G02-EVIDENCIA-CIERRE-2026-09-29.json`. Lectura de base sin refresh, sin cambiar stock/precios/fechas y sin nuevas llamadas a Jev.

| Control | Resultado |
|---|---:|
| Ciclos diarios útiles documentados | 3 de 7 |
| Ofertas disponibles almacenadas globales, observadas ≤24 h | 222 / 47.636 |
| Ofertas de la muestra observadas ≤24 h y ≤3 h | 48 / 57 |
| Candidatas históricas de la muestra, solo por ausencia de status pendiente | 8 |
| Ofertas de la muestra con revisión aplicable, título observado y sin contradicción | 3 |
| Fichas fijas con una de esas ofertas recientes | 3 / 9 |

Las seis fichas sin una oferta que pase el control reforzado son Ryzen 5 5600, i5-12400, Gigabyte RTX 5060 Eagle y las tres RAM fijas. No significa que estén agotadas; faltan asociaciones o evidencia suficiente. Las tres cubiertas son Ryzen 5 7600X, MSI RTX 5060 Shadow y ASUS RTX 5060 Dual EVO.

El 95% es la meta inicial propuesta del plan: la muestra tiene 84,21% de frescura ≤24 h y el catálogo global 0,466%. No se recortó el denominador ni se sustituyeron las nueve fichas para mejorar el resultado. Los nueve IDs coinciden con la muestra del 25/09. El descenso anterior a 57 ofertas disponibles conserva su evidencia histórica.

## Criterio y próximos pasos

1. Confirmar que las ejecuciones programadas posteriores al despliegue generan el esquema nuevo y observaciones útiles. El último `schedule` observado al revisar Actions sigue siendo `36560676167`, 29/09 a las 11:16 UTC; la nueva cadencia horaria todavía no está demostrada. No convertir un despacho manual en prueba de cron.
2. Corroborar y corregir las asociaciones restantes con evidencia de variante/publicación de cada tienda. Los casos Corsair RS/LPX y ASUS EVO/ADVANCED requieren separar modelos; subir confianza artificialmente o ignorar Jev no resuelve una asociación incorrecta. La corrección de claves previene nuevas fusiones, pero no migra ni reasigna masivamente las filas históricas.
3. Acumular cuatro días útiles adicionales y revisar cobertura por tienda, las nueve fichas e identidad. El 03/10 es el primer control posible, **no una promesa de cierre**. Aunque se alcancen siete días, si la cobertura continúa insuficiente G02 sigue abierto.

Jev conserva su umbral y papel de revisión semántica. Su calibración poblacional no garantiza una respuesta individual; la documentación oficial recomienda combinar decisiones con controles deterministas: [TypeSafe, System One](https://docs.typesafe.ai/concepts/system-one). Esta revisión no atribuye el problema a cuota ni a credenciales.

## Validación y seguimiento

- Suite principal: 924 pruebas aprobadas y 2 omitidas; luego se añadió y aprobó una regresión adicional del mapper contra un `consistent` antiguo que contradice el título observado.
- Siete pruebas de scripts aprobadas: CLI real con catálogo simulado, conteos ausentes, revisión legacy no aceptada, días duplicados/manuales y cortes vencidos.
- TypeScript, lint y build local aprobados; build de producción confirmado arriba.
- Control público posterior al despliegue, 17:56 UTC: portada, categoría GPU, ficha ASUS Dual y guía $2M respondieron HTTP200 sin 1102 en esta muestra. Esto acredita respuesta/render del corte, no recuperación sostenida ni stock.
- API pública de la ficha ASUS verificada después del despliegue: clave `tarjetas-graficas::gpu:rtx5060:8gb:asus:dual:evo:oc`; la oferta ADVANCED de CompraGamer aparece `needs-review/explicit-conflict`, y Mexx mantiene `consistent-text`. Confirma la guarda real además del build.
- El evaluador se ejecutó contra el catálogo real; el resultado fue `not-ready`, con cuatro motivos: días insuficientes, frescura global y de muestra bajo meta propuesta, y fichas sin oferta de identidad aceptada.
- No se cambian estado, responsable, prioridad o fecha de G02; por ello el tablero conserva su estado. Los informes anteriores permanecen históricos.

Repetición del diagnóstico después de obtener un artefacto nuevo:

```sh
node scripts/g02-readiness.mjs \
  --cycles docs/reports/crecimiento-2026-09-12/G02-CICLOS.csv \
  --freshness /ruta/al/catalog-freshness.json \
  --sample docs/reports/crecimiento-2026-09-12/G02-MUESTRA-PRIORITARIA.json \
  --output /ruta/al/g02-readiness.json
```

Primero debe actualizarse el registro de ciclos con el artefacto y metadatos de Actions verificados. El diagnóstico lee ese registro; no audita de nuevo los artefactos históricos. Un campo nuevo ausente en un artefacto antiguo significa no verificado.

G24 requiere además G18–G23 y confiabilidad resuelta. G01, consentimiento/CMP, derechos de imágenes, pruebas editoriales y canal comercial conservan controles independientes. Completar G02 no aprobaría AdSense ni cerraría automáticamente esos asuntos.
