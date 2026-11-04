# syntax=docker/dockerfile:1

# ---------- Etapa 1: build (compila TypeScript) ----------
FROM node:22.12.0-alpine3.21 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
 && npm prune --omit=dev

# ---------- Etapa 2: runtime (ligera, sin devDependencies ni código fuente) ----------
FROM node:22.12.0-alpine3.21 AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

# Usuario sin privilegios incluido en la imagen oficial
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

# node directamente (no npm) para que reciba SIGTERM de Kubernetes
CMD ["node", "dist/index.js"]
