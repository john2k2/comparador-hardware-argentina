# Prueba privada de sesiones D1

El adapter admite sesiones opcionales. La primera lectura usa primaria y la
comprobación final de generación vuelve a primaria, evitando reutilizar un
bookmark de réplica que no conoce una actualización concurrente. La opción
está apagada por defecto y ante una API de sesiones ausente devuelve error.

Verificación: 21 tests aprobados, incluidos los dos modos en Miniflare/workerd
y el cambio de generación oculto al bookmark. La medición remota de 48
peticiones confirmó paridad, pero registró cero lecturas de réplica y latencia
peor. Se desactivó la replicación de D1 y se desplegó el flag apagado en el
Worker privado, versión `dda5fd5b-84ac-48b9-b6f6-249a5bb74d40`.

Una nueva ronda dio 48/48 respuestas iguales al oráculo local, con 57.801
lecturas D1. Mediana MISS: 721 ms; HIT: 205 ms. La red se mide desde la Mac,
no como CPU. Cambios de ofertas entre rondas y picos de conexión impiden
atribuir pequeñas diferencias de lecturas/latencia a la opción de réplicas.

El piloto conserva sus límites, token y vencimiento originales. Ninguna
ruta de la página pública se cambió ni se contrató un plan. Recuperación:
mantener el flag apagado; revertir la opción del adapter, observabilidad y
tests juntos. El namespace de caché cambió para descartar resultados previos.
