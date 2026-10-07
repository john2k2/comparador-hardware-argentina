# Retiro condicionado al respaldo verificado

Núcleo sin clientes ni credenciales. inspect sólo lee cuatro metadatos; archive-retire requiere un approval ID explícito y seis campos, con JSON numérico como texto. Cutoff fijo al menos cinco minutos anterior al reloj recibido. Hasta 250 por lote, cuatro lotes, 120 s y 5 MiB de objetos por run. La cuota del contenedor está en la RPC, no en este módulo puro.

Cada selección produce archivo gzip, manifiesto y selección de cuatro anclas ligada por hash. El callback de custodia debe devolver los tres objetos descargados; sus bytes/integridad se verifican antes del único intento de retiro. Se reservan al menos 30 s para retiro/conciliación. Los callbacks reciben copias para que no puedan renovar o cambiar el predicado original.

Un ACK requiere conteos coherentes y claves únicas dentro del snapshot. Las claves reconocidas deben faltar en la lectura independiente; las restantes pueden haber cambiado o haber faltado antes del retiro, como permite changed_or_missing. No se atribuye su ausencia a este run. Un ACK contradictorio, una lectura fallida o respuesta mutante perdida produce unknown y detiene ese run. No se implementa pausa persistente entre cron ni se reintenta el lote. Repetir claves entre lotes detiene el proceso.

Pruebas: node --test scripts/lib/telemetry-maintenance.test.mjs; 16/16 aprobadas, con payload numérico, corrupción, presupuestos, deadline, cambios, faltantes previos, ACK inválido/perdido y conciliación contradictoria. Runtime mediante callbacks simulados; no hay frontera DB/red real en esta unidad. success sólo describe el run: globallyComplete y physicalSavingProven permanecen false.

Rollback de la unidad: retirar núcleo y test antes de conectar CLI/workflow; no contiene ejecutor remoto ni modifica datos por sí mismo. No declarar capacidad cerrada con las pruebas de callbacks.
