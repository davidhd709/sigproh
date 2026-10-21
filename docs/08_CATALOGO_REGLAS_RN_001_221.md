# EG S.A.S. — Catálogo íntegro de reglas de negocio

**Extracto temático del documento maestro v2.2 (15/10/2026).** Las decisiones pendientes y sustituciones se encuentran en `07_DECISIONES_Y_PENDIENTES.md`.

## 19. Registro completo de reglas RN-001 a RN-221

Este catálogo conserva el **historial consolidado y normalizado** de las 221 reglas numeradas durante las definiciones funcionales. No pretende ser una transcripción literal palabra por palabra. Algunas reglas antiguas quedaron precisadas o reemplazadas por decisiones posteriores (véase §18.4); en conflicto, **prevalece la decisión más reciente**. El catálogo RF-001 a RF-050 del §15 es la vista funcional depurada para el equipo de desarrollo.

### RN-001 a RN-030: Registro general, ámbitos y primeros permisos

| Código | Descripción vigente o nota histórica |
|---|---|
| RN-001 | Toda novedad tendrá un identificador único generado automáticamente. |
| RN-002 | Solo roles autorizados podrán registrar novedades: Gerencia, Dirección y Coordinadores (Auxiliar de Gerencia por validar). |
| RN-003 | Toda novedad tendrá ámbito propiedad o gestión interna, con relación exclusiva a una propiedad o un área. |
| RN-004 | Datos mínimos: título, descripción, categoría, ámbito y referencia; sistema guarda fecha y creador. |
| RN-005 | Los usuarios accederán solo a propiedades y áreas autorizadas; Gerencia tiene visibilidad general según política. |
| RN-006 | El director confirma al responsable principal de cada novedad; otros roles pueden solicitar cambios pero no confirmarlos. |
| RN-007 | Cada novedad tendrá un responsable principal vigente y puede tener participantes. |
| RN-008 | Prioridades baja, media, alta o crítica; plazos máximos por configurar. |
| RN-009 | Los usuarios autorizados registran avances, comentarios, fechas, fotos y documentos. |
| RN-010 | Los cambios relevantes se guardan con autor, fecha y valores; no desaparecen silenciosamente. |
| RN-011 | Si existe dependencia externa, se registra motivo y condición de espera. |
| RN-012 | El coordinador o responsable principal solicita cierre; no cierra definitivamente. |
| RN-013 | El director verifica solución y evidencias antes del cierre, según categoría. |
| RN-014 | El director puede devolver el cierre con motivo, preservando historial. |
| RN-015 | Las novedades cerradas no se editan como abiertas; reapertura autorizada deja motivo. |
| RN-016 | Los descartes se conservan con justificación y no se cuentan como soluciones ejecutadas. |
| RN-017 | Informes respetan permisos y filtros de ámbito, propiedad, responsable, estado y periodo. |
| RN-018 | Se excluyen operaciones contables, presupuestos, pagos y tesorería. |
| RN-019 | Se pueden adjuntar cotizaciones como soporte, sin registro de saldos o pagos. |
| RN-020 | Toda novedad conserva historial, aun reasignada, devuelta, reabierta o cerrada. |
| RN-021 | Las novedades de propiedad requieren propiedad válida. |
| RN-022 | Las novedades internas requieren área válida y no llevan propiedad. |
| RN-023 | Las categorías son configurables y se diferencian por ámbito. |
| RN-024 | La visibilidad depende de rol, propiedades y participación en casos internos. |
| RN-025 | Participar en una novedad interna no da acceso a todas las del área. |
| RN-026 | La propuesta temprana concedía asignación a Gerencia/Auxiliar; queda sustituida por confirmación y reasignación principal del director. |
| RN-027 | El director realiza el cierre definitivo en ambos ámbitos. |
| RN-028 | Los informes admiten filtros por ámbito, área, propiedad, responsable, estado y fecha. |
| RN-029 | Correcciones de ámbito requieren autorización y auditoría; no se cambian silenciosamente. |
| RN-030 | Los ámbitos comparten flujo, pero sus indicadores se consultan por separado. |

### RN-031 a RN-044: Asignación mixta

| Código | Descripción vigente o nota histórica |
|---|---|
| RN-031 | Al registrar novedad se intenta sugerir responsable por propiedad o área. |
| RN-032 | La sugerencia no es definitiva hasta confirmación del director. |
| RN-033 | El director puede cambiar el candidato propuesto por otro usuario autorizado. |
| RN-034 | Sin candidato válido, la novedad queda pendiente de asignación. |
| RN-035 | Solo usuarios activos y autorizados pueden ser responsables. |
| RN-036 | Asignaciones y reasignaciones guardan autor, fecha y responsable anterior. |
| RN-037 | Al confirmar asignación se notifica al responsable. |
| RN-038 | Cada novedad tiene un responsable principal vigente y admite participantes autorizados. |
| RN-039 | Solo el director reasigna el responsable principal de una novedad abierta, con motivo. |
| RN-040 | El responsable puede registrar impedimentos sin cerrar o eliminar el caso. |
| RN-041 | El responsable principal puede solicitar cierre; solamente el director lo confirma. |
| RN-042 | El director que devuelve solicitud de cierre registra el motivo y retorna a atención. |
| RN-043 | El sistema calcula duración de etapas a partir de eventos y fechas. |
| RN-044 | No puede asignarse un caso a alguien sin acceso a su propiedad o área. |

### RN-045 a RN-061: Novedades críticas y atención inmediata

| Código | Descripción vigente o nota histórica |
|---|---|
| RN-045 | Casos de prioridad baja, media y alta requieren confirmación antes de atención formal. |
| RN-046 | Casos críticos permiten registrar acciones inmediatas antes de la confirmación del director. |
| RN-047 | Crear novedad crítica genera alerta prioritaria al director correspondiente. |
| RN-048 | Las acciones urgentes guardan actor, fecha, descripción y evidencias disponibles. |
| RN-049 | Solo personal autorizado realiza actuaciones urgentes dentro de sus competencias. |
| RN-050 | El director revisa las acciones urgentes, confirma asignación y define pendientes. |
| RN-051 | Atención inmediata no aprueba compras, contrataciones, pagos o recursos. |
| RN-052 | Cambio de prioridad registra valores anterior y nuevo, motivo y autor. |
| RN-053 | La novedad crítica también necesita verificación y cierre por el director. |
| RN-054 | Los informes pueden identificar críticas, tiempo de respuesta y medidas previas a asignación. |
| RN-055 | Gerencia, director y coordinadores pueden clasificar inicialmente una novedad como crítica. |
| RN-056 | La creación de una crítica dispara notificación inmediata al director. |
| RN-057 | Solo el director cambia formalmente la prioridad y documenta el motivo. |
| RN-058 | Se conserva la prioridad original y cada cambio con fecha y usuario. |
| RN-059 | Bajar prioridad no borra acciones urgentes realizadas. |
| RN-060 | Marcar crítica no habilita automáticamente trabajos técnicos riesgosos ni aprobaciones financieras. |
| RN-061 | Una crítica acepta registros urgentes antes de asignación formal. |

### RN-062 a RN-076: Actividades y seguimiento

| Código | Descripción vigente o nota histórica |
|---|---|
| RN-062 | Una novedad puede contener varias actividades relacionadas con su solución. |
| RN-063 | Toda actividad tiene título, descripción, estado y autor de creación. |
| RN-064 | Una actividad puede tener responsable y fecha prevista. |
| RN-065 | El responsable principal mantiene la responsabilidad general aunque existan participantes. |
| RN-066 | Responsables internos de actividad necesitan acceso; intervenciones externas se documentan por usuario interno. |
| RN-067 | Una actividad puede incluir comentarios, fotos y documentos. |
| RN-068 | Los cambios de estado de actividad quedan en el historial. |
| RN-069 | Actividad bloqueada exige motivo. |
| RN-070 | Actividad cancelada conserva datos y motivo. |
| RN-071 | Completar todas las actividades no cierra automáticamente la novedad. |
| RN-072 | El responsable principal solicita verificación para cerrar. |
| RN-073 | El director puede devolver el caso aunque todas las actividades estén completadas. |
| RN-074 | El historial muestra cambios de prioridad, estados, responsables, actividades y cierre. |
| RN-075 | Usuarios ven y modifican actividades según su autorización. |
| RN-076 | Los informes distinguen novedades de actividades para no duplicar casos. |

### RN-077 a RN-091: Permisos y gestión de actividades

| Código | Descripción vigente o nota histórica |
|---|---|
| RN-077 | Director y responsable principal pueden crear actividades. |
| RN-078 | Ambos pueden asignar actividades a usuarios activos autorizados. |
| RN-079 | El director puede modificar, reasignar o cancelar actividades; registra motivos según corresponda. |
| RN-080 | Responsable principal administra actividades de su novedad sin cambiar el principal del caso. |
| RN-081 | Actividad tiene responsable, descripción, estado y fecha; fecha objetivo cuando corresponda. |
| RN-082 | Responsable de actividad puede actualizarla y adjuntar evidencia. |
| RN-083 | Reasignación de actividad conserva responsable anterior e historial. |
| RN-084 | Director puede consultar actividades de casos bajo su supervisión. |
| RN-085 | Completar actividad no significa por sí solo solucionar novedad. |
| RN-086 | Comentarios y avances guardan fecha, hora y autor. |
| RN-087 | Cambios de estado y responsable generan eventos automáticos. |
| RN-088 | Comentarios pueden mencionar usuarios autorizados y notificarles. |
| RN-089 | Cambios/cancelaciones no borran historial de actividades. |
| RN-090 | Actividades vencidas/bloqueadas aparecen en bandejas de responsable y director. |
| RN-091 | Se distingue fecha objetivo de fecha real de ejecución. |

### RN-092 a RN-101: Evidencias e informes iniciales

| Código | Descripción vigente o nota histórica |
|---|---|
| RN-092 | Las novedades y actividades aceptan fotos y documentos. |
| RN-093 | Archivos se clasifican como evidencia inicial, ejecución, final o soporte. |
| RN-094 | Cada archivo conserva autor, fecha y referencia al caso/actividad. |
| RN-095 | Archivos se consultan solo mediante autorización. |
| RN-096 | Eliminar/sustituir evidencia requiere trazabilidad y restricciones. |
| RN-097 | Informes se generan por ámbito, propiedad, área, responsable, categoría, estado y periodo. |
| RN-098 | Informes se exportan a PDF y Excel conforme al permiso. |
| RN-099 | Indicadores utilizan datos y fechas trazables de novedades/actividades. |
| RN-100 | Las novedades cerradas conservan evidencias, comentarios, actividades e historial. |
| RN-101 | Indicadores cuentan casos sin duplicación por múltiples actividades. |

### RN-102 a RN-108: Criterios de evidencia para cierre

| Código | Descripción vigente o nota histórica |
|---|---|
| RN-102 | Cada categoría tiene requisitos configurables de evidencia de cierre. |
| RN-103 | Requisitos admiten fotos, documentos, resultados redactados o combinaciones. |
| RN-104 | Antes de solicitar cierre se valida el cumplimiento de requisitos configurados. |
| RN-105 | Director verifica solución y suficiencia de evidencias antes de cerrar. |
| RN-106 | Director devuelve con motivo si faltan evidencias o la solución no es suficiente. |
| RN-107 | Cambios de requisitos se auditan y no alteran silenciosamente solicitudes ya iniciadas. |
| RN-108 | Archivos, observaciones y decisiones quedan en historial de cierre. |

### RN-109 a RN-122: Informes e indicadores

| Código | Descripción vigente o nota histórica |
|---|---|
| RN-109 | Hay informes por propiedad, gestión interna y consolidado de Gerencia. |
| RN-110 | Informes se generan desde novedades, actividades, evidencias e historial. |
| RN-111 | Usuario elige periodo y filtros permitidos. |
| RN-112 | Informe por propiedad solo contiene información de propiedad seleccionada. |
| RN-113 | Informe interno solo incluye áreas autorizadas. |
| RN-114 | Usuario elige qué secciones opcionales incluir. |
| RN-115 | Informe presenta estados, actividades realizadas y pendientes. |
| RN-116 | Indicadores usan fecha de registro, ejecución, estado y cierre según cada métrica. |
| RN-117 | Caso puede figurar en informes de varios periodos sin duplicarse en BD. |
| RN-118 | Existe vista previa del informe antes de generarlo. |
| RN-119 | Informe permite PDF y Excel según alcance. |
| RN-120 | Fotos/documentos incluidos respetan acceso del usuario. |
| RN-121 | Informe identifica periodo y fecha de generación. |
| RN-122 | Informes multiámbito o multipropiedad requieren autorización apropiada. |

### RN-123 a RN-140: Elaboración y revisión de informes

| Código | Descripción vigente o nota histórica |
|---|---|
| RN-123 | Informes automáticos usan registros autorizados como fuente de datos. |
| RN-124 | Solo se editan textos habilitados y se seleccionan evidencias sin modificar origen. |
| RN-125 | Indicadores, fechas, estados y datos operativos no son editables desde informes. |
| RN-126 | Cada informe tiene código, periodo, fecha de corte, autor y estado. |
| RN-127 | Los borradores se pueden guardar antes de revisión. |
| RN-128 | Se puede enviar un borrador al director para revisión. |
| RN-129 | La revisión con facultad de devolver o aprobar corresponde exclusivamente al director. |
| RN-130 | Devolución de informe registra motivo, fecha y usuario. |
| RN-131 | Cambios durante elaboración/revisión conservan trazabilidad. |
| RN-132 | Informe aprobado queda protegido ante edición directa. |
| RN-133 | Corrección posterior a aprobación crea nueva versión, preservando la anterior. |
| RN-134 | Cada versión aprobada fija datos/documentos usados. |
| RN-135 | PDF oficial y exportación Excel de datos se descargan según permisos. |
| RN-136 | Solo usuarios autorizados consultan o descargan informes de sus ámbitos. |
| RN-137 | Aprobación registra aprobador y fecha. |
| RN-138 | Informes en revisión o devueltos generan avisos a responsables. |
| RN-139 | Aprobar informe no cambia estados de novedades ni actividades. |
| RN-140 | Actualizar datos de borrador debe ser explícito y respetar textos redactados. |

### RN-141 a RN-160: Aprobación, publicación, versiones y entrega

| Código | Descripción vigente o nota histórica |
|---|---|
| RN-141 | Solo el director puede aprobar informes de cualquiera de los ámbitos. |
| RN-142 | Gerencia, Auxiliar y Coordinadores pueden elaborar informes según autorización. |
| RN-143 | Un informe únicamente puede aprobarse desde estado En revisión. |
| RN-144 | Aprobación conserva usuario, fecha, hora y versión. |
| RN-145 | Director puede devolver informe con observaciones obligatorias. |
| RN-146 | Aprobado queda disponible automáticamente para usuarios internos autorizados. |
| RN-147 | Aprobado no admite modificaciones directas. |
| RN-148 | Corrección posterior crea nueva versión y requiere nueva aprobación. |
| RN-149 | Histórico identifica versión vigente y versiones anteriores. |
| RN-150 | Cada versión aprobada conserva copia fija de datos/contenido. |
| RN-151 | Consulta/descarga restringida por ámbito y permisos. |
| RN-152 | PDF es documento oficial; Excel representa datos exportados para análisis. |
| RN-153 | Distribución se registra sobre informes aprobados; permiso concretado más adelante como exclusivo del director. |
| RN-154 | Distribución apunta a la versión específica entregada. |
| RN-155 | Se registran destinatario, canal, fecha y usuario que distribuye. |
| RN-156 | Distribuir no cambia estados de novedades o actividades. |
| RN-157 | Se preserva trazabilidad de aprobaciones, versiones y entregas. |
| RN-158 | Versiones históricas no se eliminan mediante operaciones habituales. |
| RN-159 | Archivos se protegen por controles de acceso y copias de seguridad. |
| RN-160 | Tiempo de conservación se establecerá según política documental de EG S.A.S. |

### RN-161 a RN-168: Distribución externa exclusiva del director

| Código | Descripción vigente o nota histórica |
|---|---|
| RN-161 | Solo director registra/ejecuta distribución externa oficial. |
| RN-162 | Solo informes aprobados pueden distribuirse oficialmente. |
| RN-163 | Toda distribución vincula versión específica de informe. |
| RN-164 | Distribución registra destinatario, canal, fecha, responsable y observaciones cuando existan. |
| RN-165 | Gerencia, Auxiliar y Coordinadores descargan según permisos, sin función oficial de distribución. |
| RN-166 | Historial de distribuciones se conserva tras nuevas versiones. |
| RN-167 | Aprobación y distribución son acciones diferentes, ambas exclusivas del director. |
| RN-168 | Informes en revisión o borrador no pueden figurar como distribuidos oficialmente. |

### RN-169 a RN-184: Plantillas y PDF

| Código | Descripción vigente o nota histórica |
|---|---|
| RN-169 | Existe plantilla institucional base para informes de EG S.A.S. |
| RN-170 | Plantilla institucional se adapta a informes de propiedad, internos y consolidados. |
| RN-171 | Solo usuarios con permiso institucional modifican plantillas; decisión final: administrador del sistema. |
| RN-172 | Plantilla admite logo, encabezado, pie y secciones predefinidas. |
| RN-173 | Informe incorpora automáticamente datos autorizados del periodo. |
| RN-174 | Usuarios autorizados eligen evidencias y editan secciones de texto habilitadas. |
| RN-175 | Borrador conserva los textos escritos por usuario. |
| RN-176 | La vista previa corresponde al contenido que verá el director al aprobar. |
| RN-177 | El PDF debe distribuir tablas y fotografías en páginas sin cortes inapropiados. |
| RN-178 | Las imágenes mantienen proporción y textos siguen legibles. |
| RN-179 | Informe aprobado conserva versión de plantilla utilizada. |
| RN-180 | Cambiar plantilla no altera informes aprobados anteriores. |
| RN-181 | PDF final identifica código, versión, periodo y fecha correspondiente. |
| RN-182 | PDF almacenado aprobado es el distribuible posteriormente. |
| RN-183 | Editar aprobado exige nueva versión y aprobación. |
| RN-184 | PDF y anexos se conservan en almacenamiento protegido con respaldos. |

### RN-185 a RN-206: Personalización por propiedad

| Código | Descripción vigente o nota histórica |
|---|---|
| RN-185 | Hay plantilla institucional base. |
| RN-186 | Cada propiedad admite configuración particular basada en ella. |
| RN-187 | Personalización de propiedad: logo, identificación y secciones opcionales permitidas. |
| RN-188 | Las configuraciones particulares no suprimen secciones obligatorias. |
| RN-189 | Sin configuración particular se usa la predeterminada institucional. |
| RN-190 | Identificación de la propiedad procede de su registro del sistema. |
| RN-191 | Solo administrador administra plantilla institucional. |
| RN-192 | La configuración por propiedad exige rol del director operativo. |
| RN-193 | Modificación de plantilla/configuración registra autor, fecha y cambios. |
| RN-194 | Plantillas tienen versiones y estado borrador/publicada. |
| RN-195 | Los cambios no sustituyen automáticamente versión publicada; deben publicarse. |
| RN-196 | Informes nuevos usan plantilla y configuración publicadas correspondientes. |
| RN-197 | Cambios de plantilla no alteran aprobados. |
| RN-198 | Borradores pueden actualizar a plantilla más nueva mediante acción explícita. |
| RN-199 | Informes enviados a revisión fijan diseño, datos y textos examinados. |
| RN-200 | Aprobados conservan referencias a versiones de plantilla/configuración usadas. |
| RN-201 | Ocultar imágenes en PDF no borra evidencias de la novedad. |
| RN-202 | Internos y consolidados usan identidad institucional sin propiedad ficticia. |
| RN-203 | Vista previa muestra encabezados, secciones, fotografías y páginas. |
| RN-204 | Generación PDF/Excel aplica permisos de ámbito y acceso. |
| RN-205 | Si faltan datos opcionales, se usa valor alterno razonable o se omite sin inventar. |
| RN-206 | Configurar informe no permite alterar estados, responsables ni indicadores del caso. |

### RN-207 a RN-221: Permisos definitivos de administración y publicación

| Código | Descripción vigente o nota histórica |
|---|---|
| RN-207 | Solo administrador crea, modifica, versiona y publica plantillas institucionales. |
| RN-208 | Director modifica la configuración de informes de propiedades bajo su autorización. |
| RN-209 | Personalización de propiedad se limita a opciones expuestas por plantilla institucional. |
| RN-210 | Director no puede eliminar secciones obligatorias ni editar fórmulas/datos históricos mediante personalización. |
| RN-211 | Propiedad hereda configuración institucional si no tiene una particular válida. |
| RN-212 | Configurar propiedad registra versiones, fecha y usuario. |
| RN-213 | Configuración por propiedad se guarda primero como borrador y la publica el director. |
| RN-214 | Solo configuraciones publicadas se aplican automáticamente a nuevos informes. |
| RN-215 | Actualizar plantilla/configuración no altera informes aprobados ni en revisión. |
| RN-216 | Cada versión de informe conserva qué plantilla/configuración se utilizó. |
| RN-217 | Director es único aprobador de informes de todos los ámbitos. |
| RN-218 | Informe aprobado se publica automáticamente para consulta interna autorizada. |
| RN-219 | Director es único responsable de registrar distribución externa oficial. |
| RN-220 | PDF aprobado y sus datos de aprobación se conservan sin alteración directa. |
| RN-221 | Cambios de administración/publicación de plantillas se auditan. |
