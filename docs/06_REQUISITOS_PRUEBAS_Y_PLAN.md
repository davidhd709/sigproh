# EG S.A.S. — Requisitos, pruebas y plan

**Extracto temático del documento maestro v2.2 (15/10/2026).** Las decisiones pendientes y sustituciones se encuentran en `07_DECISIONES_Y_PENDIENTES.md`.

## 15. Catálogo de requisitos funcionales

Los requisitos funcionales (RF) siguientes presentan el **alcance consolidado** y son la referencia preferida para diseñar módulos. El registro RN posterior conserva la trazabilidad de las decisiones tomadas durante la conversación.

| Código | Requisito verificable |
|---|---|
| RF-001 | Autenticar usuarios y aplicar permisos por rol, propiedad, área interna y participación. |
| RF-002 | Administrar usuarios y activar/desactivar accesos sin borrar historiales. |
| RF-003 | Registrar propiedades, zonas, coordinadores principales y usuarios autorizados. |
| RF-004 | Registrar áreas internas y responsables sugeribles. |
| RF-005 | Administrar categorías por ámbito y sus requisitos de evidencia para cierre. |
| RF-006 | Crear novedades de propiedad o internas con datos y validaciones diferenciados. |
| RF-007 | Generar código único, creador y fecha de registro automáticamente. |
| RF-008 | Clasificar novedades por prioridad, incluida crítica desde su creación por roles confirmados. |
| RF-009 | Proponer responsable según configuración del ámbito. |
| RF-010 | Permitir al director confirmar, modificar y reasignar responsable principal con historial. |
| RF-011 | Rechazar candidatos inactivos/no autorizados y dejar pendientes los casos sin sugerencia válida. |
| RF-012 | Gestionar transiciones de estado y devoluciones sin pérdida de historial. |
| RF-013 | Permitir registrar atención urgente antes de asignación en novedades críticas. |
| RF-014 | Alertar al director al crearse o reclasificarse una novedad crítica. |
| RF-015 | Registrar motivos y autores de cambios de prioridad. |
| RF-016 | Permitir a director y responsable principal crear actividades. |
| RF-017 | Permitirles asignar actividades a usuarios activos autorizados. |
| RF-018 | Administrar estados de actividades y fechas objetivo/reales. |
| RF-019 | Exigir motivo al bloquear o cancelar actividades. |
| RF-020 | Registrar comentarios, menciones autorizadas y avances fechados. |
| RF-021 | Adjuntar y consultar fotografías, documentos y cotizaciones como soportes. |
| RF-022 | Clasificar adjuntos como iniciales, ejecución, finales o soporte. |
| RF-023 | Exigir evidencias de cierre según categoría y versión de regla aplicable. |
| RF-024 | Permitir a responsable principal solicitar cierre. |
| RF-025 | Permitir solo al director verificar, cerrar, devolver o reabrir con motivo. |
| RF-026 | Conservar historial cronológico de cambios de novedades y actividades. |
| RF-027 | Mostrar bandejas de tareas, casos críticos, asignaciones y solicitudes pendientes por rol. |
| RF-028 | Notificar eventos relevantes a usuarios autorizados. |
| RF-029 | Mostrar tableros por propiedad, área, prioridad, responsable y estado. |
| RF-030 | Calcular indicadores según fechas reales de eventos y fecha de corte. |
| RF-031 | Generar borradores de informes por propiedad, área interna y consolidado. |
| RF-032 | Recuperar automáticamente novedades, actividades e indicadores del periodo seleccionado. |
| RF-033 | Editar introducciones, observaciones, recomendaciones y otras secciones habilitadas. |
| RF-034 | Seleccionar evidencias autorizadas para incluir en el informe sin alterar archivos originales. |
| RF-035 | Guardar borradores y permitir actualizar explícitamente sus datos de origen. |
| RF-036 | Mostrar vista previa coherente con el PDF destinado a aprobación. |
| RF-037 | Enviar informe a revisión fijando la versión de contenido, datos y plantilla. |
| RF-038 | Permitir únicamente al director devolver con observaciones o aprobar. |
| RF-039 | Publicar internamente el PDF inmutable al aprobar, con control de acceso. |
| RF-040 | Generar una nueva versión para corregir un informe ya aprobado. |
| RF-041 | Consultar histórico de versiones y decisiones de revisión/aprobación. |
| RF-042 | Registrar distribución oficial externa solo por el director, vinculada a versión aprobada. |
| RF-043 | Exportar datos autorizados a Excel sin cambiar el contenido del PDF oficial. |
| RF-044 | Crear, versionar y publicar plantillas institucionales solo por administrador. |
| RF-045 | Personalizar y publicar configuraciones de plantilla por propiedad solo por director. |
| RF-046 | Aplicar configuración institucional por defecto si no hay personalización válida. |
| RF-047 | Conservar referencias de versiones de plantilla/configuración en cada PDF. |
| RF-048 | Registrar auditoría de cierres, asignaciones, informes, plantillas y distribuciones. |
| RF-049 | Filtrar consultas y exportaciones conforme al alcance del usuario. |
| RF-050 | Permitir respaldos y restauración documentada de información y archivos. |

## 16. Pruebas y criterios de aceptación

### 16.1 Novedades, permisos y flujo

| ID | Escenario | Resultado esperado |
|---|---|---|
| CP-01 | Coordinador crea novedad en propiedad asignada. | Se guarda con código, ámbito, fecha y autor; propone candidato. |
| CP-02 | Coordinador intenta crear/consultar en propiedad no autorizada. | Se deniega la operación en backend. |
| CP-03 | Crea novedad interna. | Exige área; no acepta simultáneamente propiedad. |
| CP-04 | No hay responsable sugerible. | Queda en revisión; no se asigna a usuario aleatorio. |
| CP-05 | Director confirma asignación. | Se notifica al responsable y queda evento de auditoría. |
| CP-06 | Coordinador intenta cambiar responsable principal. | Acceso denegado. |
| CP-07 | Caso crítico se registra antes de asignación. | Alerta al director; registra medidas urgentes autorizadas. |
| CP-08 | Director cambia prioridad crítica a media. | Motivo obligatorio y conservación de prioridad inicial/acciones urgentes. |
| CP-09 | Responsable principal crea actividad y asigna usuario autorizado. | Actividad registrada, responsable notificado. |
| CP-10 | Intenta asignar a usuario inactivo o sin alcance. | Operación rechazada. |
| CP-11 | Actividad se marca bloqueada. | Exige motivo y conserva historial. |
| CP-12 | Categoría exige foto final y se solicita cierre sin ella. | Solicitud impedida con mensaje claro. |
| CP-13 | Responsable solicita cierre con evidencias suficientes. | Pasa a pendiente de cierre. |
| CP-14 | Coordinador intenta cerrar definitivamente. | Acceso denegado. |
| CP-15 | Director devuelve cierre con motivo. | Regresa a atención y deja evento. |
| CP-16 | Director cierra y luego reabre con motivo. | Se preserva el cierre histórico y el evento de reapertura. |
| CP-17 | Desactivar una categoría con casos anteriores. | Historial de casos permanece legible. |

### 16.2 Informes, plantillas y distribución

| ID | Escenario | Resultado esperado |
|---|---|---|
| CP-18 | Usuario genera borrador por propiedad. | Datos y evidencias autorizados correctos; periodo visible. |
| CP-19 | Cambia texto de observaciones en borrador. | Modifica informe, nunca novedad de origen. |
| CP-20 | Intenta cambiar un indicador automático en editor. | Campo bloqueado; cálculo intacto. |
| CP-21 | Envía borrador a revisión. | Instantánea fija; no cambia ante nuevos eventos posteriores. |
| CP-22 | Director devuelve con observaciones. | Autor puede corregir y reenviar; decisión registrada. |
| CP-23 | Gerente intenta aprobar. | Rechazo por permisos. |
| CP-24 | Director aprueba un informe. | Se conserva PDF oficial y se publica para usuarios autorizados. |
| CP-25 | Se cambia una novedad tras aprobación. | PDF oficial histórico sin cambios. |
| CP-26 | Se solicita corregir aprobado. | Se crea nueva versión y exige aprobación nueva. |
| CP-27 | Coordinador intenta distribuir oficialmente. | Acceso denegado. |
| CP-28 | Director distribuye versión 1 y luego se aprueba versión 2. | La entrega histórica sigue apuntando a versión 1. |
| CP-29 | Administrador publica nueva plantilla institucional. | Nuevos documentos usan nueva versión; los anteriores no cambian. |
| CP-30 | Director personaliza logo de una propiedad. | Solo afecta a la propiedad configurada y a informes nuevos. |
| CP-31 | Director intenta modificar una sección institucional obligatoria. | No se permite. |
| CP-32 | Usuario intenta leer un PDF de otra propiedad por URL directa. | Rechazo por autorización en servidor. |
| CP-33 | Informe tiene decenas de fotografías/tablas. | PDF no corta contenido y mantiene legibilidad. |
| CP-34 | Informe combina registradas/cerradas de otros meses. | Indicadores aplican fechas y cohortes correctas. |
| CP-35 | Dos usuarios intentan aprobar/versionar en paralelo. | No se producen versiones finales inconsistentes. |

### 16.3 Pruebas transversales

- Intentos de modificar datos de otro ámbito por URL o parámetros de API.
- Archivos demasiado grandes, formatos falsos y archivos maliciosos.
- Recuperación de copia de seguridad y consistencia entre archivos/metadatos.
- Registros con fechas en límites de mes y zona horaria Colombia.
- Flujo con reaperturas, descartes y casos sin evidencia fotográfica por categoría.
- Conexión móvil intermitente; si se aprueba modo offline, sincronización duplicada y conflictos.
- Revisión de la correspondencia entre la vista previa y el PDF generado/aprobado.

## 17. Plan de implementación recomendado

### 17.1 Entregas técnicas por orden de dependencia

| Etapa | Contenido | Evidencia de término |
|---|---|---|
| 0. Validación | Resolver políticas pendientes y normalizar reglas. | Documento aprobado por responsables de EG S.A.S. |
| 1. Base | Proyecto, autenticación, usuarios, roles, propiedades y áreas. | Acceso y aislamiento comprobados. |
| 2. Novedades | Catálogos, alta, estados, prioridades y asignación mixta. | Ciclo ordinario validado. |
| 3. Operación | Actividades, evidencias, comentarios, historial, urgencias. | Casos completos y pruebas de autorización. |
| 4. Cierre/avisos | Evidencia por categoría, solicitud/cierre, bandejas y notificaciones. | Flujo crítico y ordinario comprobados. |
| 5. Informes | Borradores, métricas, PDF, Excel, editor de secciones. | Informe correcto para propiedad e interno. |
| 6. Gobierno documental | Plantillas/versiones, revisión, aprobación y distribuciones. | Histórico inmutable y permisos comprobados. |
| 7. Piloto y entrega | Pruebas de aceptación, respaldo, capacitación, ajustes. | Acta de validación y procedimiento operativo. |

### 17.2 Cronogramas de fuentes: discrepancia abierta

Los dos informes de práctica aportados presentan enfoques temporales diferentes: uno incluye un cronograma de **nueve semanas** y el otro uno de **dieciséis semanas**. Ninguno se toma aquí como plazo contractual del producto. EG S.A.S. debe validar la fecha real de inicio/fin de la práctica y el calendario de desarrollo antes de convertir las etapas anteriores en cronograma.

### 17.3 Entregables a crear posteriormente

- Especificación funcional validada y matriz final de permisos.
- Diagramas BPMN del proceso actual y propuesto, si el informe académico los requiere.
- Modelo entidad-relación y migraciones.
- Prototipos de pantallas escritorio/móvil.
- Contratos de API y arquitectura revisada.
- Casos de pruebas implementados y resultados.
- Instructivo de operación, copias/restauración y manuales por rol.
- Acta de aprobación del alcance y de cierre del piloto.


## Plan de fases detallado

Para ejecutar las etapas anteriores en tareas verificables, consultar [`10_FASES_DE_DESARROLLO.md`](10_FASES_DE_DESARROLLO.md). Contiene la secuencia F0–F10, tareas por fase, criterios de salida, mapa de dependencias y entregables. El tiempo total propuesto (19 semanas) es una referencia por validar, no reemplaza los plazos de los informes académicos.
