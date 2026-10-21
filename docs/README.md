# Documentación del Sistema de Gestión de Novedades — EG S.A.S.

**Fecha:** 15 de octubre de 2026  
**Estado:** definición funcional avanzada, pendiente de validación formal.  
**Restricción principal:** sin contabilidad ni tesorería.

## Por dónde empezar

**`01_DOCUMENTO_MAESTRO_EG_SAS.md`** es la especificación completa en un único Markdown. Es el documento principal y contiene todo lo que aparece en los capítulos temáticos.

Para trabajar por partes:

| Archivo | Contenido |
|---|---|
| `02_CONTEXTO_Y_ALCANCE.md` | Problema, proceso actual, alcance y exclusiones. |
| `03_ROLES_Y_OPERACION.md` | Roles, novedades, asignación mixta, atención crítica, actividades y evidencias. |
| `04_INFORMES_Y_PLANTILLAS.md` | Informes automáticos, PDF/Excel, aprobación exclusiva del director, distribución, plantillas y versiones. |
| `05_PANTALLAS_DATOS_ARQUITECTURA.md` | Navegación, entidades, relaciones, arquitectura y requisitos no funcionales. |
| `06_REQUISITOS_PRUEBAS_Y_PLAN.md` | Catálogo de 50 requisitos funcionales, 35 escenarios de prueba y plan de implementación. |
| `07_DECISIONES_Y_PENDIENTES.md` | 15 decisiones confirmadas, ajustes y cuestiones todavía sin resolver. |
| `08_CATALOGO_REGLAS_RN_001_221.md` | Registro histórico normalizado de las 221 reglas numeradas durante el diseño. |
| `09_FUENTES_GLOSARIO_Y_CAMBIOS.md` | Glosario, fuentes aportadas y control de versiones documentales. |
| `10_FASES_DE_DESARROLLO.md` | Plan detallado F0–F10 con cronograma indicativo, dependencias, entregables, pruebas e hitos de aceptación. |

## Qué se ha confirmado

Novedades para propiedades e internas; reportes por Gerencia, director y coordinadores; asignación mixta con confirmación del director; atención inmediata en casos críticos; director como único responsable del cierre, aprobación de informes y distribución externa; evidencias configurables por categoría; informes automáticos con textos editables; plantilla institucional administrada por administrador y personalización por propiedad gestionada por director.

## Lo que falta

Las políticas abiertas se detallan en la sección 18 del documento maestro. Deben validarse antes de que un agente de programación convierta todo en reglas rígidas. En particular: autorrevisión del director, ausencias, permisos del Auxiliar de Gerencia, retención documental, almacenamiento y alertas.

## Origen

El documento se redactó a partir de las decisiones tomadas durante el diseño y de los cuatro archivos de contexto entregados por el usuario. No implica que EG S.A.S. haya aprobado formalmente un producto ni que exista un sistema implementado.

## Plan de fases

Para organizar el trabajo técnico y preparar las tareas para agentes de desarrollo, consultar `10_FASES_DE_DESARROLLO.md`. Su estimación orientativa de 19 semanas no sustituye los cronogramas académicos ni constituye compromiso de entrega.
