#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 || ! "$1" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Uso: bash deploy-vps.sh <SHA completo del commit>" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f .env.production ]]; then
  echo "Falta ${SCRIPT_DIR}/.env.production. Créalo siguiendo .env.production.example antes del primer despliegue." >&2
  exit 1
fi

export IMAGE_TAG="$1"
COMPOSE=(docker compose --project-name sigproh --env-file .env.production -f docker-compose.production.yml)

"${COMPOSE[@]}" config --quiet
"${COMPOSE[@]}" pull
"${COMPOSE[@]}" up --detach --remove-orphans

deadline=$((SECONDS + 240))
for service in postgres api web; do
  while true; do
    container_id="$("${COMPOSE[@]}" ps --quiet "$service")"
    if [[ -z "$container_id" ]]; then
      echo "No se encontró el contenedor del servicio ${service}." >&2
      "${COMPOSE[@]}" logs --tail=100 "$service" >&2 || true
      exit 1
    fi

    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")"
    if [[ "$health" == healthy ]]; then
      break
    fi
    if [[ "$health" == unhealthy || "$health" == none ]]; then
      echo "El servicio ${service} reportó estado ${health}." >&2
      "${COMPOSE[@]}" logs --tail=100 "$service" >&2 || true
      exit 1
    fi
    if (( SECONDS >= deadline )); then
      echo "Tiempo agotado esperando que ${service} esté saludable." >&2
      "${COMPOSE[@]}" logs --tail=100 "$service" >&2 || true
      exit 1
    fi
    sleep 3
  done
done

echo "SIGPROH está saludable en el commit ${IMAGE_TAG}."
