#!/usr/bin/env bash
# ==============================================================================
# SIGPROH - Script de Respaldo Automatizado (RF-050, Fase 9)
# Respalda la base de datos PostgreSQL y los archivos persistentes de evidencias.
# Genera sumas de comprobación criptográficas SHA-256 y metadatos de auditoría.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_BASE_DIR="${ROOT_DIR}/backups"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
BACKUP_NAME="sigproh_backup_${TIMESTAMP}"
BACKUP_DIR="${BACKUP_BASE_DIR}/${BACKUP_NAME}"

# Configuración de base de datos
PG_CONTAINER="${POSTGRES_CONTAINER:-sigproh-postgres-dev}"
PG_USER="${POSTGRES_USER:-sigproh}"
PG_DB="${POSTGRES_DB:-sigproh}"
UPLOADS_SRC="${ROOT_DIR}/apps/api/uploads"

echo "================================================================="
echo " [SIGPROH] Iniciando procedimiento de respaldo: ${TIMESTAMP}"
echo "================================================================="

mkdir -p "${BACKUP_DIR}"

# 1. Respaldo de Base de Datos PostgreSQL
echo "--> 1. Extrayendo volcado de base de datos PostgreSQL (${PG_DB})..."
DB_DUMP_FILE="${BACKUP_DIR}/database.sql.gz"

if docker ps --format '{{.Names}}' | grep -q "^${PG_CONTAINER}$"; then
  echo "    Usando contenedor Docker: ${PG_CONTAINER}"
  docker exec -t "${PG_CONTAINER}" pg_dump -U "${PG_USER}" -d "${PG_DB}" --clean --if-exists | gzip -9 > "${DB_DUMP_FILE}"
else
  echo "    Contenedor no detectado, intentando pg_dump local (puerto 5435/5432)..."
  PGPASSWORD="${POSTGRES_PASSWORD:-sigproh_dev_password}" pg_dump -h "${POSTGRES_HOST:-127.0.0.1}" -p "${POSTGRES_PORT:-5435}" -U "${PG_USER}" -d "${PG_DB}" --clean --if-exists | gzip -9 > "${DB_DUMP_FILE}"
fi

DB_SIZE=$(du -h "${DB_DUMP_FILE}" | cut -f1)
echo "    Base de datos respaldada exitosamente (${DB_SIZE})."

# 2. Respaldo de Almacenamiento de Evidencias y Archivos
echo "--> 2. Empaquetando almacenamiento de archivos y evidencias..."
UPLOADS_ARCHIVE="${BACKUP_DIR}/uploads.tar.gz"

if [ -d "${UPLOADS_SRC}" ] && [ "$(ls -A "${UPLOADS_SRC}" 2>/dev/null)" ]; then
  tar -czf "${UPLOADS_ARCHIVE}" -C "${ROOT_DIR}/apps/api" uploads
  UPLOADS_SIZE=$(du -h "${UPLOADS_ARCHIVE}" | cut -f1)
  echo "    Archivos de evidencias respaldados (${UPLOADS_SIZE})."
else
  echo "    Directorio de uploads vacío o no inicializado. Creando archivo vacío de referencia."
  tar -czf "${UPLOADS_ARCHIVE}" --files-from /dev/null
fi

# 3. Cálculo de Hashes Criptográficos SHA-256 de Integridad
echo "--> 3. Calculando sumas de verificación criptográfica SHA-256..."
cd "${BACKUP_DIR}"
sha256sum database.sql.gz uploads.tar.gz > checksums.sha256
cd "${ROOT_DIR}"

# 4. Generación de Metadatos de Auditoría
echo "--> 4. Generando metadatos de auditoría del respaldo..."
GIT_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"

cat <<EOF > "${BACKUP_DIR}/metadata.json"
{
  "backupName": "${BACKUP_NAME}",
  "timestamp": "${TIMESTAMP}",
  "createdAt": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "database": {
    "name": "${PG_DB}",
    "user": "${PG_USER}",
    "dumpFile": "database.sql.gz",
    "size": "${DB_SIZE}"
  },
  "uploads": {
    "archiveFile": "uploads.tar.gz"
  },
  "git": {
    "commit": "${GIT_COMMIT}",
    "branch": "${GIT_BRANCH}"
  },
  "integrity": {
    "checksumFile": "checksums.sha256"
  }
}
EOF

# 5. Empaquetado Final del Respaldo
echo "--> 5. Consolidando archivo de distribución del respaldo..."
cd "${BACKUP_BASE_DIR}"
tar -cf "${BACKUP_NAME}.tar" "${BACKUP_NAME}"
gzip -9 -f "${BACKUP_NAME}.tar"
TOTAL_SIZE=$(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)
cd "${ROOT_DIR}"

echo "================================================================="
echo " [SIGPROH] Respaldo finalizado con éxito."
echo " Archivo final: ${BACKUP_BASE_DIR}/${BACKUP_NAME}.tar.gz (${TOTAL_SIZE})"
echo " Directorio inspeccionable: ${BACKUP_DIR}"
echo "================================================================="
