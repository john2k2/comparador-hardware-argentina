# Caché del piloto con reloj por consulta

Una proyección global vencida no impide calcular el resultado vigente desde
las ofertas originales. Para guardar ese resultado, el guard reúne un superset
de candidatos y pares de identidad antes de precio, frescura y matcher; calcula
la siguiente transición posible. El certificado dura hasta esa transición o
60 segundos, lo que ocurra primero. No renueva observaciones de tiendas.

En HIT se comprueban generación y certificado; el guard SQL se calcula en MISS.
Una falla del guard deja una lectura actual sin caché. Un cambio de generación,
retroceso de reloj o cruce del horizonte durante una lectura descarta la
respuesta. Los filtros por tienda conservan el certificado global anterior.

Las claves del piloto usan la versión 6. Una integración con otra política de
selección necesita su propia clave: los resultados de la política histórica
no se pueden reutilizar como resultados de D1 con representante vigente.

Verificación local: 37 pruebas focales de caché/worker/reloj, incluyendo cuatro
recorridos con Cache API y D1 en workerd. Pasaron sin skips. La prueba local no
acredita HIT de la aplicación pública ni CPU/lecturas facturadas remotas.
