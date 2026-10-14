# Caché del lector certificado

`CATALOG_RESPONSE_CACHE=1` habilita Cache API para páginas D1 ya validadas.
Por defecto está apagada. Guarda el dominio completo y recupera sus fechas;
un HIT no repite el mapper, motor ni guard SQL. La clave incluye identidad del
catálogo, snapshot, parámetros y política vigente; está separada del piloto.

Sólo aplica a `onlyCurrentOffers=true`, mínimo efectivo cero y máximo opcional.
Histórico y pisos positivos siguen sin caché. Las tiendas exigen frame global
vigente; las demás búsquedas usan certificado por consulta, incluso después
de vencer la proyección. El TTL nunca supera 60 segundos ni su horizonte.

Manifiesto y generación se contrastan en primaria antes y después de la
lectura. La captura inicial de la factory se consume una sola vez. Un HIT
requiere dos lecturas de metadata; no conserva un snapshot permanente.

Artefactos dañados y fallos auxiliares degradan a SQL. Si falla el guard tras
una espera, SQL usa el reloj actual. Un cruce del horizonte certificado o un
cambio de generación descarta la página. No se renuevan fechas ni stock.

Verificación local: casos de MISS/HIT, Dates, expiración, corrupción, fallo del
guard, futura entrada tras espera y cambios de generación; revisión independiente
cerrada. El ensayo Cache API en workerd usa un guard inyectado y no acredita
CPU/cuota remota. La activación pública requiere la prueba completa en staging.
