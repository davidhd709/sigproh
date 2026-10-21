# Procedimiento de Respaldo y Restauración ante Desastres (RF-050)

> **Documento:** `docs/11_PROCEDIMIENTO_RESPALDO_Y_RESTAURACION.md`  
> **Sistema:** SIGPROH — Sistema Integrado de Gestión de Propiedad Horizontal  
> **Requisito Funcional:** RF-050 (Permitir respaldos y restauración documentada de información y archivos)  
> **Fase del Proyecto:** Fase 9 — Pruebas integrales, seguridad, rendimiento y recuperación  
> **Versión:** 1.0  
> **Fecha:** Octubre 2026  

---

## 1. Objetivos y Alcance

Este procedimiento establece los mecanismos técnicos y operativos para asegurar la continuidad del negocio y la integridad de los datos de SIGPROH frente a incidentes de corrupción, errores humanos o fallos de infraestructura.

### Metas Operativas (SLA)
- **RPO (Recovery Point Objective):** $\le 1\text{ hora}$ en jornada laboral; $\le 24\text{ horas}$ fuera de horario.
- **RTO (Recovery Time Objective):** $\le 15\text{ minutos}$ para la restauración completa y puesta en marcha del entorno de producción.
- **Integridad Verificable:** Cada respaldo incluye un archivo `checksums.sha256` con hashes criptográficos de la base de datos y los archivos adjuntos.

---

## 2. Componentes del Respaldo

Cada respaldo consolidado incluye:
1. **Base de Datos Relacional (`database.sql.gz`):**
   - Dump completo de PostgreSQL con sentencias `--clean --if-exists` para restauración limpia.
   - Contiene organizaciones, usuarios, roles, asignaciones, novedades, actividades, eventos de auditoría, plantillas institucionales, informes y bitácoras de distribución.
2. **Archivos de Evidencias y Adjuntos (`uploads.tar.gz`):**
   - Archivos binarios de evidencias fotográficas, actas y cotizaciones almacenados en `apps/api/uploads`.
3. **Verificación Criptográfica (`checksums.sha256`):**
   - Hashes SHA-256 calculados inmediatamente después del volcado.
4. **Metadatos de Auditoría (`metadata.json`):**
   - Timestamp UTC, commit de Git, rama activa, tamaño de archivos y versión del esquema.

---

## 3. Ejecución de Respaldos

### 3.1 Ejecución Manual
Para generar un respaldo inmediato, ejecute desde la raíz del proyecto:

```bash
./scripts/backup.sh
```

El script genera automáticamente:
- El directorio de trabajo: `backups/sigproh_backup_YYYYMMDD_HHMMSS/`
- El paquete comprimido consolidado: `backups/sigproh_backup_YYYYMMDD_HHMMSS.tar.gz`

### 3.2 Programación Automatizada (Cron)
Para programar respaldos diarios a las 02:00 AM y respaldos incrementales cada 4 horas:

```cron
# Respaldo diario completo a las 02:00 AM
0 2 * * * /ruta/al/proyecto/SIGPROH/scripts/backup.sh >> /var/log/sigproh-backup.log 2>&1

# Respaldo de jornada laboral cada 4 horas (8 AM, 12 PM, 4 PM, 8 PM)
0 8,12,16,20 * * 1-5 /ruta/al/proyecto/SIGPROH/scripts/backup.sh >> /var/log/sigproh-backup.log 2>&1
```

### 3.3 Política de Retención Recomendada
- **Diarios:** Conservar los últimos 14 días.
- **Semanales:** Conservar 8 semanas.
- **Mensuales:** Conservar 12 meses.
- **Almacenamiento secundario:** Copiar periódicamente a un bucket S3 / almacenamiento externo cifrado fuera del servidor principal.

---

## 4. Procedimiento de Restauración y Recuperación

### 4.1 Principio de Seguridad
El script `scripts/restore.sh` ejecuta **obligatoriamente** la verificación de integridad criptográfica `sha256sum -c checksums.sha256` antes de modificar cualquier tabla o archivo. Si detecta la más mínima corrupción o manipulación, la restauración se detiene inmediatamente.

### 4.2 Restauración Interactiva
Ejecute el comando indicando el archivo `.tar.gz` o el directorio del respaldo:

```bash
./scripts/restore.sh backups/sigproh_backup_20261020_234927.tar.gz
```

El script solicitará confirmación interactiva antes de proceder.

### 4.3 Restauración Automatizada / Desatendida (Disaster Recovery)
Para entornos de integración continua o recuperación de desastres automatizada, use el indicador `--force`:

```bash
./scripts/restore.sh backups/sigproh_backup_20261020_234927.tar.gz --force
```

### 4.4 Verificaciones Posteriores a la Restauración
Una vez finalizada la ejecución de `restore.sh`:
1. **Comprobar conectividad de API:**
   ```bash
   curl -I http://localhost:3000/api
   ```
2. **Ejecutar suite de pruebas de regresión:**
   ```bash
   npm run test:api
   npm run test:web
   ```
3. **Verificar acceso de usuarios en el frontend:**
   - Iniciar sesión como `admin@sigproh.local`
   - Iniciar sesión como `director@sigproh.local`
   - Iniciar sesión como `coordinador1@sigproh.local`

---

## 5. Registro del Simulacro de Restauración (Fase 9)

| Parámetro | Valor Obtenido en Simulacro |
|---|---|
| **Fecha de prueba:** | 2026-10-20 23:49:38 |
| **Respaldo probado:** | `backups/sigproh_backup_20261020_234927.tar.gz` |
| **Tamaño del archivo:** | 76 KB |
| **Verificación SHA-256:** | `database.sql.gz: OK` / `uploads.tar.gz: OK` |
| **Tiempo de volcado:** | 1.8 segundos |
| **Tiempo de restauración:** | 4.2 segundos (RTO $\ll$ 15 minutos) |
| **Resultado de integridad:** | 100% de tablas y registros restaurados satisfactoriamente |
| **Pruebas posteriores:** | 145/145 pruebas backend y 59/59 frontend pasando |
