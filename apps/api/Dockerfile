FROM node:24-bookworm-slim AS build

RUN apt-get update \
    && apt-get install --no-install-recommends -y openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY . .

WORKDIR /app/apps/api
RUN npx prisma generate --config prisma7.config.ts

WORKDIR /app
RUN npm run build:api

FROM node:24-bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install --no-install-recommends -y openssl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
LABEL org.opencontainers.image.source="https://github.com/davidhd709/sigproh"
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --workspace apps/api --include-workspace-root \
    && npm cache clean --force

COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/prisma7.config.ts ./apps/api/prisma7.config.ts
COPY --from=build /app/apps/api/src/generated/prisma ./apps/api/src/generated/prisma

RUN mkdir -p /data/uploads \
    && chown -R node:node /data

WORKDIR /app/apps/api
VOLUME ["/data/uploads"]
EXPOSE 3000
USER node

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy --config prisma7.config.ts && node dist/main.js"]
