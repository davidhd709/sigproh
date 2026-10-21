# EG S.A.S. — Plan de desarrollo por fases

**Versión del documento:** 1.0  
**Fecha de elaboración:** 15 de octubre de 2026  
**Proyecto:** Sistema de Gestión de Novedades de EG S.A.S.  
**Estado:** plan de implementación propuesto, pendiente de validación con EG S.A.S.  
**Documentos de referencia:** `01_DOCUMENTO_MAESTRO_EG_SAS.md`, `06_REQUISITOS_PRUEBAS_Y_PLAN.md`, `07_DECISIONES_Y_PENDIENTES.md` y `08_CATALOGO_REGLAS_RN_001_221.md`.

> **Alcance obligatorio:** plataforma PWA para novedades de propiedades horizontales y novedades internas de EG S.A.S., desde el reporte hasta el cierre y los informes. No implementar contabilidad, tesorería, pagos, desembolsos, presupuestos ni gestión financiera.

## 1. Propósito y forma de trabajar

El desarrollo se organizará en entregas comprobables. Cada fase debe terminar con software ejecutable, pruebas o documentación revisable; no basta con marcar tareas como terminadas. El equipo solo pasará a la fase siguiente si se cumplen los criterios de aceptación de la fase anterior, salvo actividades técnicas que puedan realizarse en paralelo sin introducir dependencias.

La secuencia prioriza primero el **ciclo operativo de las novedades**, después los tableros e informes y, finalmente, la aprobación y conservación de documentos. Esto evita comenzar por el generador de PDF cuando aún no existe información operativa confiable.

**Estimación orientativa:** 19 semanas secuenciales para un equipo pequeño con dedicación sostenida y alcance completo. No es una fecha aprobada ni un compromiso contractual. El cronograma deberá ajustarse al número de desarrolladores, disponibilidad de usuarios para pruebas, infraestructura y decisiones pendientes. Los materiales académicos previos mencionan nueve y dieciséis semanas; estas duraciones corresponden a propuestas anteriores y no sustituyen este cálculo preliminar.

## 2. Resumen del cronograma propuesto

| Fase | Semanas de referencia | Duración estimada | Resultado esperado | Entrega |
|---|---|---:|---|---|
| F0. Validación y planificación | 1 | 1 semana | Alcance, permisos y decisiones críticas validados | Documental |
| F1. Arquitectura y base técnica | 2 | 1 semana | Proyecto ejecutable, CI, base de datos y entornos | Técnica |
| F2. Usuarios y estructura organizativa | 3–4 | 2 semanas | Roles, propiedades, áreas y permisos | Funcional |
| F3. Registro y asignación de novedades | 5–6 | 2 semanas | Reportes, categorías, prioridades y asignación mixta | Funcional |
| F4. Actividades, seguimiento y evidencias | 7–8 | 2 semanas | Gestión colaborativa de cada caso | Funcional |
| F5. Atención crítica, cierre y avisos | 9–10 | 2 semanas | Ciclo operativo completo validado | **MVP operativo** |
| F6. Paneles e indicadores | 11 | 1 semana | Tableros y métricas con fechas correctas | Funcional |
| F7. Informes automáticos y exportaciones | 12–13 | 2 semanas | Borradores, vista previa, PDF y Excel | Funcional |
| F8. Plantillas, aprobación y distribución | 14–16 | 3 semanas | Gestión documental completa y versionada | **MVP de informes** |
| F9. Calidad, seguridad y recuperación | 17–18 | 2 semanas | Validación transversal y liberación candidata | Técnica |
| F10. Despliegue y prueba piloto | 19 | 1 semana | Piloto, capacitación y entrega controlada | **Entrega integral** |

Las semanas indican **orden y esfuerzo aproximado**, no fechas calendario. Si EG S.A.S. fija un límite menor, habrá que reducir el alcance o ampliar la capacidad; no eliminar pruebas de permisos, respaldo o integridad para cumplir una fecha.

## 3. Fases detalladas

### F0. Validación funcional y planificación

**Objetivo.** Convertir las decisiones de la conversación en una especificación operable, resolver los puntos que pueden bloquear el desarrollo y definir cómo se comprobará cada entrega.

**Actividades**

1. Revisar `01_DOCUMENTO_MAESTRO_EG_SAS.md` como fuente principal, `06_REQUISITOS_PRUEBAS_Y_PLAN.md` como catálogo de RF/CP y `07_DECISIONES_Y_PENDIENTES.md` como registro de decisiones abiertas.
2. Validar con EG S.A.S. el flujo de novedades normales y críticas, responsables, acceso por propiedad/área y cierre exclusivo del director.
3. Resolver primero las políticas que bloquean implementación: autorrevisión y ausencia del director (PEN-01/02), alcance exacto del Auxiliar de Gerencia (PEN-03), acceso confidencial a novedades internas (PEN-14) y reglas de descarte/duplicados (PEN-13).
4. Definir criterios operativos de prioridad, vencimientos y escalamiento de alertas (PEN-06); acordar categorías y evidencias mínimas por cierre (PEN-12).
5. Definir el volumen inicial de propiedades, áreas, usuarios y archivos (PEN-10), responsables que aprobarán el piloto (PEN-11) y contenido mínimo del informe institucional (PEN-15).
6. Elaborar una matriz de trazabilidad **decisión → requisito funcional → prueba** y priorizar un backlog sin copiar literalmente las 221 reglas históricas como 221 funcionalidades separadas.
7. Identificar dependencias externas: datos institucionales, logos, credenciales, dominio, infraestructura y usuarios piloto.

**Entregables:** alcance validado, matriz de permisos por rol y ámbito, mapa de estados/transiciones, backlog priorizado, política inicial de archivos y acta de decisiones abiertas/resueltas.

**Criterio para cerrar F0:** los responsables de EG S.A.S. validan el flujo y existe una decisión o tratamiento explícito para cada requisito bloqueante. Las decisiones no bloqueantes pueden seguir abiertas con responsable y fecha de resolución.

### F1. Arquitectura, repositorio y entorno de desarrollo

**Objetivo.** Disponer de una base técnica segura y reproducible sobre la que se implementarán los módulos.

**Actividades**

1. Confirmar el stack de referencia: Angular PWA, NestJS, PostgreSQL, monolito modular, Docker Compose y Nginx en VPS. Son tecnologías propuestas en las fuentes; su adopción final se valida aquí.
2. Crear repositorio y estructura de aplicaciones, documentación e infraestructura; acordar convenciones de ramas, commits, PR y revisión de código.
3. Configurar entornos separados de desarrollo y pruebas. No introducir credenciales reales en el repositorio.
4. Inicializar API, frontend, conexión a PostgreSQL, migraciones y datos de ejemplo no sensibles.
5. Incorporar validación automática mínima en CI: formateo, análisis estático, compilación, pruebas y verificación de migraciones.
6. Diseñar modelo inicial de datos para usuarios, roles, propiedades, áreas, categorías, novedades, eventos, actividades, archivos, informes y versiones.
7. Preparar manejo de errores, logs estructurados, identificadores de solicitudes, configuración por entorno y documentación básica de despliegue.

**Entregables:** repositorio inicial, arquitectura documentada, modelo de datos revisado, migración inicial, entornos levantables y pipeline CI ejecutándose.

**Criterio para cerrar F1:** otra persona puede clonar el repositorio, levantar los servicios con instrucciones claras y ejecutar la batería inicial de pruebas sin secretos de producción.

### F2. Autenticación, usuarios, roles, propiedades y áreas

**Objetivo.** Construir el aislamiento de la información antes de permitir reportar novedades.

**Actividades**

1. Implementar inicio y cierre de sesión, hash seguro de contraseñas, control de sesión y manejo de usuarios inactivos.
2. Implementar autorización en el backend por **rol + ámbito + asignación/participación**; ocultar botones en frontend no sustituye esa validación.
3. Registrar propiedades, zonas y coordinadores principales; permitir asignar varios coordinadores autorizados.
4. Registrar áreas internas y responsables sugeribles sin utilizar una propiedad ficticia llamada EG S.A.S.
5. Crear y configurar los perfiles funcionales: Gerencia, Auxiliar de Gerencia, Director, Coordinador y Administrador del sistema.
6. Permitir activar/desactivar usuarios y cambiar sus asignaciones sin borrar los historiales previos.
7. Crear vistas iniciales de usuarios, propiedades, áreas y permisos.

**RF principales:** RF-001 a RF-005 y RF-049.  
**Pruebas base:** CP-02, CP-03 (validación de ámbitos) y pruebas transversales de autorización.

**Entregables:** autenticación, catálogos organizativos, matriz de acceso aplicada, CRUD controlado y pruebas de acceso cruzado.

**Criterio para cerrar F2:** un usuario no puede leer ni modificar propiedades, áreas, archivos o registros fuera de su autorización, incluso realizando solicitudes directas a la API.

### F3. Registro de novedades y asignación mixta

**Objetivo.** Implementar la creación de casos y el paso desde el reporte hasta la asignación formal.

**Actividades**

1. Crear formulario adaptable para novedades de propiedad horizontal y novedades internas; validar que cada caso pertenezca a un único ámbito.
2. Generar identificador único, autor, fecha de creación, categoría, prioridad, ubicación y estado inicial.
3. Configurar categorías por ámbito y criterios de evidencia asociados a ellas.
4. Proponer automáticamente responsable por coordinador principal de propiedad o encargado de área interna.
5. Dejar en revisión los casos que no tengan candidato válido; no asignar usuarios al azar.
6. Permitir únicamente al director confirmar o modificar la asignación principal y justificar reasignaciones posteriores.
7. Registrar eventos de creación, revisión, devolución, asignación y cambio de prioridad.
8. Construir bandejas iniciales: mis novedades, por revisar, asignadas, sin responsable y por ámbito.

**RF principales:** RF-006 a RF-012 y RF-015.  
**Pruebas:** CP-01 a CP-06, CP-08 y CP-17.

**Entregables:** formularios móviles/escritorio, listado y detalle inicial, motor de propuestas de responsable y flujo de estados básicos.

**Criterio para cerrar F3:** funciona el circuito **crear → revisar → confirmar responsable → consultar**, con historial íntegro y sin acceder a casos ajenos.

### F4. Actividades, comentarios, evidencias y auditoría

**Objetivo.** Permitir gestionar el trabajo real que ocurre dentro de una novedad.

**Actividades**

1. Permitir al director y responsable principal crear y asignar actividades a usuarios autorizados.
2. Implementar estados de actividad: pendiente, en curso, bloqueada, completada y cancelada, con motivo obligatorio cuando corresponda.
3. Incorporar fechas previstas y reales, seguimiento, comentarios y menciones con acceso controlado.
4. Permitir adjuntar fotografías, PDF y otros soportes autorizados a novedades o actividades, clasificados como inicial, ejecución, final o soporte.
5. Definir y aplicar política de archivos: tipos permitidos, tamaño máximo, validación del contenido, nombres seguros, cuotas y acceso privado. La elección final entre VPS y servicio externo se resuelve con PEN-07.
6. Registrar eventos de auditoría de modificaciones relevantes, sin permitir la eliminación silenciosa del historial.
7. Implementar una línea de tiempo legible y un detalle de novedad que distinga actividades, evidencias e historial.
8. Probar concurrencia básica: dos personas editando una misma actividad no deben sobrescribir cambios sin control.

**RF principales:** RF-016 a RF-022, RF-026 y RF-048.  
**Pruebas:** CP-09 a CP-11 y pruebas de archivos/permiso.

**Entregables:** tareas con responsables, seguimiento cronológico, adjuntos privados y auditoría de movimientos.

**Criterio para cerrar F4:** una novedad puede contener múltiples actividades y evidencias, con responsables distintos, manteniendo un solo caso principal y un historial verificable.

### F5. Atención crítica, verificación, cierre y notificaciones

**Objetivo.** Completar el ciclo operativo y poner a disposición un **MVP operativo** para validación interna.

**Actividades**

1. Permitir que Gerencia, Dirección y Coordinadores marquen inicialmente una novedad como crítica.
2. Generar aviso inmediato dirigido al director y permitir registrar medidas urgentes por usuarios habilitados antes de la asignación formal.
3. Conservar el cambio posterior de prioridad, su motivo y las actuaciones urgentes ya realizadas.
4. Implementar requisitos de evidencia por categoría (fotografía, documento, descripción u otra regla configurada), con su versión aplicable.
5. Permitir que el responsable principal solicite cierre cuando complete las condiciones exigidas.
6. Permitir exclusivamente al director verificar, cerrar, devolver o reabrir; exigir observaciones o motivo cuando corresponda.
7. Implementar notificaciones dentro de la aplicación para asignación, devolución, menciones, urgencia, solicitud de cierre y vencimiento.
8. Validar y decidir el canal adicional de urgencias (correo, push u otro). No asumir que un aviso dentro de la app garantiza atención inmediata.
9. Verificar trazabilidad del ciclo completo en casos normales y críticos.

**RF principales:** RF-013 a RF-015, RF-023 a RF-028.  
**Pruebas:** CP-07, CP-08 y CP-12 a CP-16.

**Entregables:** flujo completo de caso, configuraciones de evidencia, cierres con control de permisos, reapertura y bandejas/avisos.

**Criterio para cerrar F5:** dos demostraciones completas exitosas —novedad ordinaria y crítica— desde el reporte hasta el cierre por director, incluyendo una devolución, reasignación, evidencias y auditoría. **Hito: MVP operativo listo para piloto interno limitado** (todavía no implica entrega del producto completo).

### F6. Paneles e indicadores operativos

**Objetivo.** Ofrecer seguimiento gerencial basado en datos reales del sistema.

**Actividades**

1. Crear tablero por propiedad, área interna, responsable, categoría, prioridad y estado según autorización.
2. Calcular novedades registradas en el periodo, cerradas durante el periodo, abiertas a la fecha de corte, actividades completadas y tiempos por etapa.
3. Distinguir fecha de creación de fecha de cierre; contemplar casos abiertos de meses anteriores, descartados y reabiertos.
4. Agregar filtros, conteos y vistas de casos atrasados/bloqueados.
5. Documentar fórmulas y reglas de fecha de corte con zona horaria de Colombia y almacenamiento consistente de marcas de tiempo.
6. Validar resultados con ejemplos calculados manualmente y con datos de prueba que atraviesen cambios de mes.

**RF principales:** RF-027, RF-029 y RF-030.  
**Pruebas:** CP-34 y pruebas de fechas/cortes.

**Entregables:** tableros por rol y catálogo de indicadores con definiciones reproducibles.

**Criterio para cerrar F6:** todos los indicadores principales coinciden con una muestra de registros auditables y no cuentan dos veces una novedad por tener varias actividades.

### F7. Informes automáticos, borradores, PDF y Excel

**Objetivo.** Generar documentos útiles a partir de la operación ya registrada.

**Actividades**

1. Generar informes de propiedad, área interna y consolidado general con filtros y periodos autorizados.
2. Incorporar datos automáticos no editables: resumen, novedades, actividades, indicadores y evidencias seleccionables.
3. Implementar campos redactados editables: introducción, observaciones, recomendaciones y comentarios finales.
4. Guardar borradores y permitir actualización **explícita** de datos fuente, conservando los textos preparados por el usuario.
5. Construir vista previa y salida PDF con un único criterio de renderizado; proteger saltos de página, proporciones de imágenes y tablas extensas.
6. Implementar exportación Excel de datos autorizados; no confundirla con la versión oficial del informe en PDF.
7. Verificar documentos de propiedad, internos y consolidados con datos de periodos reales/simulados.

**RF principales:** RF-031 a RF-036 y RF-043.  
**Pruebas:** CP-18 a CP-20, CP-33 y CP-34.

**Entregables:** módulo de elaboración de informes, borradores, vista previa, exportador PDF y Excel, formatos de ejemplo aprobados para revisión funcional.

**Criterio para cerrar F7:** el PDF refleja fielmente el borrador y los cambios en textos no alteran ninguna novedad ni métrica original.

### F8. Plantillas, revisión, aprobación, versiones y distribución

**Objetivo.** Completar el gobierno documental del módulo de informes.

**Actividades**

1. Permitir solo al **administrador** crear, modificar, versionar y publicar la plantilla institucional.
2. Permitir solo al **director** personalizar y publicar configuraciones permitidas de cada propiedad (logo, datos, secciones opcionales); prohibir alterar secciones institucionales obligatorias.
3. Aplicar configuración institucional por defecto si la propiedad no dispone de una personalización publicada.
4. Implementar estados de informe: borrador, en revisión, devuelto y aprobado.
5. Fijar la instantánea de datos, textos, evidencias y versiones de plantilla/configuración al enviar a revisión.
6. Permitir solo al director aprobar o devolver con observaciones. Las condiciones de autorrevisión y ausencia del director deben quedar resueltas en F0.
7. Al aprobar, producir y almacenar el **PDF definitivo inmutable**, con versión, aprobador, fecha e integridad verificable; publicarlo internamente bajo permisos.
8. Permitir correcciones de aprobados solo mediante una nueva versión que exige aprobación; conservar todas las versiones anteriores.
9. Permitir solo al director registrar la **distribución oficial externa** de un PDF aprobado, con destinatario, canal, fecha y versión exacta; primera versión con registro manual de entrega.
10. Proteger descarga y consulta de PDF, anexos y versiones, incluido acceso directo a URL y descargas por usuarios de otra propiedad.
11. Probar múltiples revisiones, sustitución de plantillas, generación concurrente, aprobación simultánea y consistencia entre metadatos y archivo conservado.

**RF principales:** RF-037 a RF-042 y RF-044 a RF-047.  
**Pruebas:** CP-21 a CP-32 y CP-35.

**Entregables:** administración de plantillas, personalización de propiedades, aprobación exclusiva del director, PDF oficial, versiones y registro de entregas.

**Criterio para cerrar F8:** un informe aprobado no cambia después de modificar datos ni plantillas; versiones anteriores siguen accesibles; ningún otro rol puede aprobar ni registrar entrega oficial. **Hito: MVP de informes completo**.

### F9. Pruebas integrales, seguridad, rendimiento y recuperación

**Objetivo.** Comprobar que los flujos están preparados para uso piloto sin sacrificar seguridad ni trazabilidad.

**Actividades**

1. Ejecutar los CP-01 a CP-35 del catálogo documental, registrando evidencia, defectos y resultado de cada uno.
2. Ejecutar pruebas unitarias, de integración, de API y de interfaz para flujos de extremo a extremo.
3. Auditar autorización por rol/ámbito, cambios de identificadores, descargas de archivos, vulnerabilidades de dependencias y validación de adjuntos.
4. Revisar condiciones de concurrencia en cierre, reasignación, aprobación, versiones y distribución.
5. Validar cálculos de indicadores y PDFs extensos en diferentes resoluciones.
6. Probar copias de seguridad y restauración conjunta de PostgreSQL, archivos y configuraciones.
7. Revisar accesibilidad móvil, usabilidad y comportamiento con mala conexión.
8. Decidir expresamente si el MVP incluye captura sin conexión. Si se aprueba, crear un subplan de sincronización, idempotencia, conflictos y pruebas; **no asumirlo implementado por el hecho de usar PWA**.
9. Corregir defectos de severidad alta/crítica y documentar limitaciones conocidas.

**RF principales:** RF-048 a RF-050 y todos los RF según cobertura.  
**Pruebas:** CP-01 a CP-35, pruebas negativas de acceso y restauración.

**Entregables:** matriz de pruebas ejecutadas, reporte de defectos y correcciones, prueba documentada de restauración, revisión de seguridad y versión candidata.

**Criterio para cerrar F9:** no existen fallos críticos ni altos abiertos que afecten seguridad, cierre, integridad de informes, permisos o pérdida de datos. Se demuestra una restauración funcional a partir de un respaldo.

### F10. Despliegue, capacitación y prueba piloto

**Objetivo.** Validar el uso real de EG S.A.S. y dejar el sistema administrable.

**Actividades**

1. Preparar el VPS/entorno de producción con HTTPS, configuración segura, actualizaciones, variables protegidas y respaldos automatizados.
2. Ejecutar migraciones verificadas, configurar almacenamiento privado y habilitar monitoreo/registro de errores.
3. Cargar propiedades, áreas, categorías y usuarios reales autorizados; evitar migrar información sensible sin permiso.
4. Realizar prueba piloto con un conjunto limitado de propiedades, una o más áreas internas y los roles principales.
5. Ejecutar escenarios reales de reporte, asignación, urgencia, seguimiento, cierre, generación/aprobación/distribución de informes.
6. Recoger incidencias, observaciones de usuarios y tiempos de operación; corregir errores prioritarios.
7. Elaborar manuales breves por rol: coordinador, director, Gerencia y administrador.
8. Entregar procedimiento de copias/restauración, actualización, control de cuentas y soporte básico.
9. Preparar acta de aceptación con lo implementado, lo pendiente y las restricciones conocidas.

**Entregables:** despliegue controlado, resultados del piloto, manuales, guía de administración, acta de aceptación y listado de mejoras posteriores.

**Criterio para cerrar F10:** EG S.A.S. ejecuta los flujos acordados con sus usuarios, aprueba formalmente el resultado o deja observaciones trazables y recibe los procedimientos de operación y recuperación.

## 4. Hitos de entrega y alcance mínimo

| Hito | Después de | Se puede demostrar | No implica |
|---|---|---|---|
| H1. Base segura | F2 | Inicio de sesión, propiedades/áreas, permisos y catálogos. | Que ya se puedan cerrar novedades. |
| H2. Novedades registrables | F3 | Creación, clasificación, propuesta y confirmación de responsable. | Seguimiento completo. |
| H3. MVP operativo | F5 | Ciclo normal/crítico, actividades, evidencias, cierre por director y auditoría. | Informes oficiales terminados. |
| H4. Informes elaborables | F7 | Indicadores, borradores, vista previa y PDF/Excel. | Aprobación/versionado oficial. |
| H5. Módulo de informes completo | F8 | Plantillas, aprobaciones, versiones inmutables y entrega registrada. | Producción validada. |
| H6. Producto probado y piloto | F10 | Sistema desplegado, recuperable y validado con usuarios. | Nuevas funcionalidades fuera del alcance. |

**Regla para cambios de alcance:** una función no incluida en este plan —por ejemplo, contabilidad, tesorería, inventario, gestión de mantenimiento preventivo o distribución automática masiva— se registra como solicitud nueva y no se añade silenciosamente a una fase.

## 5. Dependencias y posibles bloqueos

- **F2 depende de F1:** la autorización necesita modelo de datos, autenticación y entornos estables.
- **F3 depende de F2:** una novedad no puede usar asignación mixta ni aislamiento sin usuarios, propiedades y áreas.
- **F4 depende de F3:** una actividad pertenece a una novedad existente.
- **F5 depende de F4 y decisiones de evidencia:** el cierre requiere soportes y auditoría.
- **F6–F7 dependen de datos operativos confiables:** los informes no deben inventar estados ni números.
- **F8 depende de F7 y PEN-01/02:** no se implementa un flujo de aprobación cuya política aún está sin definir.
- **F9–F10 dependen de F1–F8:** las pruebas y el piloto final comprueban un conjunto integrado.

## 6. Lista de verificación para terminar cualquier fase

1. Requisitos y criterios de aceptación de la fase identificados y vinculados a tareas o PR.
2. Código revisado y sin secretos o credenciales reales.
3. Compilación, análisis estático y pruebas correspondientes ejecutados correctamente.
4. Migraciones reproducibles; sin modificaciones manuales de base de datos que no estén documentadas.
5. Autorizaciones verificadas en backend para las funciones incorporadas.
6. Historial/auditoría cuando la fase incluye operaciones sensibles.
7. Pantallas relevantes comprobadas en móvil y escritorio.
8. Documentación técnica, API y cambios de comportamiento actualizados.
9. Demostración funcional con los usuarios correspondientes o registro de aceptación interna.
10. Incidencias y riesgos pendientes anotados, con propietario y prioridad.

No se considerará terminada una fase solo porque la interfaz muestre botones; deben funcionar el API, la persistencia, los controles de acceso y las pruebas básicas correspondientes.

## 7. Backlog técnico por prioridad

**P0 — Obligatorio para un MVP operativo seguro:** autenticación; autorización por ámbitos; propiedades/áreas; creación y estados de novedades; asignación mixta; atención crítica; actividades; carga privada de evidencias; historial; requisitos de cierre por categoría; cierre exclusivo del director; avisos mínimos; respaldo.

**P1 — Obligatorio para completar el alcance de informes confirmado:** tablero; indicadores; borradores automáticos; textos editables; PDF y Excel; plantillas institucionales/configuración por propiedad; revisión y aprobación exclusiva del director; documentos inmutables; versiones; distribución externa registrada solo por director.

**P2 — Mejoras posteriores, sujetas a aprobación:** envíos externos automatizados, editor libre de diseño, firmas digitales certificadas, portal de residentes, mantenimiento preventivo, inventario, sincronización offline avanzada si no se aprueba para el MVP.

Contabilidad y tesorería quedan **excluidas**, no clasificadas como tareas pendientes para esta entrega.

## 8. Organización sugerida para trabajar con agentes de desarrollo

Para cada fase conviene crear una rama o conjunto acotado de historias con estos campos: identificador, objetivo, requisito RF, reglas RN aplicables, cambios permitidos, criterios de aceptación, pruebas, archivos afectados, riesgos y evidencia de finalización.

**Secuencia de trabajo por tarea:** especificar → implementar → probar → revisión independiente → corregir → integrar → demostrar. Un agente implementador no debería darse por aprobado a sí mismo un cambio crítico sin pruebas ni revisión.

Un equipo asistido por IA puede distribuir funciones de análisis, arquitectura, backend, frontend, base de datos, seguridad, pruebas y revisión de código. La autorización de decisiones de negocio, aprobación de cambios y aceptación del producto corresponde a responsables humanos de EG S.A.S.

## 9. Riesgos que se deben vigilar

| Riesgo | Prevención práctica |
|---|---|
| Aumento de alcance por nuevas solicitudes | Backlog separado y aprobación de cambios antes de iniciar una fase. |
| Acceso a informes de otra propiedad | Permisos por ámbito en backend; pruebas de URL y API directas. |
| Atención crítica sin supervisión | Alerta al director, registro de medidas y seguimiento de confirmación. |
| Pérdida de evidencias/PDF | Almacenamiento privado con respaldos y restauración comprobada. |
| Cambios en informes históricos | Instantáneas y archivos inmutables con versión y auditoría. |
| Reportes con cifras inconsistentes | Fórmulas documentadas, fechas de corte y pruebas de reaperturas. |
| Imprecisión de estimaciones | Ajustar tras F0/F1 usando capacidad real y resultados del primer ciclo. |
| Ausencia del director | Política de sustitución formal definida antes de F8 y del piloto. |
| Modo offline subestimado | Decisión explícita; fase adicional si se requiere sincronización real. |

## 10. Decisiones que siguen pendientes

Este documento **no aprueba automáticamente** los puntos PEN-01 a PEN-15 de `07_DECISIONES_Y_PENDIENTES.md`. Son especialmente relevantes para arrancar las siguientes fases:

- **Antes de F2:** permisos exactos del Auxiliar de Gerencia y reglas de acceso a información interna confidencial.
- **Antes de F3/F5:** responsables para cada propiedad/área, criterios de prioridad y evidencias exigibles.
- **Antes de F4:** tamaño, formato, almacenamiento y conservación de adjuntos.
- **Antes de F5:** canales y tiempos de escalamiento de novedades críticas.
- **Antes de F7:** estructura institucional, indicadores obligatorios y datos de prueba de informes.
- **Antes de F8:** autorrevisión y suplencia del director; política de distribución externa de informes internos/consolidados.
- **Antes de F9/F10:** decisión sobre modo offline, volumen esperado, política documental y responsables de aprobación del piloto.

## 11. Próximo paso recomendado

Comenzar por **F0 — Validación funcional y planificación** y convertir las decisiones pendientes en un acta breve. Con eso se puede iniciar F1 sin inventar permisos ni restricciones durante la programación. Posteriormente, organizar F2–F10 como épicas e historias de usuario con dependencias y pruebas.

---

**Nota de trazabilidad:** este cronograma amplía el resumen de implementación ya incluido en `06_REQUISITOS_PRUEBAS_Y_PLAN.md`; no reemplaza el catálogo funcional ni supone que alguna fase haya sido desarrollada o aprobada por EG S.A.S.
