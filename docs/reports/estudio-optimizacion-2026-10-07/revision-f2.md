# Revisión independiente F2a/F2b — 07/10/2026

Revisor Sol/high: sin hallazgos materiales. Helper con cap200, sólo promesas pendientes, sin expulsión ni TTL; limpieza por identidad tras éxito, rechazo y excepción síncrona. Claves completas separan modos. Rate limit, auth, error, demanda y telemetría permanecen por request. Cache-write tiene propietario único; cada consumidor revalida tras esperar. Reread SQL máximo uno con mismos parámetros; segunda invalidez es error, no página filtrada ni vacío ficticio. Históricos conservados.

Revisor ejecutó dos suites offline:30/30,839ms. Sin HTTP, DB, build o Git ni cambios de fuentes. Avisos preexistentes Vite/DEP0205. El vuelo termina antes del cache-write: una llamada nueva puede iniciar otra lectura. No hay coordinación entre replicas; una lectura colgada ocupa una entrada hasta el cap. Ahorro productivo de CPU, latencia y bytes sin medir.

| Fuente | SHA-256 |
|---|---|
| coalesced-read.ts | 1b31b275c5af266f807617c9420aa86401c78bc863a9f61132989601e5713911 |
| coalesced-read.test.ts | 17c866fc893fc8f6785a41d6b5c3987e21daf74c10d0db280f4e15f91e3c50cc |
| search-route-handler.ts | 2dd0616c94f5e2eb6ccfcb0f1850f02fa511834b743d9746b7fbd3ef05aa1c93 |
| route.test.ts | 5aab7257d3975c5cd0e1f5c08eca2233c99cb2ec475952474531ea1bcde40a7a |
| consultas-actualizaciones.md | cda3407e83526e02eaf5878a8250eaa49068d859132d6e974452a0bc7f1fa1f1 |
