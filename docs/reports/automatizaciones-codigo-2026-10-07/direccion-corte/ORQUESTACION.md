# Orquestación del Comparador

Jonathan conserva la decisión final sobre objetivo, alcance comercial, prioridades y publicación. El agente principal lo ayuda a decidir: cuestiona supuestos, contrasta evidencia, compara alternativas y recomienda la opción más viable con sus costos y condiciones de revisión. Convierte las decisiones confirmadas en encargos, resuelve conflictos entre especialidades, revisa los cambios y verifica el resultado. Los subagentes trabajan por encargo; no son procesos autónomos permanentes.

## Configuración y estado real

- Proyecto: .codex/config.toml; modelo predeterminado de subagentes gpt-6.1-sol, razonamiento high.
- La configuración local está ignorada por Git; los siete perfiles nuevos incluyen el modelo/esfuerzo y pueden versionarse junto con estas reglas.
- Siete perfiles en .codex/agents/comparador_*.toml, con modelo y esfuerzo explícitos.
- Máximo dos subagentes simultáneos, excluyendo al coordinador. Esta sesión dispone de tres slots en total.
- El modelo/esfuerzo del coordinador permanece bajo la elección de Jonathan. No se modificó la configuración global.
- Configuración validada con tomllib: los nueve perfiles existentes parsean y los siete nuevos contienen los campos exigidos.
- **Ejecución comprobada:** se creó y completó sol_configuration_check con modelo gpt-6.1-sol y razonamiento high explícitos, leyendo el contrato de comparador_reviewer.
- **Corte inicial:** intentar comparador_reviewer devolvió unknown agent_type; guardar archivos no actualizó el catálogo ya cargado en aquel corte.
- **Actualización segunda entrega:** el catálogo disponible ofrece los siete nombres. Se invocaron comparador_engineering y comparador_catalog con modelo gpt-6.1-sol/high y completaron investigación, implementación asignada y revisión cruzada. No afirmar ejecución individual de los otros cinco perfiles por su mera disponibilidad.
- **Actualización tercera entrega/publicación:** se usaron comparador_catalog, comparador_performance y comparador_reviewer para fuentes, seed y revisión; comparador_product corrigió el favicon dentro de tres archivos asignados. Los lectores/diagnóstico se publicaron en `99d5917`. Medición y crecimiento no se lanzaron sólo para acreditar disponibilidad.
- **Actualización piloto autorizado 07/10:** el coordinador ejecutó cuatro commits de 250 eventos vencidos de caché, exactamente 1000; la base no redujo su tamaño físico. comparador_performance entregó inspección de capacidad en lectura; comparador_engineering corrigió sólo el wrapper/test de recibos; comparador_reviewer cerró el P2 de timestamp mediante revisión independiente. `0ba14fc` y sus 64 pruebas quedan locales, sin RPC de historial ni publicación. Los especialistas no hicieron operaciones mutantes remotas y el límite de dos simultáneos se conservó.
- **Actualización preparación de historial y presupuesto:** Jonathan confirmó costo cero y límites de alcance. Ingeniería preparó seis archivos aislados y once grupos de pruebas PostgreSQL; revisión independiente sin hallazgos materiales y hashes conciliados. Performance midió consultas acotadas y planes sin ANALYZE. El coordinador comprobó en lectura productiva 36 candidatas en 1000 filas con timeout3s. `eac9b6a` queda local: sin DELETE de historial, índices, mantenimiento, cambios de plan ni refresh manual. Los conteos globales y la reducción física siguen sin demostrarse; la preparación no amplía autoridad.
- **Actualización automatizaciones/código 07/10:** ingeniería inventarió30scripts/6workflows/21comandos e implementó A1/A3; performance corrigió U1/U2/U3; coordinador implementó A2, contrastó runs/artefactos/DB de lectura y compiló la unión; reviewer independiente revisó seis unidades y el contrato del monitor. Dos subagentes como máximo simultáneos. Fuente local `c69e624`, 1922unitarias/41scripts/build OpenNext aprobados; no se publicó ni se modificó el heartbeat. Se conservan prioridad, muestra, presupuesto cero y ámbitos de escritura.
- Si una sesión futura no carga los tipos, el coordinador puede iniciar un agente estándar con modelo/esfuerzo explícitos y pasarle el contrato del perfil. No afirmar que el sandbox del perfil se aplicó automáticamente en ese camino, ni reiniciar/interrumpir chats para forzar carga.
- El intento de validación CLI con --strict-config features list fue rechazado porque ese subcomando no admite --strict-config. No se trata como una validación de carga de perfiles.
- Los perfiles Luna legados se conservan y requieren solicitud explícita; no son el default del equipo nuevo.

## Especialidades

| Perfil | Responsabilidad | Modo declarado |
|---|---|---|
| comparador_engineering | Contratos, conciliación, integración local, arquitectura y seguridad | Escritura local asignada |
| comparador_catalog | Fuentes, identidad, precio, stock, cola y cobertura | Escritura local asignada |
| comparador_performance | Worker/DB/cache, recursos, latencia, recuperación y alertas | Escritura local asignada |
| comparador_product | Comparación, ficha, armador completo, compatibilidad y UI | Escritura local asignada |
| comparador_measurement | Consentimiento, GA4/GSC, eventos recibidos, deduplicación y retorno | Escritura local asignada |
| comparador_growth | Demanda, SEO, activación, retención y experimentos | Lectura |
| comparador_reviewer | Revisión independiente de diff, seguridad, comportamiento y pruebas | Lectura |

Monetización se investiga dentro de crecimiento/medición; la decisión comercial y cualquier mensaje a terceros pertenecen a Jonathan y dirección. No crear un octavo agente para tareas que no tienen evidencia suficiente.

## Cómo se asigna una tarea

Todo encargo incluye:

1. Resultado que queremos y razón de prioridad.
2. Revisión, carpeta y fuentes de verdad; distinguir remoto, local e histórico.
3. Archivos o módulos de responsabilidad. Sin asignación de escritura, el agente sólo investiga.
4. Dependencias, trabajo ajeno y límites de cuentas, producción y presupuesto.
5. Condición de aceptación, pruebas proporcionales y evidencia requerida.
6. Entrega corta: estado, cambios, pruebas, límites, riesgos y siguiente acción.

Ejemplo de encargo: investigar el fallo REFRESH_CLAIM_FAILED de la ejecución del 06/10 con logs/artefactos de ese intervalo, identificar el contrato de adquisición del lote y devolver una causa contrastada o hipótesis falsables. No despachar refresh ni modificar DB. Si hay una reparación local definida, asignar sus archivos en otro encargo y pedir una regresión que reproduzca el fallo.

## Flujo de trabajo

1. **Dirección evalúa y fija la entrega.** Aplicar el criterio de decisión de README.md, recomendar una opción y respetar las decisiones confirmadas; máximo tres entregas activas.
2. **Investigar en paralelo sólo lo independiente.** Por ejemplo, ingeniería concilia versiones mientras catálogo analiza cobertura. No pedir dos lecturas idénticas.
3. **Asignar implementación local acotada.** Un escritor por archivo, aunque dos especialistas trabajen sobre la misma entrega.
4. **Revisar con independencia.** El revisor no aplica su propia corrección. El coordinador concilia severidad, falsos positivos y conflictos.
5. **Integrar y probar.** El coordinador inspecciona diff y contratos compartidos; tests locales, fuentes reales y runtime tienen estados separados.
6. **Publicar cuando exista autorización concreta.** Aprobación sobre candidata revisable, no una promesa ni un test verde.
7. **Cerrar con el resultado observado.** Actualizar estado central y evidencia con revisión, entorno, fecha y numerador/denominador.

No lanzar builds/navegadores pesados simultáneamente en el Mac de 16 GB sólo porque quedan slots. Paralelismo de análisis no exige duplicar cargas. Subir esfuerzo/modelo aumenta consumo y latencia; mantener contextos acotados y no copiar todas las conversaciones en cada agente.

## Permanencia

Se conservan los contratos en perfiles, las prioridades en README.md y los antecedentes en CHATS.csv. Los agentes nuevos reciben el contexto necesario para su tarea; no se presupone memoria permanente ni ejecución las 24 horas.

El seguimiento diario existente conserva su horario e ID y continúa en lectura. La limpieza de su prompt largo debe preservar permisos, reglas, fuentes, fechas y silencio ante estados sin cambios. No se creó otra automatización ni se modificó la actual en esta sesión.

## Qué cuenta como comprobado

| Capa | Estado en esta sesión |
|---|---|
| Capacidad de delegar con gpt-6.1-sol/high explícitos | Comprobada mediante ejecución aceptada y resultado recibido |
| Sintaxis TOML y coherencia de modelos/reglas | Comprobada |
| Catálogo de nombres nuevos disponible ahora | Sí: siete perfiles ofrecidos; el error del corte inicial se conserva como antecedente |
| Perfiles invocados por nombre en entregas reales | comparador_engineering, comparador_catalog, comparador_performance, comparador_product y comparador_reviewer. Producto ejecutó el arreglo acotado del favicon; medición y crecimiento no se lanzaron sólo para probar disponibilidad |
| Límites de los especialistas | Contratos de archivos/lectura/escritura respetados en los encargos; no se acredita aislamiento técnico adicional sólo por el nombre del perfil |
| Calidad/fiabilidad global del proyecto | No certificada; pendientes técnicos siguen abiertos |

Fuentes oficiales consultadas: [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) y [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol). La skill create-subagent instalada describe archivos de Cursor; se usó su orientación de encargos y se siguió el formato TOML de Codex documentado y observado localmente.
