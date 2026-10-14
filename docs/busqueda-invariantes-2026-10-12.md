# Menos trabajo por candidato de búsqueda

El motor prepara una vez las señales de la consulta y normaliza una vez
cada identidad. Las señales de URL se calculan cuando el matcher las necesita.
Se conserva el tratamiento anterior de límites ASCII y texto Unicode.

No cambian SQL, filtros, límite de candidatos, elegibilidad, paginación ni
frescura. La comprobación local comparó 66 páginas completas, 8.151 decisiones
de matching y 191.502 señales de URLs reales, sin diferencias. Los 27 tests
focalizados pasaron; dos casos optativos PostgreSQL/snapshot no se ejecutaron
en esa suite. También se compararon 18.432 combinaciones de límites ASCII.

La reproducción de trabajo en workerd sobre respuestas SQL capturadas bajó
la CPU media de RAM de 10,34 a 3,19 ms y de Ryzen de 20,10 a 8,58 ms.
Este harness excluye red, D1 real y parte del Worker: no certifica el límite
de CPU de producción. La prueba remota privada posterior dio paridad en
48/48 respuestas sobre la muestra de 1.016 productos.

Recuperación: revertir preparación compartida y evaluación diferida de URL
en matcher/motor junto con sus tests; la base y la proyección no cambian.
