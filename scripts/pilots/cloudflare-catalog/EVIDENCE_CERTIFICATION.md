# Evidencia del catálogo antes de cargar D1

`certifyProductEvidence` trabaja sobre una copia nueva. Reconstruye bases,
resúmenes y proyección usando el mismo contexto de identidad que la aplicación.
Conserva todas las filas de ofertas originales y verifica su hash al terminar.
No observa tiendas, cambia stock ni renueva fechas. Retira cualquier activación
heredada: esta copia todavía no habilita el backend público.

La selección histórica por tienda depende del reloj. El recibo `validUntil`
marca la primera transición que cambia esa selección; una oferta pendiente o
única no vence resúmenes ajenos. Al cruzar el horizonte hay que regenerar desde
las observaciones conservadas. La proyección tiene su propio horizonte, más
corto: al vencerlo el motor calcula ofertas vigentes desde las fechas reales.

`admitMacObservations` incorpora sólo observaciones posteriores acreditadas por
un evento idéntico al contenido actual. Exige ID, tienda, publicación y variante
compatibles; una referencia de fuente contradictoria se rechaza incluso sin
dictamen. Los cambios de asociación quedan en cuarentena. FullH4rd está diferido.
Un intento fallido no es una observación y nunca renueva la fecha.

Las dos herramientas requieren destino inexistente y dejan intactas las fuentes.
Tras admitir observaciones, hay que normalizar nuevamente y verificar búsqueda,
mapper y respuesta pública antes de preparar un plan de carga nuevo.

Verificación local: cuatro casos de normalización y ocho de admisión, incluyendo
preservación de datos, vencimiento histórico, WAL, referencia contradictoria y
rollback. La revisión independiente cerró sus dos hallazgos reproducidos.
Estas pruebas no acreditan cobertura completa, consumo remoto ni activación.
