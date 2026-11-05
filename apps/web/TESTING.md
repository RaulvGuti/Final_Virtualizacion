# KubeLab — plan, pruebas ejecutadas y resultados

**Fecha de preparación:** 4 de noviembre de 2026 (hora de Guatemala). Las pruebas locales de esta entrega se realizaron en un contenedor Linux de trabajo, **no** en Proxmox/K3s real.

## Comandos para repetir

Desde `apps/web`:

```bash
python -m unittest discover -s tests -p 'test_*.py' -v
node --check js/app.js
node --check js/config.js

# Extras: Python `playwright` + Chromium instalado
python tests/browser_smoke.py

# Extras: Nginx + envsubst instalados en Linux
python tests/nginx_integration.py

# Extras: pip install pyyaml
python tests/check_manifests.py
```

El workflow GitHub Actions instala Playwright y Chromium, ejecuta pruebas de API/UI y hace `docker build` real en runner de GitHub (no se ha ejecutado GitHub Actions en esta conversación).

## Resultados realmente observados en preparación

| Prueba | Resultado | Qué se probó |
|---|---|---|
| Suite `unittest` mock API | **5/5 OK** | Listar/consultar, POST/PUT/DELETE, 404, 400, assets y salud |
| Chromium automatizado Playwright | **9 comprobaciones OK** | UI HTML/JS, listado, moneda, búsqueda, crear, editar, borrar, validar, 503, desconexión, móvil |
| Nginx nativo 1.26 `nginx -t` | **OK** | Sintaxis con `envsubst` sin tocar `/etc/nginx` |
| Nginx + API HTTP con proxy real | **OK** | `/`, `/css`, `/js`, `/healthz`, `/health`, GET/POST `/api`, 404 y SPA fallback |
| Node.js `--check` | **OK** | Sintaxis de `js/config.js` y `js/app.js` |
| PyYAML | **OK** | Sintaxis de cinco YAML y coherencia básica de Deployment/Service/ConfigMap/probes |
| Buscar URLs externas en assets JS/HTML/CSS | **Sin referencias encontradas** | Los archivos de la app no requieren Internet al ejecutarse |

**Importante sobre Chromium:** este entorno bloqueó el tráfico directo del navegador a `localhost`. Para no ocultarlo, el test `tests/browser_smoke.py` carga HTML/CSS/JS localmente y hace que `window.fetch` viaje a la **API HTTP simulada real** mediante un puente Python; así comprueba el JavaScript y CRUD de la UI, pero **no equivale** a abrir la URL real de Nginx en un navegador desde otra PC. Esa prueba integral sigue pendiente.

## Pruebas no ejecutadas todavía

- **Docker:** `docker build`, ejecución de imagen y comprobación del HEALTHCHECK de imagen; `docker` no estaba instalado en el entorno de preparación.
- **GitHub Actions/GHCR:** no existe URL de repo ni permisos entregados; aún no se publicó imagen.
- **K3s real:** `kubectl apply`, ejecución en nodos, DNS de Service, tráfico Traefik/MetalLB, caché offline de imágenes.
- **Backend real/PostgreSQL de Raúl:** no hay API accesible desde el entorno; solo pruebas con mock HTTP.
- **Acceso por IP desde otro equipo Cisco:** depende de router, Wi-Fi, red y firewall físicos.
- **Otro navegador (Firefox/Edge):** no ejecutado.
- **Demostración totalmente sin Internet** en el router Cisco: requiere el despliegue y las imágenes precargadas.
- **Persistencia tras reinicio de PostgreSQL/API real:** no ejecutada.

## Checklist de aceptación con Fernando y Raúl

- [ ] Raúl confirma nombre/puerto del Service Kubernetes de Express y que escucha en `0.0.0.0` dentro del pod.
- [ ] Raúl confirma endpoints y contrato de errores 400/404/500, sin auth.
- [ ] Fernando actualiza ConfigMap `API_UPSTREAM` y selecciona namespace común.
- [ ] Construir imagen Nginx, hacer `docker run` y `curl /healthz` y `curl /api/products`.
- [ ] Cargar imagen en K3s o descargar desde GHCR antes de desconectar Internet.
- [ ] Revisar `kubectl kustomize`, manifiestos y aplicar por GitOps/operador.
- [ ] Asegurar que solo Traefik exponga frontend por IP; API/PostgreSQL permanecen internos.
- [ ] Entrar al Wi-Fi Cisco desde otra computadora y abrir la IP de entrada.
- [ ] Pruebas reales GET/POST/PUT/DELETE, validaciones y desconexión/recuperación.
- [ ] Recargar página y comprobar carga de estáticos (sin rutas internas definidas por ahora).
- [ ] Apagar Internet y repetir toda la demostración, sin recursos CDN.
