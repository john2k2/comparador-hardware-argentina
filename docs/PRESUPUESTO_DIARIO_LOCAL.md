# Presupuesto diario estimado para el piloto

`chargeDailyBudget(db,{now,estimatedRowsWritten,limit=80000})` requiere una
transacción SQLite del caller. Acumula escrituras estimadas por día UTC en
`pilot_daily_write_budget`, con overhead conservador de cuatro operaciones
por actualización. Los no-ops no escriben ni crean la tabla.

Rechaza exceder el límite, aumentar el techo registrado y retroceder de día.
El caller confirma o revierte ledger y cambio de datos juntos. Todas las
actualizaciones deben usar la misma copia/ledger; copias independientes no
constituyen un presupuesto acumulado de cuenta.

Validación: cinco tests de acumulación, UTC, rollback, no-op y entrada inválida.
Este contador no conoce otras cargas de Cloudflare ni su facturación real.
La integración del reloj y el sincronizador confirma esta reserva antes de COMMIT.

Reversión: retirar módulo/tests e integraciones, perdiendo la protección local.
La tabla puede conservarse como evidencia; no se borra ni resetea su acumulado.
