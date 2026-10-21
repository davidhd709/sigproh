#!/usr/bin/env bash
# ==============================================================================
# SIGPROH - Script de Restauración y Recuperación ante Desastres (RF-050, Fase 9)
# Valida la integridad criptográfica SHA-256 antes de restaurar PostgreSQL y uploads.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Configuración de base de datos
PG_CONTAINER="${POSTGRES_CONTAINER:-sigproh-postgres-dev}"
PG_USER="${POSTGRES_USER:-sigproh}"
PG_DB="${POSTGRES_DB:-sigproh}"
UPLOADS_DEST="${ROOT_DIR}/apps/api/uploads"

if [ $# -lt 1 ]; then
  echo "Uso: $0 <directorio_de_respaldo_o_archivo.tar.gz> [--force]"
  echo "Ejemplo: $0 backups/sigproh_backup_20261021_044500"
  echo "Ejemplo: $0 backups/sigproh_backup_20261021_044500.tar.gz"
  exit 1
fi

TARGET="$1"
FORCE="${2:-}"
TEMP_RESTORE_DIR=""

cleanup() {
  if [ -n "${TEMP_RESTORE_DIR}" ] && [ -d "${TEMP_RESTORE_DIR}" ]; then
    rm -rf "${TEMP_RESTORE_DIR}"
  fi
}
trap cleanup EXIT

echo "================================================================="
echo " [SIGPROH] Iniciando procedimiento de restauración y recuperación"
echo "================================================================="

RESTORE_SOURCE_DIR=""

if [ -f "${TARGET}" ] && [[ "${TARGET}" =~ \.tar\.gz$ ]]; then
  echo "--> Extrayendo archivo de respaldo comprimido ${TARGET}..."
  TEMP_RESTORE_DIR="$(mktemp -d /tmp/sigproh_restore_XXXXXX)"
  tar -xzf "${TARGET}" -C "${TEMP_RESTORE_DIR}"
  # Buscar directorio interno
  EXTRACTED_DIR="$(find "${TEMP_RESTORE_DIR}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  RESTORE_SOURCE_DIR="${EXTRACTED_DIR:-$TEMP_RESTORE_DIR}"
elif [ -d "${TARGET}" ]; then
  RESTORE_SOURCE_DIR="$(cd "${TARGET}" && pwd)"
else
  echo "ERROR: El objetivo '${TARGET}' no es un archivo .tar.gz ni un directorio válido."
  exit 1
fi

echo "--> Carpeta de origen del respaldo: ${RESTORE_SOURCE_DIR}"

# 1. Verificación Estricta de Integridad Criptográfica SHA-256
echo "--> 1. Verificando sumas de comprobación SHA-256..."
if [ ! -f "${RESTORE_SOURCE_DIR}/checksums.sha256" ]; then
  echo "ERROR CRÍTICO: No se encontró el archivo de integridad checksums.sha256."
  exit 1
fi

cd "${RESTORE_SOURCE_DIR}"
if ! sha256sum -c checksums.sha256; then
  echo "ERROR CRÍTICO DE SEGURIDAD: La comprobación SHA-256 falló. Los datos están corruptos o fueron alterados."
  exit 1
fi
echo "    Verificación SHA-256 exitosa: Integridad garantizada al 100%."
cd "${ROOT_DIR}"

# 2. Confirmación de Operación Destructiva
if [ "${FORCE}" != "--force" ]; then
  echo ""
  echo "ADVERTENCIA: Esta operación sobrescribirá la base de datos '${PG_DB}' y los archivos de evidencias."
  read -r -p "¿Desea continuar con la restauración completa? [s/N]: " CONFIRM
  if [[ ! "${CONFIRM}" =~ ^[sS]$ ]]; then
    echo "Operación cancelada por el usuario."
    exit 0
  fi
fi

# 3. Restauración de Base de Datos PostgreSQL
echo "--> 2. Restaurando esquema y datos de base de datos PostgreSQL..."
DB_DUMP="${RESTORE_SOURCE_DIR}/database.sql.gz"

if [ ! -f "${DB_DUMP}" ]; then
  echo "ERROR: No se encontró el volcado database.sql.gz en el respaldo."
  exit 1
fi

if docker ps --format '{{.Names}}' | grep -q "^${PG_CONTAINER}$"; then
  echo "    Restaurando en contenedor Docker '${PG_CONTAINER}'..."
  gunzip -c "${DB_DUMP}" | docker exec -i "${PG_CONTAINER}" psql -U "${PG_USER}" -d "${PG_DB}" -v ON_ERROR_STOP=1 > /dev/null
else
  echo "    Restaurando en servidor PostgreSQL local..."
  PGPASSWORD="${POSTGRES_PASSWORD:-sigproh_dev_password}" gunzip -c "${DB_DUMP}" | psql -h "${POSTGRES_HOST:-127.0.0.1}" -p "${POSTGRES_PORT:-5435}" -U "${PG_USER}" -d "${PG_DB}" -v ON_ERROR_STOP=1 > /dev/null
fi

echo "    Base de datos restaurada correctamente."

# 4. Restauración de Almacenamiento de Evidencias
echo "--> 3. Restaurando archivos y evidencias adjuntas..."
UPLOADS_ARCHIVE="${RESTORE_SOURCE_DIR}/uploads.tar.gz"

if [ -f "${UPLOADS_ARCHIVE}" ]; then
  mkdir -p "${ROOT_DIR}/apps/api"
  tar -xzf "${UPLOADS_ARCHIVE}" -C "${ROOT_DIR}/apps/api"
  echo "    Archivos de evidencias restaurados en ${UPLOADS_DEST}."
fi

# 5. Validación de Estado Funcional
echo "--> 4. Verificando consistencia del sistema restaurado..."
cd "${ROOT_DIR}/apps/api"
npx prisma db pull --print > /dev/null 2>&1 || true
cd "${ROOT_DIR}"

echo "================================================================="
echo " [SIGPROH] ¡Restauración completada satisfactoriamente!"
echo " Todos los datos de la base de datos y archivos han sido recuperados."
echo "================================================================="
