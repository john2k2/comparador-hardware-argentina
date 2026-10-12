# Carga de catálogo por etapas

`production-load.mjs` prepara una copia consistente en una transacción de
lectura y divide los INSERT en lotes de hasta 40 sentencias/75 KB. El plan
y cada lote conservan un hash. Se validan identidad y precio contra las
columnas originales, sin renovar observaciones de tienda.

El executor inyectado **debe ser atómico**, como D1 `batch`. Cada lote guarda
su recibo en esa misma transacción. Una respuesta perdida después del commit
se concilia leyendo el recibo; no se repiten filas de `price_basis` sin PK.
Los lotes consultan el último recibo por índice, no cuentan todo el progreso.

La activación verifica una vez conteos globales, todos los recibos y el FTS.
Un catálogo incompleto no recibe `snapshot` ni `production_catalog`. Una
activación con respuesta incierta admite reintento del mismo corte y rechaza
marcadores ajenos. El fingerprint de identidad no incluye precio/frescura;
un cambio de variante exige otra activación.

Verificación: 8 tests SQLite aprobados, incluidos rollback, reanudación y
activación post-timeout. Dos correcciones fueron reproducidas por revisión
independiente. El plan de la copia completa contiene 59.692 productos,
73.827 ofertas y 425.960 INSERT distribuidos en 10.652 lotes (333,4 MB).
Estos conteos no representan escrituras facturadas por D1.

Este módulo es controlplane puro: **no conecta una cuenta, no tiene CLI de
publicación ni aplica un presupuesto remoto**. Antes de usarlo remotamente,
la capa operativa debe reservar cuota compartida, registrar consumo real,
detenerse ante resultados inciertos y verificar el executor D1. El cupo Free
de 100.000 escrituras diarias también cuenta índices, por lo que la carga
completa no cabe en un día. Véase [precios D1](https://developers.cloudflare.com/d1/platform/pricing/).

Recuperación: mantener el binding público anterior; abandonar o continuar
la base de staging desde su último recibo. No borrar datos ni reiniciar el
progreso para ocultar una discrepancia. Retirar el módulo no modifica la
base original, el scheduler de la Mac ni las cuentas.
