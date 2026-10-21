# EG S.A.S. — Decisiones y cuestiones por validar

**Extracto temático del documento maestro v2.2 (15/10/2026).** Las decisiones pendientes y sustituciones se encuentran en `07_DECISIONES_Y_PENDIENTES.md`.

## 18. Decisiones aprobadas, propuestas y pendientes

### 18.1 Confirmadas expresamente en esta conversación

| ID | Decisión | Estado |
|---|---|---|
| DEC-01 | Novedades de propiedades **y** novedades internas de EG S.A.S. | Confirmada |
| DEC-02 | Puede reportarse cualquier situación que necesite seguimiento. | Confirmada |
| DEC-03 | Reportan Gerencia, director y coordinadores. | Confirmada |
| DEC-04 | Solo el director realiza el cierre definitivo. | Confirmada |
| DEC-05 | Asignación mixta; sugerencia del sistema y confirmación/cambio por director. | Confirmada |
| DEC-06 | Atención inmediata registrable para casos críticos antes de confirmar asignación. | Confirmada |
| DEC-07 | Gerencia, director y coordinadores pueden marcar inicialmente una novedad crítica; director ajusta con historial. | Confirmada |
| DEC-08 | Director y responsable principal crean/asignan actividades; director supervisa. | Confirmada |
| DEC-09 | Requisitos de evidencia para cierre configurables por categoría; director verifica. | Confirmada |
| DEC-10 | Informes automáticos con secciones redactadas editables, sin cambiar datos originales. | Confirmada |
| DEC-11 | Director aprueba todos los informes. | Confirmada |
| DEC-12 | Solo director realiza distribución externa oficial. | Confirmada |
| DEC-13 | Plantilla institucional configurable por propiedad. | Confirmada |
| DEC-14 | Administrador gestiona plantilla institucional; director configura opciones permitidas por propiedad. | Confirmada |
| DEC-15 | Contabilidad y tesorería quedan fuera del sistema. | Confirmada |

### 18.2 Decisiones técnicas o de operación propuestas, NO aprobadas expresamente

- Un único responsable principal activo por novedad.
- Posibilidad de elaborar informes por coordinadores y Gerencia bajo los alcances propuestos.
- Publicación automática interna tras aprobación del director.
- Estados técnicos exactos, parámetros de vencimiento y mecanismo de alertas críticas.
- Política de categorías por defecto y requisitos concretos de fotos/documentos.
- Almacenamiento de fotos (VPS o servicio externo) y motor concreto de PDF.
- Modo sin conexión y sincronización avanzada de PWA.
- Activación de reportes de gestión interna para determinados usuarios adicionales.

Estas propuestas aparecen desarrolladas en las reglas de negocio acumuladas, pero conviene validarlas como un bloque antes del diseño final.

### 18.3 Pendientes de decisión

| ID | Pregunta pendiente | Riesgo si no se define |
|---|---|---|
| PEN-01 | ¿Puede el director aprobar un informe que elaboró él mismo? | Flujo de revisión sin criterio en autorrevisión. |
| PEN-02 | ¿Qué sucede si el director no está disponible? ¿Se puede designar otro usuario que tenga formalmente ese mismo rol? | Informes y cierres detenidos. |
| PEN-03 | ¿Puede Auxiliar de Gerencia registrar novedades y marcarlas críticas? | Diferencia de permisos con Gerencia. |
| PEN-04 | ¿Puede distribuirse externamente un informe interno o consolidado, y a qué destinatarios? | Posible difusión indebida. |
| PEN-05 | ¿Quién revisa las configuraciones publicadas por el director cuando afectan identidad de una propiedad? | Cambios no deseados en informes. |
| PEN-06 | ¿Cuáles son límites por prioridad y cuándo una alerta crítica escala? | Avisos inefectivos o métricas imprecisas. |
| PEN-07 | ¿Qué tipos/tamaños de archivo admite el sistema y dónde se almacenan? | Costos, seguridad y rendimiento. |
| PEN-08 | ¿Qué tiempo se conservarán documentos, eventos y archivos? | Riesgos operativos y normativos. |
| PEN-09 | ¿El MVP incluye funcionamiento sin conexión? | Complejidad adicional de sincronización. |
| PEN-10 | ¿Cuántas propiedades, coordinadores, áreas y novedades habrá inicialmente? | Dimensionamiento insuficiente. |
| PEN-11 | ¿Quién valida oficialmente los requisitos, los informes y la prueba piloto por EG S.A.S.? | Falta de criterio de aceptación. |
| PEN-12 | ¿Las categorías y sus evidencias mínimas exactas serán las sugeridas o cambiarán? | Cierres bloqueados o demasiado laxos. |
| PEN-13 | ¿Quién puede descartar casos y vincular duplicados, y en qué situaciones? | Inconsistencias en reportes. |
| PEN-14 | ¿Cómo se gestionan datos confidenciales en novedades internas? | Exposición de información sensible. |
| PEN-15 | ¿Qué periodos exactos, indicadores obligatorios y formato institucional se usarán? | Informes no aceptados por la empresa. |

### 18.4 Reglas que deben considerarse reemplazadas o precisadas

1. **Asignación principal:** una propuesta previa permitía asignaciones por Gerencia y Auxiliar de Gerencia; prevalece la decisión posterior de **confirmación/reasignación por director**.
2. **Cierre:** el flujo actual descrito en fuentes terminaba con cierre del coordinador; el flujo nuevo exige **cierre por director**.
3. **Aprobación financiera:** el plan original incorporaba Contabilidad y Tesorería en la plataforma; se descartó expresamente. Solo pueden conservarse soportes y referencias operativas.
4. **Revisión de informes:** cualquier mención a «revisor genérico» se restringe al **director** para aprobar o devolver.
5. **Distribución:** cualquier referencia a «usuario autorizado» para distribución oficial externa se restringe a **director**.
6. **Plantillas:** administración institucional es del **administrador**, configuración de propiedad es del **director**.
7. **Informes:** publicación interna es consecuencia de aprobación; distribución es evento independiente, no otro estado de aprobación.
8. **Rendimiento/sin conexión:** afirmaciones cuantitativas y modo offline de textos preliminares no se declaran implementados ni aprobados sin validación.

---
