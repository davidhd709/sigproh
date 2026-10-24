# SIGPROH

Sistema de Gestión Operativa para Propiedades Horizontales.

## Estructura inicial

- `apps/web`: aplicación Angular PWA.
- `apps/api`: API NestJS.
- `docs`: documentación del proyecto.
- `.github/workflows`: compilación, publicación de imágenes en GHCR y despliegue por SSH.
- `docker-compose.production.yml`: servicios para el VPS detrás del proxy existente.

## Tecnologías principales

- Angular
- PrimeNG
- Tailwind CSS
- NestJS
- PostgreSQL
- Prisma
- Docker Compose

## Desarrollo y despliegue

La guía de operación local y despliegue continuo está en [`docs/13_CI_CD_GITHUB_VPS.md`](docs/13_CI_CD_GITHUB_VPS.md). El flujo de producción se activa al integrar cambios en `main`; requiere configurar el entorno y secretos de GitHub y preparar el VPS antes del primer despliegue.
