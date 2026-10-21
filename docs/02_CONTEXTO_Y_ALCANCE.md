# EG S.A.S. — Contexto y alcance

**Extracto temático del documento maestro v2.2 (15/10/2026).** Las decisiones pendientes y sustituciones se encuentran en `07_DECISIONES_Y_PENDIENTES.md`.

## 1. Resumen y propósito

EG S.A.S. requiere una plataforma para **registrar, asignar, atender, supervisar, verificar, cerrar y consultar novedades**. Una novedad es cualquier situación que necesita atención o seguimiento, no solamente un daño técnico. El sistema atenderá dos ámbitos: (a) propiedades horizontales administradas por la empresa y (b) situaciones internas de EG S.A.S.

Actualmente, las novedades pueden quedar repartidas entre WhatsApp, correo, llamadas, fotografías y archivos. Esto dificulta conocer de forma inmediata quién responde por un caso, qué se ha hecho, qué está pendiente y con qué evidencias se cerró. La plataforma reunirá esos datos en un expediente operativo consultable desde computador o celular.

**Propuesta de producto:** aplicación web progresiva (PWA), con acceso por roles y propiedades/áreas autorizadas, estados, actividades, comentarios, archivos, notificaciones, informes PDF y exportaciones Excel. La arquitectura y las tecnologías recogidas más adelante son **propuestas** derivadas de la documentación inicial; todavía deben confirmarse con el equipo de desarrollo.

### 1.1 Principios de diseño

- Un caso conserva su identidad desde el registro hasta el cierre, incluso si cambia de responsable, prioridad o estado.
- La novedad, sus actividades y su historial son objetos relacionados, pero distintos.
- El responsable principal de la novedad es único a la vez; una novedad puede tener múltiples actividades y participantes.
- El director operativo confirma la asignación principal y realiza el cierre definitivo.
- Las novedades críticas admiten registro de atención inmediata antes de la confirmación formal, con aviso al director y trazabilidad.
- El cierre exige evidencias según la categoría configurada y verificación del director.
- El módulo de informes reutiliza los registros existentes; no altera la información original.
- Los permisos restringen **acciones** y **alcance de los datos**; tener una función administrativa no otorga automáticamente acceso a expedientes.
- La plataforma no autoriza ni ejecuta compras, movimientos de dinero, pagos ni comprobaciones financieras.

## 2. Antecedentes y proceso actual (AS-IS)

### 2.1 Situación de partida

En la descripción operativa aportada, EG S.A.S. administra propiedades horizontales y supervisa elementos como ascensores, electrobombas, luminarias, puertas eléctricas, piscinas, jardines, aseo, equipos eléctricos y áreas comunes. La operación se coordina mediante diferentes canales, en especial WhatsApp, llamadas y correo.

### 2.2 Proceso documentado de atención de un daño

| Paso | Acción actual | Interviniente habitual |
|---:|---|---|
| 1 | Inspeccionar la propiedad. | Supervisor/coordinador |
| 2 | Identificar la novedad. | Supervisor/coordinador |
| 3 | Tomar evidencia inicial. | Supervisor/coordinador |
| 4 | Reportar por WhatsApp para revisión. | Coordinador / Dirección Operativa |
| 5 | Solicitar cotización a técnico o proveedor. | Coordinador |
| 6 | Enviar cotización a Dirección. | Coordinador |
| 7 | Solicitar recursos por correo. | Dirección Operativa |
| 8 | Validar disponibilidad de recursos. | Contabilidad |
| 9 | Aprobar o negar el requerimiento financiero. | Contabilidad |
| 10 | Comunicar autorización para continuar. | Dirección Operativa |
| 11 | Entregar recursos autorizados. | Tesorería |
| 12 | Realizar la compra correspondiente. | Coordinador |
| 13 | Coordinar intervención técnica. | Coordinador |
| 14 | Ejecutar instalación o reparación. | Técnico / proveedor |
| 15 | Verificar solución y dar cierre. | Coordinador en el proceso original |

**Aclaración:** este es el proceso *actual descrito en las fuentes*, no el flujo que implementará íntegramente la plataforma. Los pasos contables y de tesorería permanecerán **fuera del sistema**. El cierre digital propuesto pasa a responsabilidad exclusiva del director, conforme a las decisiones posteriores. Tampoco todas las novedades requieren cotizaciones, compras o técnicos.

### 2.3 Problemas a resolver

- Información dispersa y difícil de recuperar.
- Falta de historial único para cada caso.
- Dificultad para ubicar responsable y estado actuales.
- Escasa visibilidad del tiempo transcurrido y de los bloqueos.
- Informes por propiedad que requieren reconstrucción manual.
- Evidencias, cotizaciones y resultados almacenados en diferentes lugares.

## 3. Objetivos, alcance y límites

### 3.1 Objetivo general

Desarrollar una plataforma web progresiva que centralice la gestión de novedades de propiedades horizontales y de áreas internas de EG S.A.S., permitiendo registrarlas, asignarlas, documentar su atención, verificar su solución y generar informes de gestión con trazabilidad.

### 3.2 Objetivos específicos

1. Registrar novedades con categorías, prioridades y datos adecuados al ámbito.
2. Gestionar responsables principales, actividades, estados, observaciones y evidencias.
3. Distinguir la atención ordinaria de las medidas inmediatas en casos críticos.
4. Controlar la verificación y el cierre definitivo por Dirección Operativa.
5. Permitir seguimiento por propiedad, área interna, responsable y periodo.
6. Generar informes automáticos con textos editables, revisión, aprobación, PDF oficial, exportación de datos y control de versiones.
7. Proteger los accesos y conservar historial de cambios, documentos y entregas.

### 3.3 Dentro del alcance funcional

- Autenticación y autorización por roles, propiedades y áreas.
- Usuarios, propiedades, zonas y áreas internas.
- Categorías y criterios de evidencia configurables.
- Novedades, asignación mixta y prioridades, incluida prioridad crítica.
- Actividades y responsables de actividad, comentarios, menciones y adjuntos.
- Estados, seguimiento, auditoría, cierre y reapertura.
- Avisos internos y bandejas de pendientes; mecanismo adicional para urgencias por concretar.
- Tableros operativos con filtros e indicadores.
- Informes por propiedad, internos y consolidados; plantillas y personalización limitada.
- Borradores, revisión y aprobación exclusivamente por el director; publicación interna.
- PDF oficial, Excel para análisis y registro de distribución externa exclusivamente por director.
- Almacenamiento privado, historial, copias de seguridad y recuperación.

### 3.4 Fuera del alcance de la primera versión

- Contabilidad, tesorería, cuentas, saldos, conciliaciones, presupuestos, control de gastos, desembolsos y pagos.
- Autorización financiera de compras, contrataciones y entrega de dinero.
- Inventario y gestión completa de compras/proveedores.
- Programación integral de mantenimiento preventivo.
- Portal de residentes o de terceros externos.
- Editor visual libre de páginas y plantillas al estilo de un procesador de documentos.
- Firmas digitales certificadas, pagos electrónicos y distribución masiva automática.
- Expedientes laborales disciplinarios o datos sensibles que requieran tratamiento especializado.
- Aplicaciones móviles nativas para tiendas de Android/iOS.

**Límite práctico:** registrar una cotización en una novedad significa conservar un soporte operativo, no administrar dinero ni aprobar financieramente su ejecución.

### 3.5 Resultado esperado del proyecto

Una primera versión operativa que pueda usarse en un piloto con usuarios reales, acompañada de especificación, pruebas, manuales básicos y procedimiento de respaldo. **No se afirma que esos entregables ya existan.**
