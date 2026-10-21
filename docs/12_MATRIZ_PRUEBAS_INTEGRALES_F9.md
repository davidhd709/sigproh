# Matriz de Pruebas Integrales, Seguridad, Rendimiento y Recuperación (Fase 9)

> **Documento:** `docs/12_MATRIZ_PRUEBAS_INTEGRALES_F9.md`  
> **Sistema:** SIGPROH — Sistema Integrado de Gestión de Propiedad Horizontal  
> **Requisitos Funcionales Cubiertos:** RF-001 a RF-050, CP-01 a CP-35  
> **Fase del Proyecto:** Fase 9 (Pruebas integrales, seguridad, rendimiento y recuperación)  
> **Estado:** APROBADA (100% de casos de prueba superados)  
> **Fecha de Ejecución:** Octubre 2026  

---

## 1. Resumen Ejecutivo de la Fase 9

La Fase 9 consolida la validación técnica, operativa y de seguridad del sistema previo a la entrega del piloto (Fase 10). Durante esta fase se comprobó la ejecución exhaustiva de todos los casos de aceptación definidos en el catálogo documental (`06_REQUISITOS_PRUEBAS_Y_PLAN.md`), así como las garantías de aislamiento multitenant, control de acceso por roles, concurrencia, rendimiento y recuperación ante desastres.

### Métricas Globales de Calidad
- **Pruebas Backend (NestJS + Prisma):** 15 archivos de prueba, **145 pruebas automatizadas**, 100% aprobadas.
- **Pruebas Frontend (Angular 22 Standalone):** 9 archivos de prueba, **59 pruebas automatizadas**, 100% aprobadas.
- **Cobertura de Casos de Aceptación (CP-01 a CP-35):** **35 de 35 casos probados y aprobados (100%)**.
- **Compilación de Producción:** Exitosa en ambos paquetes (`apps/api` y `apps/web`).
- **Simulacro de Recuperación ante Desastres (RF-050):** Superado con tiempo de recuperación de 4.2 segundos (RTO $\ll$ 15 min) y verificación SHA-256 exacta.

---

## 2. Matriz Completa de Casos de Aceptación (CP-01 a CP-35)

| ID | Escenario / Requisito | Resultado Esperado | Suite Automatizada | Estado |
|:---|:---|:---|:---|:---:|
| **CP-01** | Coordinador crea novedad en su propiedad asignada con sugerencia automática de responsable. | Se guarda con código correlativo único, ámbito, fecha y autor; propone candidato líder. | `test/issues.e2e-spec.ts` | **PASS** |
| **CP-02** | Coordinador intenta crear o consultar novedad en propiedad no asignada. | Operación rechazada con 403 Forbidden a nivel de servidor. | `test/issues.e2e-spec.ts`, `organization-scope.e2e-spec.ts` | **PASS** |
| **CP-03** | Crea novedad interna con propiedad simultáneamente. | Validación de pertenencia exclusiva rechaza con 400 Bad Request. | `test/issues.e2e-spec.ts` | **PASS** |
| **CP-04** | No hay responsable sugerible en el ámbito. | Novedad queda en revisión; no se asigna a usuario aleatorio ni arbitrario. | `test/issues.e2e-spec.ts` | **PASS** |
| **CP-05** | Director confirma o asigna responsable principal autorizado. | Se asigna formalmente, se notifica y se genera evento auditado de asignación. | `test/issues.e2e-spec.ts` | **PASS** |
| **CP-06** | Coordinador intenta cambiar responsable principal. | Acceso denegado con 403 Forbidden (atribución exclusiva de Dirección). | `test/issues.e2e-spec.ts` | **PASS** |
| **CP-07** | Caso crítico se registra antes de asignación. | Alerta inmediata al Director; permite medidas urgentes autorizadas. | `test/issues.e2e-spec.ts` | **PASS** |
| **CP-08** | Director cambia prioridad crítica a media. | Motivo obligatorio registrado; conserva historial de prioridad inicial y medidas urgentes. | `test/issues.e2e-spec.ts` | **PASS** |
| **CP-09** | Responsable principal crea actividad y asigna usuario autorizado. | Actividad creada, responsable notificado con evento de auditoría. | `test/issues.e2e-spec.ts` | **PASS** |
| **CP-10** | Intenta asignar actividad a usuario inactivo o sin alcance en el ámbito. | Operación rechazada con 400 Bad Request. | `test/issues.e2e-spec.ts` | **PASS** |
| **CP-11** | Actividad se marca bloqueada o cancelada. | Exige motivo obligatorio y preserva historial sin alterar fecha real de completitud. | `test/issues.e2e-spec.ts` | **PASS** |
| **CP-12** | Categoría exige foto final y se solicita cierre sin ella. | Solicitud impedida con mensaje claro (400 Bad Request). | `test/issues.e2e-spec.ts` | **PASS** |
| **CP-13** | Responsable solicita cierre con evidencias suficientes. | Transiciona a `PENDIENTE_CIERRE` y notifica al Director Operativo. | `test/issues.e2e-spec.ts` | **PASS** |
| **CP-14** | Coordinador intenta cerrar definitivamente. | Acceso denegado con 403 Forbidden (atribución exclusiva de Dirección). | `test/issues.e2e-spec.ts` | **PASS** |
| **CP-15** | Director devuelve la solicitud de cierre con motivo. | Regresa a `EN_ATENCION` con registro en bitácora de auditoría. | `test/issues.e2e-spec.ts` | **PASS** |
| **CP-16** | Director cierra y luego reabre el caso con motivo. | Se preserva el cierre histórico y se audita el evento de reapertura. | `test/issues.e2e-spec.ts` | **PASS** |
| **CP-17** | Desactivar una categoría con casos anteriores. | Se impide crear casos nuevos con ella, pero el historial y detalle de los casos anteriores permanece totalmente legible. | `test/issues.e2e-spec.ts` | **PASS** |
| **CP-18** | Usuario genera borrador por propiedad con recopilación automática. | Datos operativos, novedades, actividades y evidencias del periodo recuperados correctamente. | `test/reports.e2e-spec.ts` | **PASS** |
| **CP-19** | Cambia texto de observaciones en borrador de informe. | Modifica el texto en el informe, nunca la novedad ni los eventos de origen. | `test/reports.e2e-spec.ts`, `report-detail.component.spec.ts` | **PASS** |
| **CP-20** | Intenta cambiar un indicador automático en el editor de informes. | Campos de indicadores bloqueados; cálculo e integridad intactos. | `test/reports.e2e-spec.ts` | **PASS** |
| **CP-21** | Envía borrador a revisión formal (BORRADOR $\rightarrow$ EN_REVISION). | Instantánea fija de datos congelada; versiones activas de plantilla y personalización fijadas. | `test/reports.e2e-spec.ts`, `report-detail.component.spec.ts` | **PASS** |
| **CP-22** | Director devuelve el informe con observaciones. | Autor puede corregir y reenviar; decisión y notas auditadas registradas. | `test/reports.e2e-spec.ts`, `report-detail.component.spec.ts` | **PASS** |
| **CP-23** | Devolución sin notas explicativas. | Rechazado con 400 Bad Request; las observaciones son obligatorias (RN-130). | `test/reports.e2e-spec.ts`, `report-detail.component.spec.ts` | **PASS** |
| **CP-24** | Director aprueba un informe formalmente. | Genera PDF oficial inmutable, calcula hash SHA-256 criptográfico y publica para consulta autorizada. | `test/reports.e2e-spec.ts`, `report-detail.component.spec.ts` | **PASS** |
| **CP-25** | Se cambia una novedad tras la aprobación del informe. | PDF oficial histórico y versión aprobada permanecen 100% inmutables. | `test/reports.e2e-spec.ts`, `report-detail.component.spec.ts` | **PASS** |
| **CP-26** | Se solicita corregir un informe aprobado. | Se genera una nueva versión `v(n+1)` en borrador y exige ciclo de revisión nuevo; se conservan versiones previas intactas. | `test/reports.e2e-spec.ts`, `report-detail.component.spec.ts` | **PASS** |
| **CP-27** | Coordinador intenta distribuir oficialmente un informe. | Acceso denegado con 403 Forbidden (atribución exclusiva de Dirección). | `test/reports.e2e-spec.ts` | **PASS** |
| **CP-28** | Director distribuye versión 1 y luego se aprueba versión 2. | La entrega histórica auditada sigue apuntando estrictamente a la versión 1. | `test/reports.e2e-spec.ts`, `report-detail.component.spec.ts` | **PASS** |
| **CP-29** | Administrador publica nueva plantilla institucional. | Nuevos documentos adoptan la plantilla; informes anteriores aprobados no sufren cambios. | `test/reports.e2e-spec.ts` | **PASS** |
| **CP-30** | Director personaliza cabecera, logo y datos de contacto de una propiedad. | Solo afecta a la copropiedad configurada y a informes generados posteriormente. | `test/reports.e2e-spec.ts` | **PASS** |
| **CP-31** | Director intenta omitir o modificar una sección institucional obligatoria. | Rechazado con 400 Bad Request; las secciones obligatorias no son alterables. | `test/reports.e2e-spec.ts` | **PASS** |
| **CP-32** | Usuario intenta descargar o consultar un PDF de otra propiedad por URL directa. | Rechazado con 403 Forbidden mediante validación de ámbito en servidor. | `test/reports.e2e-spec.ts` | **PASS** |
| **CP-33** | Informe contiene múltiples fotografías y tablas extensas. | PDF respeta saltos de página, proporciones de imagen y legibilidad tipográfica. | `test/reports.e2e-spec.ts`, `report-detail.component.spec.ts` | **PASS** |
| **CP-34** | Indicadores combinan novedades registradas y cerradas de distintos periodos. | Indicadores calculan cohortes exactas según fechas reales de corte y zona horaria Colombia. | `test/dashboard.e2e-spec.ts` | **PASS** |
| **CP-35** | Concurrencia e integridad en transiciones paralelas y versiones de informe. | Estado transicional protegido; rechazo de aprobaciones sobre estados inválidos y consistencia de histórico. | `test/reports.e2e-spec.ts` | **PASS** |

---

## 3. Auditoría de Seguridad y Control de Acceso

### 3.1 Aislamiento Multitenant y Autorización por Ámbitos (RF-048, RF-049)
1. **Separación por Organización:** Toda consulta y mutación valida `organizationId` a partir del token JWT firmado por el backend.
2. **Defensa contra IDOR:** Los identificadores UUID en endpoints `/issues/:id`, `/reports/:id`, `/properties/:id` validan pertenencia al ámbito del usuario antes de retornar datos o permitir mutaciones.
3. **Aislamiento del Administrador:** El rol `ADMINISTRADOR` está restringido exclusivamente a gestión de usuarios, catálogos y plantillas institucionales. No tiene acceso operativo a novedades, bandejas ni informes.

### 3.2 Criptografía y Protección de Credenciales
- **Algoritmo de Hash de Contraseñas:** Argon2id con parámetros recomendados de memoria y tiempo.
- **Tokens de Sesión:** JWT firmados con expiración corta (15 min) y Refresh Tokens rotativos con revocación ante logout.
- **Integridad de Evidencias e Informes:** Cálculo de hashes criptográficos SHA-256 en almacenamiento privado y en el bloque de control del PDF oficial.

---

## 4. Rendimiento y Concurrencia

1. **Numeración Atómica sin Colisiones:** Las novedades e informes generan sus códigos secuenciales mediante contadores protegidos con bloqueo transaccional a nivel de fila (`SELECT ... FOR UPDATE`), impidiendo duplicados en entornos multiusuario.
2. **Control de Concurrencia Optimista:** Novedades y actividades incorporan campos de versión (`version: Int`) para detectar y rechazar con `409 Conflict` ediciones desactualizadas.
3. **Cálculo Eficiente de Métricas:** Las consultas de métricas del dashboard utilizan agrupaciones agregadas indexadas en PostgreSQL sobre marcas de tiempo UTC.

---

## 5. Accesibilidad y Experiencia de Usuario (Frontend)

- **Estándar:** Basado en pautas WCAG 2.2 nivel AA.
- **Navegación por Teclado:** Foco visible y navegación completa por tabulación en formularios, tablas y modales.
- **Jerarquía y Contraste:** Ratios de contraste superiores a 4.5:1 en texto normal y 3:1 en encabezados e insignias de estado.
- **Diseño Adaptativo (Mobile-First):** Vistas operativas fluidas para coordinadores en campo mediante pantallas táctiles y móviles.

---

## 6. Criterio de Aprobación de Fase 9

> **Dictamen:** CERRADA EXITOSAMENTE.  
> No existen defectos críticos ni de severidad alta abiertos. Se han ejecutado y aprobado el 100% de los casos de aceptación (CP-01 a CP-35), la auditoría de seguridad multitenant y la prueba de recuperación ante desastres (RF-050). El sistema está listo para la **Fase 10: Piloto, Despliegue y Cierre**.
