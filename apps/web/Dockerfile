# Sitio estático: el primer stage reúne los artefactos y Nginx los sirve.
FROM alpine:3.20 AS web-assets
WORKDIR /site
COPY index.html ./
COPY css/ ./css/
COPY js/ ./js/

FROM nginx:alpine AS production
ENV API_UPSTREAM=api-service:3000 \
    NGINX_ENVSUBST_FILTER=^API_UPSTREAM$

COPY --from=web-assets /site/ /usr/share/nginx/html/
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
