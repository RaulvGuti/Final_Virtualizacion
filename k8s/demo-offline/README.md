# KubeLab · Demo offline

El PC físico ejecuta Proxmox y se conecta a un puerto LAN del Cisco Linksys. El equipo que presenta se conecta al Wi-Fi `KubeLab`. La demo usa dos VMs Debian 12 con K3s y las imágenes precargadas en containerd.

| Equipo | Dirección | Función |
|---|---|---|
| Cisco Linksys | `192.168.50.1` | Router y Wi-Fi |
| Proxmox | `192.168.50.10:8006` | Administración de las VMs |
| VM 100 | `192.168.50.11` | Control plane |
| VM 101 | `192.168.50.12` | Worker con PostgreSQL, Prometheus y Grafana |

## Arranque y prueba

1. Enciende el Cisco y el PC físico. Proxmox arranca la VM 100 y espera 30 segundos antes de iniciar la VM 101.
2. Conecta la laptop al Wi-Fi `KubeLab` y abre el inventario. Espera a ver **API conectada** y los productos. Tras un reinicio, PostgreSQL y la API pueden tardar más en estar listos que las VMs.
3. Abre Grafana como `docente` y comprueba que el panel muestre dos réplicas. En Prometheus, comprueba que los dos destinos de `kubelab-api` estén `UP`.
4. Con un cliente SQL, conecta como `docente_sql` y ejecuta la consulta de lectura de abajo. Las contraseñas se entregan por privado.

| Servicio | Acceso |
|---|---|
| Inventario | [Abrir](http://192.168.50.11/) |
| API | [Productos](http://192.168.50.11/api/products), [disponibilidad](http://192.168.50.11/api/ready) |
| Grafana | [Panel KubeLab - API](http://192.168.50.11:30300/d/kubelab-api/kubelab-api) |
| Prometheus | [Targets](http://192.168.50.11:30909/targets) |
| PostgreSQL | Host `192.168.50.11`, puerto `30432`, base `kubelab_db`, usuario `docente_sql` |

```sql
SELECT count(*) AS productos FROM public.products;
```

## Manifiestos e imágenes

Los archivos de esta carpeta documentan el despliegue manual de la demo. Para reproducirlo, carga las imágenes `linux/amd64` en los nodos que puedan ejecutar los Pods. Prometheus y Grafana están fijados a `kubelab-worker1`. En cada nodo, importa el archivo correspondiente con `sudo k3s ctr -n k8s.io images import --platform linux/amd64 ARCHIVO.tar`.

| Componente | Referencia que espera el manifiesto |
|---|---|
| PostgreSQL | `docker.io/library/postgres:15-alpine` |
| API | `ghcr.io/raulvguti/kubelab-api:1.0.0` |
| Frontend | `docker.io/library/kubelab-web:1.0.0` |
| Prometheus | `docker.io/prom/prometheus:v3.13.5` |
| Grafana | `docker.io/grafana/grafana:13.3.0` |

Antes de aplicar los manifiestos en un clúster nuevo, crea por separado los Secrets `postgres-secret` con la clave `POSTGRES_PASSWORD` y `kubelab-grafana-admin` con la clave `password`. Si el archivo TAR de la API contiene la etiqueta `docker.io/library/kubelab-api:1.0.0`, agrega la etiqueta GHCR local con `k3s ctr -n k8s.io images tag`.

Desde el control plane, aplica `postgres.yaml` y confirma una consulta SQL autenticada antes de aplicar la API con `sudo k3s kubectl apply -k kubelab-api-offline`. Espera a que la API esté lista, aplica `kubelab-web-offline.yaml` y después `kubelab-ingress.yaml`. Aplica `prometheus.yaml` y `grafana.yaml`. Los tres archivos `*-nodeport.yaml` habilitan acceso directo por IP y puerto para la demo. La cuenta `docente_sql` y el usuario `docente` se crean por separado en PostgreSQL y Grafana, respectivamente.

## Diagnóstico desde la VM 100

```bash
sudo k3s kubectl get nodes -o wide
sudo k3s kubectl -n default get pods,svc,pvc -o wide
sudo k3s kubectl -n default logs -l app=api --tail=40 --prefix
sudo k3s kubectl top nodes
```

El alcance verificado incluye inventario, API, PostgreSQL, Prometheus y Grafana. El acceso desde una segunda laptop y el flujo de GitOps quedan pendientes.
