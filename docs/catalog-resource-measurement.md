# Presupuesto y métricas de refresh

La fase compartida reserva la mitad del tiempo restante tras inventario/preparación para rotar otras fuentes, además de su cuota de filas. Un lote iniciado puede terminar después del corte. Se registran tiempos por fase y métricas HTTP sólo del transporte instrumentado: requests, bytes decodificados, esperas y fallos. No atribuirlas a adaptadores no instrumentados ni prometer ahorro porcentual.

Validación: prueba con reloj controlado comprueba cambio de fase aunque no se agotaron las filas. El próximo runner normal debe contrastar tiempo/observadas/comparables por tienda; las unitarias no acreditan cobertura real. Rollback: restaurar la planificación anterior de esta unidad; conservar leases, cuotas e historial de métricas.
