# G02 — Actualización prioritaria de precios, 29/09/2026

## Problema y alcance

Una consulta general diaria no mantiene las ofertas de las tres guías dentro de su ventana de tres horas. A las 13:30 UTC las tres guías mostraban 0/7 ofertas recientes. El catálogo disponible seguía siendo mayoritariamente histórico. La fecha del producto no sustituye a la observación de cada oferta.

Se implementa un proceso dedicado para las publicaciones conocidas de las guías, reutilizando las reglas de variante, stock e identidad y hasta tres alternativas por pieza. Revisa cada hora las ofertas con al menos 90 minutos; una vez al día incluye la muestra fija G02 de nueve productos. No se afirma cobertura reciente del catálogo completo. GitHub puede retrasar los cron: se registra la hora real.

Los runners estándar de repositorios públicos no consumen el cupo de minutos privados: https://docs.github.com/en/billing/concepts/product-billing/github-actions . Repositorio público comprobado en GitHub el 29/09. No se contrata capacidad ni cambia el plan.

## Unidades y controles

1. **Integridad de observaciones:** CompraGamer conserva la hora de descarga al reutilizar su caché. Una revisión pendiente no desaparece al refrescar. Los fallos temporales del revisor pueden volver a comprobarse, pero siguen sin ofrecerse como comprables hasta pasar los controles. No se amplía la ventana de tres horas.
2. **Proceso prioritario:** endpoint administrativo exclusivo del runner, bloqueo persistente de 30 minutos, comprobaciones seriales espaciadas dos segundos, máximo 42 destinos de guías y 80 de muestra, corte de 18 minutos. Persistencia limitada a la terna existente producto/tienda/URL y observaciones posteriores al inicio del proceso. No consume ni modifica la cuota pública de solicitudes.
3. **Evidencia:** cada ejecución conserva respuesta por oferta y `catalog-freshness`. Un estado verde no significa que todas las piezas estén cubiertas. Los huecos, límites y observaciones rechazadas permanecen visibles.

## Validación previa a publicación

- 110 pruebas enfocadas aprobadas: planificación, acceso, persistencia rechazada, revisión pendiente, alternativas, guías y fechas de CompraGamer.
- TypeScript, lint y build de producción aprobados; YAML y scripts bash/Python del workflow validados.
- Migración `persist_priority_offer` aplicada: permisos `anon=false`, `authenticated=false`, `service_role=true`; URL/terna inexistente y observación anterior al proceso devuelven `false`.
- Advisors posteriores: sin advertencias de la nueva función. Permanecen avisos preexistentes de `pg_trgm` en public, protección de contraseñas filtradas y tablas internas con RLS sin política. No se cambian permisos ajenos a esta función.
- Falta registrar ejecución real y contraste de las guías tras publicar: no atribuirles éxito por estas pruebas.

## Reversión y cierre

La unidad de integridad puede revertirse separadamente; la unidad de programación puede retirarse revirtiendo el endpoint, planificador y cambios del workflow. La función SQL es aditiva, inaccesible a clientes y queda sin uso si se retira el proceso. Ninguna reversión requiere eliminar precios o historial.

G02 continúa **en observación**, no completado. Las ejecuciones manuales y las comprobaciones horarias de guías no cuentan como ciclos diarios útiles. Para cerrar se exigen siete ciclos diarios útiles medidos y frescura de la muestra fija; conservar numeradores/denominadores, calidad por tienda y evaluación de la meta de 95% en 24 horas. El 03/10 es un primer control posible, no una fecha prometida de cierre. Esta corrección no autoriza inventar disponibilidad, relajar identidad ni aprobar AdSense.

## Ajuste tras el primer contraste real, 16:16 UTC

El proceso ya guardó observaciones nuevas: la guía 1M devuelve 7/7 por ARS 994.303 y la 3M 7/7 por ARS 2.886.249; son cortes, no garantías futuras. La guía 2M tiene 6/7 y subtotal ARS 1.419.179, con GPU pendiente. Una RX 7600 conocida estaba excluida de nuevos intentos por una revisión `low-confidence` anterior. Se permite reunir evidencia nueva también ante `low-confidence` e `insufficient-evidence`; la oferta sigue fuera del precio comprable hasta superar la revisión. Los conflictos explícitos o del modelo no se habilitan. 52 pruebas de este ajuste y TypeScript/lint aprobados. La comprobación específica usa la cola pública existente y no cuenta como ciclo diario G02.
