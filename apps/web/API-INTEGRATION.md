# KubeLab — integración API Raúl (contrato acordado)

## Modelo de producto

El backend Express usa PostgreSQL. La entidad enviada por Raúl es:

```json
{
  "id": 1,
  "name": "Laptop ASUS ROG Zephyrus",
  "description": "Gaming laptop 16GB RAM RTX 4050",
  "price": 1250.5,
  "stock": 10,
  "created_at": "2026-11-04T20:00:00.000Z"
}
```

El frontend **no envía** `id` ni `created_at`: pertenecen al servidor. El precio se transmite como número JSON en **quetzales**; la vista lo formatea con `Intl.NumberFormat('es-GT', {style:'currency', currency:'GTQ'})`. No enviar strings como `"Q350"`.

## Endpoints

| Método | Ruta | Cuerpo cliente | Éxito / errores |
|---|---|---|---|
| GET | `/health` | ninguno | `{ "status": "ok", "timestamp": "...", "uptime": 120.45 }` |
| GET | `/api/products` | ninguno | Array JSON directo, no `{data: ...}` |
| GET | `/api/products/:id` | ninguno | Producto JSON, 404 `{ "error": "Producto no encontrado" }` |
| POST | `/api/products` | cuatro campos | Producto creado, con `id` y `created_at` |
| PUT | `/api/products/:id` | cuatro campos | Producto actualizado |
| DELETE | `/api/products/:id` | ninguno | Se acepta HTTP 204 sin cuerpo |

Cuerpo POST/PUT:

```json
{ "name": "Teclado Mecánico RGB", "description": "Switches rojos", "price": 400, "stock": 12 }
```

*El frontend acepta todo código 2xx y un DELETE sin cuerpo; las capturas aportadas no detallan los códigos exactos de éxito de POST/PUT.*

No hay PATCH ni autenticación demostrados; no forman parte de esta implementación. Formulario: nombre obligatorio máximo 120 caracteres, descripción máximo 500, precio decimal no negativo con dos decimales, existencias enteras no negativas. El backend puede imponer reglas más estrictas y debe validarlas.

## Esquema de red

```text
Navegador del ingeniero (IP local que publique Traefik/MetalLB)
       |
       | http://IP_DE_ENTRADA/ (misma IP para GET /api/products)
       v
Traefik Ingress -> Service kubelab-web:80 -> Pod Nginx:80
                                             |
                                             | proxy_pass /api/* -> Service API:puerto
                                             v
                                     Backend Express --> PostgreSQL
```

**No** usar `localhost:3000` desde JavaScript en producción: `localhost` allí es la computadora del ingeniero, no el backend. **No** usar nombres `.svc.cluster.local` en navegador: DNS interno de Kubernetes no es accesible desde la PC del ingeniero. Sí pueden usarse nombres internos en `API_UPSTREAM` **dentro del pod Nginx**.

## Valores que debe revisar Fernando

1. Nombre Kubernetes y puerto real del **Service** de Raúl: ejemplo `kubelab-api:3000` si está en el mismo namespace; de otro modo `kubelab-api.namespace.svc.cluster.local:3000`.
2. El Service API debe existir/resolver por DNS antes del inicio de Nginx; el pod se reiniciará si no puede resolver el nombre al arrancar.
3. Namespace donde viven web y API; backend y PostgreSQL internos.
4. Traefik: ruta `/` a web, idealmente una sola IP de MetalLB. El fichero `k8s/ingress-ip.yaml` es **opcional**, no parte del kustomization base.
5. Acceso del ingeniero desde Wi-Fi Cisco; pruebas de Firewall/AP isolation.

## Cómo probar con la API real (sin modificar JS)

Desde `apps/web`:

```powershell
python mock/mock_api.py --upstream http://HOST_ALCANZABLE_DE_RAUL:3000
```

Abrir `http://localhost:8000`. El mock pasa a modo proxy (no guarda productos): los CRUD modifican datos reales del backend/BD. Si la API está en la misma PC usa `localhost`. Para pruebas HTTP directas:

```powershell
curl.exe http://HOST_ALCANZABLE_DE_RAUL:3000/health
curl.exe http://HOST_ALCANZABLE_DE_RAUL:3000/api/products
```

Antes de la demostración, hacer una operación CRUD completa de prueba, **con autorización de Raúl**, verificar que persistió en PostgreSQL y repetir tras reinicio del backend. Si se pierde conectividad, la web debe mostrar error en pantalla y permitir reintentar. No se requiere Internet para servir HTML/CSS/JS ni para el proxy si red, imágenes y DNS locales funcionan.
