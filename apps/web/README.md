# KubeLab Inventory — Frontend

Frontend estático de inventario para K3s, conservando el diseño original: **HTML5 + CSS3 + JavaScript puro**, sin framework, sin `package.json`, sin dependencias en el navegador y **sin paso de compilación**. La web consume el backend REST de Raúl (Node.js/Express + PostgreSQL), no almacena productos en `localStorage`.

## Inicio rápido en Windows

Desde `apps/web`:

```powershell
python mock/mock_api.py
```

Entra a **http://localhost:8000**. El servidor de ejemplo incluye dos productos y permite GET/POST/PUT/DELETE; los datos son temporales y se pierden al detenerlo.

Para probar con el backend real desde el mismo equipo:

```powershell
python mock/mock_api.py --upstream http://localhost:3000
```

Si la API está en la PC de Raúl, reemplaza `localhost` **solo en este comando** por el host/IP accesible en la red. El backend debe aceptar conexiones de la LAN, y el firewall permitirlas. También puedes probar la API a través de un túnel autorizado; no publiques una API CRUD sin autenticación a Internet.

## Configuración y tecnología

| Concepto | Valor |
|---|---|
| Frontend | HTML5, CSS3, JavaScript nativo (ES moderno) |
| Framework / versión | No aplica |
| Dependencias npm | Ninguna |
| Build frontend | No hay compilación; los archivos se copian directamente a Nginx |
| Servidor producción | Nginx (imagen `nginx:alpine`) |
| Puerto contenedor | **80/TCP** |
| Salud frontend | `GET /healthz` (no depende de API) |
| API en navegador | `/api` (misma IP/origen de la web) |
| Proxy backend Nginx | `API_UPSTREAM=api-service:3000` |
| Moneda | GTQ, vista formateada `Q`/`GTQ` según navegador |
| URLs/CDN imprescindibles en ejecución | Ninguno |

`js/config.js` contiene `apiBaseUrl: "/api"`; la variable `API_UPSTREAM` se configura **en el contenedor**, no se incorpora al JavaScript del navegador. En Kubernetes, el Service API debe existir antes de que Nginx inicie, ya que el upstream se resuelve por DNS al arrancar Nginx.

## Funcionalidad existente

Listado, búsqueda, contadores y valor de existencias, crear y editar formularios, confirmación para eliminar, estados de carga/errores de API, reintentar, diseño responsivo y precios en quetzales. Incluye validaciones de cliente y el backend **debe** validar también.

- `GET /api/products` → array JSON directo.
- `GET /api/products/:id` → objeto JSON; 404 si falta.
- `POST /api/products` → JSON con `name`, `description`, `price`, `stock`; recibe producto creado.
- `PUT /api/products/:id` → mismo cuerpo; recibe actualizado.
- `DELETE /api/products/:id` → admite `204` sin contenido.
- `GET /health` → salud del **backend**, a través del proxy opcional.

No se utiliza PATCH, login ni autorización porque no aparecen en el contrato actual; no se deben inventar. Si el backend introduce autenticación, se debe adaptar la aplicación antes de exponerla fuera de la LAN.

## Ejecutar Docker

Desde la **raíz del repositorio**:

```powershell
docker build -t kubelab-web:dev apps/web
docker run --rm -p 8080:80 -e API_UPSTREAM=host.docker.internal:3000 kubelab-web:dev
```

Con la API real corriendo en el host Windows, entra a **http://localhost:8080**. Docker Desktop debe resolver `host.docker.internal` y la API debe estar escuchando en el puerto apropiado. Para K3s el valor es un Service interno y se configura en el ConfigMap, no `host.docker.internal`.

**Nota:** el Dockerfile está preparado pero en el entorno de preparación **no se pudo ejecutar `docker build`** porque no había Docker. El workflow CI incluye construcción y prueba real del contenedor en GitHub Actions, una vez que se suba el repositorio.

## Tests

```powershell
python -m unittest discover -s tests -p "test_*.py" -v
node --check js/app.js
node --check js/config.js
```

Tests de interfaz (extra): `python -m pip install playwright`, `python -m playwright install chromium`, luego `python tests/browser_smoke.py`.

Consulta [TESTING.md](TESTING.md) para pruebas ejecutadas, configuración de Nginx, comprobaciones sin Internet y limitaciones.

**Guías:** [DEPLOYMENT.md](DEPLOYMENT.md), [API-INTEGRATION.md](API-INTEGRATION.md), [AUDIT_REPORT.md](AUDIT_REPORT.md).
