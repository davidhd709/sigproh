# CI/CD: entorno local, GitHub y VPS

## Flujo

1. Los cambios se desarrollan y validan en la máquina local.
2. Cada pull request hacia `main` instala dependencias, genera el cliente Prisma y compila API y frontend.
3. Al subir cambios a `main`, GitHub Actions construye las imágenes Docker y las publica en GitHub Container Registry (GHCR) con el SHA completo del commit.
4. El workflow se conecta por SSH al VPS, copia el archivo Compose y el script de despliegue, descarga las imágenes, aplica migraciones Prisma y espera a que PostgreSQL, API y frontend estén saludables.
5. El proxy inverso que ya existe en el host apunta a `http://127.0.0.1:8080`.

Las imágenes se nombran `ghcr.io/davidhd709/sigproh-api` y `ghcr.io/davidhd709/sigproh-web`. Cada despliegue usa una etiqueta inmutable con el SHA del commit. La compilación de CI no ejecuta pruebas; las pruebas del proyecto deben incorporarse a la política del equipo antes de hacerlas requisito de integración.

## Requisitos del VPS

- Linux con Docker Engine y Docker Compose v2.
- SSH accesible desde los runners hospedados de GitHub.
- Un usuario de despliegue con acceso SSH y permisos para ejecutar Docker.
- Espacio persistente para imágenes, la base PostgreSQL, evidencias y respaldos.
- El proxy existente debe enviar tráfico HTTP al puerto `8080` del host, conservar `Host` y `X-Forwarded-Proto` y permitir peticiones de hasta 20 MB.
- El puerto `8080` se publica solo en `127.0.0.1`; no abrirlo públicamente en el firewall.

Si el proxy está dentro de otro contenedor, no apuntará a `127.0.0.1` del host como un proxy instalado en el host: habrá que conectar ambos servicios a una red Docker común o adaptar el enlace de Compose.

## Preparar el VPS

El repositorio contiene configuración de ejemplo, no secretos de producción. Crea una carpeta de despliegue que pertenezca al usuario SSH, por ejemplo `/opt/sigproh`, y configura allí `.env.production` antes de activar el despliegue.

```bash
sudo mkdir -p /opt/sigproh
sudo chown USUARIO_SSH:USUARIO_SSH /opt/sigproh
cd /opt/sigproh
cp .env.production.example .env.production
chmod 600 .env.production
```

En `.env.production`, reemplaza ambos valores de ejemplo con valores únicos. Puedes generar valores hexadecimales con `openssl rand -hex 32`; usa uno para la contraseña de PostgreSQL y otro para `JWT_ACCESS_SECRET`. La contraseña hexadecimal evita caracteres que requerirían codificación en `DATABASE_URL`.

La primera ejecución del workflow copia `.env.production.example` al VPS junto con Compose y el script, pero no crea ni modifica `.env.production`. Si aún no has preparado ese archivo, el despliegue debe fallar de forma explícita.

El puerto, usuario y base de PostgreSQL no se publican en el host. Los datos de PostgreSQL viven en el volumen `sigproh_postgres_data`; las evidencias viven en `sigproh_uploads_data` bajo `/data/uploads` dentro del contenedor API.

## Configurar GitHub

En el repositorio `davidhd709/sigproh`, crea un Environment llamado `production`. Añade estos secretos al Environment:

| Secreto | Valor |
|---|---|
| `VPS_HOST` | Dominio o IP pública del VPS. |
| `VPS_USER` | Usuario SSH de despliegue. |
| `VPS_SSH_PORT` | Puerto SSH numérico. |
| `VPS_SSH_PRIVATE_KEY` | Clave privada dedicada para este deploy, en formato OpenSSH. |
| `VPS_KNOWN_HOSTS` | Línea `known_hosts` verificada para el host y puerto SSH. |
| `VPS_DEPLOY_PATH` | Ruta absoluta del despliegue, por ejemplo `/opt/sigproh`. |
| `GHCR_USERNAME` | Usuario de GitHub que tiene acceso de lectura a los paquetes. |
| `GHCR_READ_TOKEN` | PAT con alcance `read:packages`; no requiere acceso de escritura. |

Verifica la huella SSH del VPS por un canal confiable antes de guardar `VPS_KNOWN_HOSTS`; el workflow exige `StrictHostKeyChecking=yes` y no acepta claves de host desconocidas. Mantén la clave privada y el token únicamente en los secretos del Environment. El workflow usa `GITHUB_TOKEN` con permiso `packages: write` para publicar imágenes.

Si se configuran reglas de aprobación en el Environment, el despliegue esperará a que se apruebe el job. Sin reglas de aprobación, una actualización integrada en `main` se despliega automáticamente.

## Operación diaria

```bash
# Levantar los servicios de desarrollo
docker compose up -d

# Instalar dependencias y compilar localmente
npm ci
(cd apps/api && npx prisma generate --config prisma7.config.ts)
npm run build:api
npm run build:web

# Subir una rama y abrir un pull request hacia main
git push -u origin MI-RAMA
```

Tras integrar el pull request, GitHub Actions publica y despliega el commit de `main`. Un fallo en la compilación bloquea la publicación. Un fallo en la conexión SSH, una configuración ausente o un servicio no saludable deja el job como fallido para que pueda diagnosticarse desde la salida de Actions y los logs de Compose.

En el VPS, los comandos operativos básicos son:

```bash
cd /opt/sigproh
docker compose --project-name sigproh --env-file .env.production -f docker-compose.production.yml ps
docker compose --project-name sigproh --env-file .env.production -f docker-compose.production.yml logs --tail=100 api
```

Para regresar a una versión anterior, identifica el SHA del último despliegue saludable y vuelve a ejecutar `bash ./deploy-vps.sh SHA_COMPLETO`. Las migraciones de base de datos no se revierten automáticamente; antes de restaurar una versión antigua, verifica compatibilidad de esquema y restaura una copia si hace falta.

## Respaldos y recuperación

Los volúmenes de Docker sobreviven a la recreación de contenedores, pero no protegen contra pérdida del VPS, disco o credenciales. El pipeline no elimina los volúmenes ni configura un respaldo fuera del servidor. Antes de usar datos reales, establece un respaldo periódico de PostgreSQL y `/data/uploads`, guarda una copia fuera del VPS y ensaya su restauración. El script `scripts/backup.sh` actual corresponde al entorno local de desarrollo y no debe usarse como respaldo de producción sin adaptarlo al proyecto Compose `sigproh` y a los volúmenes de producción.
