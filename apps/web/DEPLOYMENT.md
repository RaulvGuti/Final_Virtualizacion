# KubeLab — despliegue Docker, GitHub y Kubernetes K3s

Estas instrucciones son para Fernando / responsable del clúster; **esta entrega no aplica cambios al clúster**.

## 1. Imagen de producción

Frontend puramente estático; no hay `npm install`, `npm run build`, ni compilación multietapa (no aportaría nada). `Dockerfile` usa `nginx:stable-alpine`, copia `index.html`, `css`, `js` y la plantilla `nginx.conf.template`; `.dockerignore` excluye mock, tests y documentación.

Puerto del contenedor: **80/TCP**. Liveness HTTP: `GET /healthz`. Env: **`API_UPSTREAM`**, por defecto `api-service:3000` según el contrato del backend.

```bash
# Desde raíz de repositorio
docker build -t kubelab-web:dev apps/web

docker run --rm -d --name kubelab-web-local -p 8080:80 \
  -e API_UPSTREAM=host.docker.internal:3000 kubelab-web:dev

curl -i http://localhost:8080/healthz
curl -i http://localhost:8080/
curl -i http://localhost:8080/api/products

docker logs kubelab-web-local
docker stop kubelab-web-local
```

`host.docker.internal` es para Docker Desktop hablando con una API en la **PC anfitriona**, no un valor de producción K3s. Para contenedores Docker locales en la misma red, pasar su nombre DNS real en `API_UPSTREAM`. Si no existe el hostname al iniciar Nginx, fallará el arranque: crear primero el Service API.

**Estado de verificación:** se probó con Nginx nativo 1.26 y proxy real en el entorno de preparación; **no se construyó la imagen Docker aquí porque Docker no está disponible**. Docker/GHCR se validarán cuando se ejecuten los comandos o GitHub Actions.

## 2. Kubernetes K3s / GitOps

Los manifiestos están en `apps/web/k8s/` y son compatibles con **Kustomize**: Deployment (1 réplica, `Recreate`), Service **ClusterIP:80**, ConfigMap API_UPSTREAM, probes HTTP `/healthz`, requests `15m / 32Mi`, límites `150m / 128Mi`. No incluye PostgreSQL ni recursos del backend.

Antes de desplegar, confirmar con Raúl y modificar **solo** `k8s/configmap.yaml` para el nombre:puerto real de su Service API. `k8s/deployment.yaml` usa la etiqueta de imagen **`kubelab-web:dev`** para instalación offline; para GHCR sustituir por el tag inmutable de CI, como `ghcr.io/OWNER/REPO/kubelab-web:sha-COMMIT_COMPLETO` y ajustar `imagePullPolicy` al flujo acordado. No subir credenciales.

Comandos que ejecutará **Fernando, no este proyecto**:

```bash
# Validación local (sin modificar el clúster)
kubectl kustomize apps/web/k8s/

# Cuando el Service API ya exista, y una imagen esté disponible en K3s:
kubectl -n NAMESPACE_ACORDADO apply -k apps/web/k8s/
kubectl -n NAMESPACE_ACORDADO rollout status deploy/kubelab-web
kubectl -n NAMESPACE_ACORDADO get pods,svc
kubectl -n NAMESPACE_ACORDADO logs deploy/kubelab-web

# Prueba temporal sin Traefik (no expone NodePort):
kubectl -n NAMESPACE_ACORDADO port-forward svc/kubelab-web 8080:80
# En otra terminal: curl http://localhost:8080/healthz
```

Para GitOps: la herramienta escogida por Fernando puede apuntar al path `apps/web/k8s`. **No se incluye Argo CD/Flux dentro de frontend**, para ahorrar recursos y respetar infraestructura existente. Ingress opcional `k8s/ingress-ip.yaml` se excluye de Kustomize base; Fernando debe revisarlo y aplicarlo por separado para publicar **una única IP local** mediante Traefik/MetalLB. No definir NodePort arbitrarios. Un Ingress sin `host` admite solicitudes por IP pero puede chocar con otra regla `/` del mismo entrypoint; coordinar en red.

## 3. GHCR y GitHub Actions

El workflow está en `.github/workflows/frontend-ci.yml` (**raíz del repo**, no dentro de `apps/web`).

- Pull request: verifica sintaxis JS/Python, tests de API y navegador, manifiestos y `docker build` con smoke test de `/healthz`.
- Push a `main` o tag `v*`: tras verificar, compila y publica en `ghcr.io/<owner>/<repo>/kubelab-web` con `sha-<SHA completo>` y con tag `vX.Y.Z` cuando corresponda.
- Necesita permiso GitHub Actions `packages:write` para publicar; utiliza `GITHUB_TOKEN`, no contraseñas en YAML.
- El workflow **nunca** aplica manifiestos al clúster.
- Revisar visibilidad del paquete GHCR (público o credenciales de `imagePullSecrets` configuradas por Fernando) antes de usarlo en K3s.

Al cambiar de `kubelab-web:dev` a GHCR, editar el campo `image` del Deployment en Git; conservar el SHA para rollbacks. El repo/commit reales aún no fueron provistos, por lo que no se inventan URLs ni publicaciones.

## 4. Demostración sin Internet

El navegador carga **todos** los recursos desde el contenedor local: no fuentes Google, CDNs, scripts remotos ni fetch a Internet. Las imágenes del frontend y backend, las dependencias de K3s, la BD y Traefik/MetalLB deben estar **preinstaladas** antes de desconectar Internet. PostgreSQL debe estar preparado y la red Cisco debe asignar conectividad local.

Si no habrá registro GHCR accesible durante la presentación, preparar imagen con Internet en la laptop Docker y **transferirla a los nodos K3s**:

```bash
# PC que sí tiene Docker
docker build -t kubelab-web:dev apps/web
docker save kubelab-web:dev -o kubelab-web-dev.tar
# Copiar kubelab-web-dev.tar a cada nodo donde podría programarse el Pod.

# En cada nodo K3s, como administrador:
sudo k3s ctr -n k8s.io images import /ruta/kubelab-web-dev.tar
sudo k3s ctr -n k8s.io images list | grep kubelab-web
```

El Deployment usa `imagePullPolicy: IfNotPresent`; **no** implica que K3s mágicamente tenga esa imagen. Si no fue importada correctamente al runtime containerd del nodo, quedará `ImagePullBackOff` sin Internet. Repetir el proceso para el backend y cualquier otra imagen necesaria.

Probar de manera deliberada con Internet desconectado: encender infraestructura, ingresar al Wi-Fi del Cisco con otra computadora, abrir la **IP que publique Fernando** y ejecutar GET/POST/PUT/DELETE. Verificar que no haya aislamiento de clientes Wi-Fi y que DNS interno de Kubernetes resuelva el Service API. La IP propuesta del router/Proxmox no se codifica en el proyecto.

## 5. Observaciones de seguridad y operación

El backend mostrado no evidencia autenticación. Evitar su exposición pública; usar la LAN de demostración controlada y no publicar un túnel de escritura sin controles. Confirmar que no se suban secretos o `.env` reales a Git. La aplicación no se conecta directamente a PostgreSQL; eso corresponde al backend. El Service de frontend **no es** de tipo LoadBalancer/NodePort: el punto de entrada lo configurará Fernando.
