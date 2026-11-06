# Guia de Despliegue - KubeLab API en K3s

Dirigida al encargado de infraestructura. Cubre el despliegue en un cluster K3s con Traefik, la validacion de probes y el levantamiento de la pila completa en modo offline con Docker Compose.

## 1. Prerrequisitos

| Recurso | Detalle |
| --- | --- |
| Cluster | K3s en ejecucion, con Traefik incluido (instalacion por defecto de K3s) |
| Cliente | `kubectl` apuntando al cluster destino |
| Imagen de API | `ghcr.io/raulvguti/kubelab-api:1.0.0` (definida en `k8s/api.yaml`) |
| Imagen de PostgreSQL | `postgres:15-alpine` (definida en `k8s/postgres.yaml`) |
| Docker (opcional) | Docker Engine con Compose para el entorno local/offline |

Verificacion inicial:

```bash
kubectl cluster-info
kubectl get nodes
kubectl get pods -n kube-system
kubectl get ingressroute -A
```

Si K3s no expone la CRD de Traefik (`ingressroutes.traefik.io`), el IngressRoute del punto 6 no podra aplicarse. En instalaciones antiguas el grupo de API es `traefik.containo.us/v1alpha1`; en versiones recientes es `traefik.io/v1alpha1`.

> La imagen `ghcr.io/raulvguti/kubelab-api:1.0.0` debe existir en el registro antes de aplicar el manifiesto. El workflow de CI (`.github/workflows/ci.yml`) publica tags por SHA corto y por rama, **no** publica `1.0.0` automaticamente. Verifique el tag real con `docker manifest inspect ghcr.io/raulvguti/kubelab-api:1.0.0` y ajuste `k8s/api.yaml` si es necesario.

### 1.1 Imagen privada en GHCR

Si el paquete de GHCR es privado, cree un `imagePullSecret` y referencielo en el Deployment:

```bash
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=<usuario-github> \
  --docker-password=<token-con-read:packages> \
  --docker-email=<correo>
```

Agregue en `k8s/api.yaml`, dentro de `spec.template.spec`:

```yaml
imagePullSecrets:
  - name: ghcr-secret
```

---

## 2. Orden de despliegue

El orden es obligatorio:

1. **`k8s/postgres.yaml`**: crea ConfigMap, Secret, PVC, StatefulSet y Service de PostgreSQL.
2. **Esperar a que el pod de PostgreSQL este `Running` y `Ready`**.
3. **`k8s/api.yaml`**: crea ConfigMap, Deployment (2 replicas) y Service `api-service`.

Motivo: la API ejecuta `initDatabase()` al arrancar (hasta 10 intentos cada 3 segundos) y su `readinessProbe` consulta `GET /ready`. Si ambos manifiestos se aplican a la vez, la API arranca igualmente, pero sus pods permanecen `NotReady` hasta que PostgreSQL acepte conexiones. Aplicar en orden evita ruido en los eventos y acelera la convergencia.

---

## 3. Despliegue de PostgreSQL

```bash
kubectl apply -f k8s/postgres.yaml
```

Esperar a que el StatefulSet complete el rollout:

```bash
kubectl rollout status statefulset/postgres --timeout=180s
kubectl wait --for=condition=ready pod -l app=postgres --timeout=180s
kubectl get pods -l app=postgres -o wide
kubectl get pvc postgres-pvc
```

Validar que PostgreSQL acepta conexiones:

```bash
kubectl exec -it postgres-0 -- pg_isready -U postgres
```

Salida esperada: `postgres-0:5432 - accepting connections`.

Componentes creados:

| Recurso | Nombre | Detalle |
| --- | --- | --- |
| ConfigMap | `postgres-config` | `POSTGRES_DB=kubelab_db`, `POSTGRES_USER=postgres` |
| Secret | `postgres-secret` | `POSTGRES_PASSWORD=secretpassword` |
| PVC | `postgres-pvc` | `2Gi`, `ReadWriteOnce` |
| StatefulSet | `postgres` | 1 replica, `postgres:15-alpine` |
| Service | `postgres` | Headless (`clusterIP: None`), puerto `5432` |

> El Secret del repositorio contiene la contrasena de laboratorio `secretpassword`. Para un entorno real, reemplacela antes de aplicar (por ejemplo con `kubectl create secret generic postgres-secret --from-literal=POSTGRES_PASSWORD='<nueva>' --dry-run=client -o yaml`) y no la versione en Git.

---

## 4. Despliegue de la API

Con PostgreSQL `Ready`:

```bash
kubectl apply -f k8s/api.yaml
kubectl rollout status deployment/api --timeout=180s
kubectl get pods -l app=api -o wide
kubectl get deployment api
kubectl get svc api-service
```

Componentes creados:

| Recurso | Nombre | Detalle |
| --- | --- | --- |
| ConfigMap | `api-config` | `PORT=3000`, `DB_HOST=postgres`, `DB_PORT=5432`, `DB_NAME=kubelab_db`, `DB_USER=postgres` |
| Deployment | `api` | 2 replicas, imagen `ghcr.io/raulvguti/kubelab-api:1.0.0` |
| Service | `api-service` | `ClusterIP`, puerto `3000` -> `targetPort 3000`, nombre `http` |

Variables y recursos relevantes:

- `DB_PASSWORD` se inyecta desde `postgres-secret`, clave `POSTGRES_PASSWORD`.
- Requests: `100m` CPU / `128Mi` memoria. Limits: `200m` CPU / `256Mi` memoria.
- `livenessProbe`: `GET /health` cada `10s`, con `initialDelaySeconds: 10`.
- `readinessProbe`: `GET /ready` cada `5s`, con `initialDelaySeconds: 5`.

Verificar logs de arranque e inicializacion de la tabla:

```bash
kubectl logs deploy/api --tail=100
```

Salida esperada: `KubeLab API escuchando en el puerto 3000` y `Base de datos inicializada: tabla products lista`.

---

## 5. Prueba de los probes de salud

### 5.1 Desde el cluster

```bash
kubectl exec deploy/api -- wget -qO- http://localhost:3000/health
kubectl exec deploy/api -- wget -qO- http://localhost:3000/ready
```

Salidas esperadas:

```json
{"status":"ok","timestamp":"2026-11-04T18:30:00.000Z","uptime":42.5}
```

```json
{"status":"ready","database":"connected"}
```

### 5.2 Desde la estacion de trabajo (port-forward)

```bash
kubectl port-forward svc/api-service 3000:3000
```

En otra terminal:

```bash
curl.exe -i http://localhost:3000/health
curl.exe -i http://localhost:3000/ready
```

`/health` debe responder `200` mientras el proceso viva. `/ready` debe responder `200` solo con PostgreSQL disponible; si falla, responde `503` con `{"status":"not_ready","database":"disconnected"}` y el pod pasa a `NotReady`.

### 5.3 Simulacro de fallo de base de datos

```bash
kubectl scale statefulset postgres --replicas=0
kubectl get pods -l app=api -w
```

En segundos, `READY` de los pods de API pasa a `0/2` aunque sigan `Running`, y `/ready` responde `503`. Restaurar:

```bash
kubectl scale statefulset postgres --replicas=1
kubectl rollout status statefulset/postgres --timeout=180s
kubectl wait --for=condition=ready pod -l app=api --timeout=180s
```

El PVC `postgres-pvc` conserva los datos durante el escalado a cero.

### 5.4 Inspeccion de fallos de probe

```bash
kubectl describe pod -l app=api
kubectl get events --sort-by=.lastTimestamp
kubectl logs deploy/api --previous
```

---

## 6. Exposicion HTTP con Traefik

El Service `api-service` escucha en el puerto `3000` y es de tipo `ClusterIP`. El frontend no debe consumirlo directamente: se publica mediante un `IngressRoute` de Traefik.

Ejemplo para el grupo `3` (host `api.grupo3.lab`):

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: api-ingress
  namespace: default
spec:
  entryPoints:
    - web
  routes:
    - match: Host(`api.grupo3.lab`)
      kind: Rule
      services:
        - name: api-service
          port: 3000
```

Aplicacion y verificacion:

```bash
kubectl apply -f api-ingress.yaml
kubectl get ingressroute
kubectl describe ingressroute api-ingress
```

Prueba desde un equipo con resolucion del host:

```bash
curl.exe -i http://api.grupo3.lab/health
curl.exe -i http://api.grupo3.lab/api/products
```

Si el nombre no resuelve, agregue una entrada DNS o en el archivo `hosts` del equipo (`C:\Windows\System32\drivers\etc\hosts` en Windows):

```text
<IP_DEL_NODO_K3S>  api.grupo3.lab
```

Para HTTPS, agregue un `entryPoint` `websecure` y un `tls` con el certificado correspondiente. La configuracion actual del proyecto solo requiere HTTP para el laboratorio.

---

## 7. Pila offline con Docker Compose

El archivo `docker-compose.yml` levanta PostgreSQL 15 y la API compilada desde el `Dockerfile` multietapa.

### 7.1 Preparar imagenes sin internet

En un equipo con conectividad, descargue y empaquete las imagenes base:

```bash
docker pull node:18-alpine
docker pull postgres:15-alpine
docker save node:18-alpine postgres:15-alpine -o kubelab-images.tar
```

En el equipo destino (offline):

```bash
docker load -i kubelab-images.tar
```

### 7.2 Levantar la pila

```bash
docker compose up -d --build
```

En instalaciones con el binario clasico:

```bash
docker-compose up -d --build
```

### 7.3 Verificar

```bash
docker compose ps
docker compose logs -f api
curl.exe -i http://localhost:3000/health
curl.exe -i http://localhost:3000/ready
curl.exe http://localhost:3000/api/products
```

Comportamiento esperado:

- `postgres` arranca con healthcheck `pg_isready -U postgres` cada `5s`.
- `api` espera a que `postgres` este `healthy` (`depends_on.condition: service_healthy`).
- La API publica el puerto `3000` y PostgreSQL el `5432`.
- El volumen `pgdata` persiste los datos entre reinicios.

Variables internas del compose (tienen prioridad sobre `.env` dentro de los contenedores):

| Servicio | Variable | Valor |
| --- | --- | --- |
| `postgres` | `POSTGRES_USER` | `postgres` |
| `postgres` | `POSTGRES_PASSWORD` | `secretpassword` |
| `postgres` | `POSTGRES_DB` | `kubelab_db` |
| `api` | `DB_HOST` | `postgres` |
| `api` | `DB_PORT` | `5432` |
| `api` | `DB_PASSWORD` | `secretpassword` |

> El `.env` local puede apuntar a otro puerto (por ejemplo `5433`) para desarrollo con PostgreSQL nativo. Dentro de Compose se usan las variables del bloque `environment`, por lo que ese valor no afecta a los contenedores.

### 7.4 Detener y limpiar

```bash
docker compose down
docker compose down -v
```

`-v` elimina el volumen `pgdata` y, por tanto, los datos.

---

## 8. Actualizacion y rollback

```bash
kubectl set image deployment/api api=ghcr.io/raulvguti/kubelab-api:<nuevo-tag>
kubectl rollout status deployment/api --timeout=180s
kubectl rollout history deployment/api
kubectl rollout undo deployment/api
```

El Deployment usa la estrategia `RollingUpdate` por defecto. Con `replicas: 2`, la actualizacion mantiene capacidad mientras los nuevos pods superan el `readinessProbe`.

---

## 9. Diagnostico rapido

| Sintoma | Causa probable | Accion |
| --- | --- | --- |
| `ImagePullBackOff` | Tag inexistente o imagen privada sin credenciales | Verificar tag y crear `ghcr-secret` |
| `CrashLoopBackOff` | Error de arranque o imagen incompatible | `kubectl logs deploy/api --previous` |
| Pods API `Running` pero `0/2 READY` | `/ready` devuelve `503`, PostgreSQL no responde | Verificar pod y Service `postgres`, revisar `DB_HOST` |
| `500` en `/api/products` | API sin conexion a la base o tabla no creada | Revisar logs de `initDatabase()` y `kubectl exec postgres-0 -- psql -U postgres -d kubelab_db -c '\dt'` |
| PVC en `Pending` | StorageClass no disponible en K3s | `kubectl get storageclass`, `kubectl describe pvc postgres-pvc` |
| `404` desde Traefik | Host o IngressRoute mal configurado | `kubectl describe ingressroute`, verificar DNS/hosts |
| `503` desde Traefik | Ningun endpoint `Ready` en `api-service` | Revisar readiness de los pods |

---

## 10. Lista de verificacion final

- [ ] `kubectl get pods -l app=postgres` muestra `1/1 Running`.
- [ ] `kubectl get pods -l app=api` muestra `2/2 Running`.
- [ ] `kubectl get svc api-service` expone el puerto `3000`.
- [ ] `/health` responde `200` con `status: "ok"`.
- [ ] `/ready` responde `200` con `database: "connected"`.
- [ ] `/api/products` devuelve el listado JSON.
- [ ] El IngressRoute resuelve `api.grupo#.lab` hacia `api-service:3000`.
- [ ] `docker compose up -d --build` levanta la pila local sin errores.
