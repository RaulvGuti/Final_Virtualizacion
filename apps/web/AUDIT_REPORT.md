# Informe final de auditoría — KubeLab Frontend

## 1. Framework y versión

**No hay framework:** HTML5, CSS3 y JavaScript nativo ES moderno. No existe `package.json` ni dependencias npm. No hay React, Vite, Vue, Next.js ni Angular. El único proceso servidor de producción es Nginx (`nginx:stable-alpine`, versión exacta depende del digest disponible al construir). No hay build JS; la etapa de "build" es copiar assets estáticos a la imagen.

## 2. Funcionalidades examinadas y verificadas

- Listar y buscar productos (GET), consultar uno (GET :id), crear (POST), editar (PUT), eliminar (DELETE) con confirmación.
- Formulario con validación HTML y validación JS; estados de espera y mensajes por error HTTP 503 o conexión fallida.
- Valores mostrados en quetzales GTQ; `price` enviado como número JSON.
- Diseño adaptable móvil 390px y desktop 1440px (verificación automática de DOM/visibilidad; no revisión visual humana de todos los navegadores).
- No almacena inventario en localStorage ni necesita acceso a Internet para descargar dependencias en ejecución.

Todas las pruebas CRUD usaron la **API simulada local**, no la PostgreSQL real de Raúl. Ver resultados en `TESTING.md`.

## 3. Archivos creados/modificados

**Mantenidos:** `index.html`, `css/styles.css`, `js/config.js`, `mock/mock_api.py` (conserva UI). **Modificados:** `js/app.js` (mensaje 502–504 y limpieza de estadísticas tras error), `Dockerfile`, `nginx.conf.template`, `.dockerignore`, `.gitignore`, `README.md`.

**Creados:** `.env.example`, `API-INTEGRATION.md`, `DEPLOYMENT.md`, `TESTING.md`, `AUDIT_REPORT.md`, `tests/test_api.py`, `tests/browser_smoke.py`, `tests/nginx_integration.py`, `tests/check_manifests.py`, `k8s/deployment.yaml`, `k8s/service.yaml`, `k8s/configmap.yaml`, `k8s/kustomization.yaml`, `k8s/ingress-ip.yaml` y en raíz `.github/workflows/frontend-ci.yml`, `README.md`, `.gitignore`.

## 4. Pruebas ejecutadas y resultados

- `python -m unittest discover ...`: **5 pruebas OK**.
- Chromium con Playwright, `fetch` conectado a mock HTTP mediante puente Python: **9 verificaciones OK**.
- `nginx -t` + proxy real de `/api`, assets y SPA fallback: **OK**.
- `node --check` JS: **OK**.
- Verificación estática YAML con PyYAML: **OK**.

**No ejecutado:** `docker build`, CI/GHCR, clúster real, backend/PostgreSQL real, acceso desde otra computadora, Firefox, desconexión física de Internet.

## 5–8. Docker, puerto, API e imagen

- Dockerfile: `apps/web/Dockerfile`; utiliza Nginx ligero. **Preparado, todavía no construido aquí**.
- Puerto: **80/TCP** del contenedor, Service ClusterIP puerto **80**, sin NodePort.
- API browser: `/api`. Proxy Nginx `API_UPSTREAM` sin `http://`; valor de ejemplo de Service: `kubelab-api:3000` (**pendiente confirmar**).
- Imagen local prevista: `kubelab-web:dev`. En GHCR, después de subir y ejecutar CI: `ghcr.io/<owner>/<repo>/kubelab-web:sha-<commit>`. **No se ha creado/subido una imagen**, solo se definieron nombres/tags de ejemplo.

## 9. Repositorio y commit final

**No disponibles:** no se proporcionó URL de repositorio GitHub, acceso ni rama. Por ello **no se creó un commit remoto, ni una URL**, ni se declara un SHA ficticio. Cuando Fernando comparta el repo, copiar `apps/web/` y `.github/workflows/frontend-ci.yml` a la raíz, crear rama propia, ejecutar CI y generar PR.

## 10–11. Manifiestos Kubernetes e instrucciones

Preparados en `apps/web/k8s`: Deployment 1 réplica con probes `/healthz`, recursos `requests: 15m CPU/32Mi RAM`, límites `150m CPU/128Mi RAM`; Service ClusterIP; ConfigMap API_UPSTREAM; Kustomize; Ingress opcional por IP para Traefik.

Comando documental que **Fernando ejecutará tras revisar Service, namespace e imagen**:

```bash
kubectl -n NAMESPACE_ACORDADO apply -k apps/web/k8s/
```

Sin `kubectl apply` ejecutado desde esta entrega. Para imágenes sin Internet, ver `DEPLOYMENT.md` (Docker save + import en K3s containerd).

## 12. Pendientes y riesgos

1. Probar build y contenedor Docker con Docker Desktop o runner de GitHub.
2. Confirmar nombre, namespace, puerto y disponibilidad DNS de Service Express; el Service debe existir antes del arranque de Nginx.
3. Probar CRUD real y persistencia en PostgreSQL de Raúl.
4. Obtener URL de repo, crear rama/commit, correr Actions y publicar imagen GHCR o cargar offline.
5. Fernando debe integrar Ingress/MetalLB y probar desde PC del ingeniero conectada al router Cisco.
6. Prueba integral sin Internet con todas las imágenes precargadas; verificar con otro navegador.
7. Revisar seguridad: no hay autenticación documentada. No exponer escrituras a Internet.

**Conclusión:** fuente frontend, proxy Nginx, pruebas y manifiestos están preparados para entregar a Fernando, pero la condición de "desplegado y funcionando en K3s real" queda pendiente de integración y pruebas físicas.
