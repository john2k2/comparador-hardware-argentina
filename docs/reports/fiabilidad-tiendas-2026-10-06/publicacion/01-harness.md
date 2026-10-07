# Identificar la revisión comprobada públicamente

El harness de confianza pública tenía la revisión `2dc40b8` fija en su reporte y headers. Se añade `OFFER_CONFIDENCE_RELEASE`, restringido a un SHA de Git; sin argumento se registra `unknown`. Reporte y header usan ese valor y no atribuyen una ejecución nueva a la versión anterior.

Verificación: `node --check scripts/qa/verify-public-offer-confidence.mjs` aprobado. Runtime: se ejecutará el escenario real CPU/GPU, comparación y regreso con la revisión publicada como argumento; conserva las guardas de dominio HTTPS, métodos, formularios y analítica. La variable sólo identifica evidencia y no demuestra la versión del servidor: se debe correlacionar con despliegue/Worker.

Reversión: retirar este argumento y restaurar el harness anterior. No modifica aplicación, catálogo o cuenta.
