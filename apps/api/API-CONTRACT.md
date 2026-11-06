# Contrato de API - KubeLab

Documento de integracion entre el backend (`apps/api`) y el frontend del proyecto KubeLab.

- Version de la API: `1.0.0`
- Stack: Node.js 18, TypeScript, Express 4, PostgreSQL 15
- Formato de intercambio: JSON UTF-8
- Autenticacion: no implementada (la API es abierta dentro de la red del laboratorio)

---

## 1. URL base

| Entorno | URL base | Notas |
| --- | --- | --- |
| Local (desarrollo) | `http://localhost:3000` | `npm run dev`, `npm start` o `docker-compose up` |
| Contenedor Docker | `http://localhost:3000` | Puerto publicado por `docker-compose.yml` |
| Cluster K3s (Traefik) | `http://api.grupo#.lab` | Reemplazar `#` por el numero de grupo asignado |

En el cluster, el trafico llega a Traefik y este enruta hacia el Service `api-service` en el puerto `3000`. El frontend debe usar la URL base del cluster y **no** llamar directamente a `api-service` (nombre interno no resoluble fuera del cluster).

Todas las rutas son relativas a la URL base. No existe prefijo global adicional: los productos ya viven bajo `/api/products`.

---

## 2. Cabeceras

### Cabeceras requeridas en peticiones con cuerpo

| Cabecera | Valor | Obligatoria |
| --- | --- | --- |
| `Content-Type` | `application/json` | Si, en `POST` y `PUT` |
| `Accept` | `application/json` | Recomendada |

Sin `Content-Type: application/json`, Express no parsea el cuerpo y las validaciones de `name`, `price`, `stock` y `description` fallaran con `400`.

### Cabeceras de respuesta

| Cabecera | Valor | Aplica a |
| --- | --- | --- |
| `Content-Type` | `application/json; charset=utf-8` | Todos los endpoints JSON |
| `Content-Type` | `text/plain; version=0.0.4; charset=utf-8` | `GET /metrics` |
| `Access-Control-Allow-Origin` | `*` | Todos los endpoints (middleware `cors()`) |

CORS esta habilitado globalmente con origen abierto, por lo que el frontend puede consumir la API desde otro origen sin configuracion adicional.

---

## 3. Convenciones

### Moneda

La moneda del sistema son **Quetzales (Q)**. La API **no** envia el simbolo `Q` ni texto formateado: `price` viaja siempre como **valor numerico limpio** (por ejemplo `1250.5`). El formateo (`Q 1,250.50`) es responsabilidad del frontend.

La base de datos almacena `price` como `NUMERIC(10, 2)`; la API lo convierte a `number` antes de serializar. Por eso `1250.50` se transporta como `1250.5` y `45.00` como `45`. El cliente debe tratar el campo como numero, no como cadena.

### Identificadores

`id` es un entero positivo generado por PostgreSQL (`SERIAL`). Cualquier valor no entero o menor o igual a cero responde `400`.

### Fechas

`created_at` es un timestamp ISO 8601 en UTC emitido por PostgreSQL.

### Formato de errores

| Tipo de error | Cuerpo |
| --- | --- |
| Validacion de producto | `{ "errors": ["mensaje 1", "mensaje 2"] }` |
| Id invalido | `{ "error": "El id debe ser un entero positivo" }` |
| Recurso inexistente | `{ "error": "Producto no encontrado" }` |
| Error interno | `{ "error": "Error al ..." }` |

---

## 4. Resumen de endpoints

| Metodo | Ruta | Codigos de exito | Codigos de error | Descripcion |
| --- | --- | --- | --- | --- |
| `GET` | `/health` | `200` | - | Liveness de la API (no depende de la base de datos) |
| `GET` | `/ready` | `200` | `503` | Readiness: verifica PostgreSQL con `SELECT 1` |
| `GET` | `/metrics` | `200` | - | Metricas Prometheus en texto plano |
| `GET` | `/api/products` | `200` | `500` | Lista todos los productos |
| `GET` | `/api/products/:id` | `200` | `400`, `404`, `500` | Obtiene un producto por id |
| `POST` | `/api/products` | `201` | `400`, `500` | Crea un producto |
| `PUT` | `/api/products/:id` | `200` | `400`, `404`, `500` | Actualiza parcialmente un producto |
| `DELETE` | `/api/products/:id` | `204` | `400`, `404`, `500` | Elimina un producto |

---

## 5. Endpoints de infraestructura

### GET /health

Verifica que el proceso HTTP esta vivo. **No** consulta la base de datos. Se usa como `livenessProbe`.

**Respuesta `200`:**

```json
{
  "status": "ok",
  "timestamp": "2026-11-04T18:30:00.000Z",
  "uptime": 42.5
}
```

### GET /ready

Ejecuta `SELECT 1` contra PostgreSQL. Se usa como `readinessProbe`: si la base de datos no responde, el pod no recibe trafico.

**Respuesta `200` - base de datos disponible:**

```json
{
  "status": "ready",
  "database": "connected"
}
```

**Respuesta `503` - base de datos no disponible:**

```json
{
  "status": "not_ready",
  "database": "disconnected"
}
```

El frontend no debe usar `/ready` para decidir si muestra la UI. Su consumidor es Kubernetes. Si se necesita un indicador de disponibilidad para el usuario, usar `/health` o manejar el error de la llamada de negocio.

### GET /metrics

Expone metricas en formato Prometheus (`text/plain; version=0.0.4; charset=utf-8`).

**Respuesta `200` (fragmento):**

```text
# HELP http_requests_total Total de peticiones HTTP recibidas
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/api/products",status_code="200"} 12

# HELP http_request_duration_seconds Duracion de las peticiones HTTP en segundos
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.05",method="GET",route="/api/products",status_code="200"} 11
```

Incluye metricas por defecto de Node.js (`process_*`, `nodejs_*`) ademas de `http_requests_total` y `http_request_duration_seconds`, etiquetadas por `method`, `route` y `status_code`.

---

## 6. Endpoints de productos

### GET /api/products

Devuelve el listado completo ordenado por `id` ascendente.

**Peticion:**

```http
GET /api/products HTTP/1.1
Host: localhost:3000
Accept: application/json
```

**Respuesta `200`:**

```json
[
  {
    "id": 1,
    "name": "Laptop ASUS ROG Zephyrus",
    "description": "Gaming laptop 16GB RAM RTX 4050",
    "price": 1250.5,
    "stock": 10,
    "created_at": "2026-11-04T18:30:00.000Z"
  },
  {
    "id": 2,
    "name": "Mouse Gamer RGB",
    "description": "Mouse optico de alta precision",
    "price": 45,
    "stock": 25,
    "created_at": "2026-11-04T18:30:00.000Z"
  }
]
```

Listado vacio: `[]` con `200`.

**Respuesta `500` - fallo de base de datos:**

```json
{
  "error": "Error al obtener los productos"
}
```

### GET /api/products/:id

**Peticion:**

```http
GET /api/products/2 HTTP/1.1
Host: localhost:3000
Accept: application/json
```

**Respuesta `200`:**

```json
{
  "id": 2,
  "name": "Mouse Gamer RGB",
  "description": "Mouse optico de alta precision",
  "price": 45,
  "stock": 25,
  "created_at": "2026-11-04T18:30:00.000Z"
}
```

**Respuesta `400` - id no entero positivo:**

```json
{
  "error": "El id debe ser un entero positivo"
}
```

**Respuesta `404` - producto inexistente:**

```json
{
  "error": "Producto no encontrado"
}
```

**Respuesta `500` - fallo de base de datos:**

```json
{
  "error": "Error al obtener el producto"
}
```

### POST /api/products

Crea un producto. `name` y `price` son obligatorios.

**Peticion:**

```http
POST /api/products HTTP/1.1
Host: localhost:3000
Content-Type: application/json
Accept: application/json
```

```json
{
  "name": "Teclado Mecanico RGB",
  "description": "Teclado switch azul silencioso",
  "price": 85.0,
  "stock": 15
}
```

**Respuesta `201`:**

```json
{
  "id": 4,
  "name": "Teclado Mecanico RGB",
  "description": "Teclado switch azul silencioso",
  "price": 85,
  "stock": 15,
  "created_at": "2026-11-04T18:35:00.000Z"
}
```

`description` es opcional; si se omite se almacena como `null`. `stock` es opcional y por defecto `0`.

**Respuesta `400` - una o varias validaciones:**

```json
{
  "errors": [
    "El campo 'name' es obligatorio y no puede estar vacio",
    "El campo 'price' es obligatorio y debe ser numerico"
  ]
}
```

Tabla de validaciones:

| Campo | Regla | Mensaje |
| --- | --- | --- |
| `name` | String no vacio | `El campo 'name' es obligatorio y no puede estar vacio` |
| `price` | Numero, mayor o igual a 0 | `El campo 'price' es obligatorio y debe ser numerico` / `El campo 'price' no puede ser negativo` |
| `stock` | Entero mayor o igual a 0 | `El campo 'stock' debe ser un entero no negativo` |
| `description` | Texto o `null` | `El campo 'description' debe ser texto` |

**Respuesta `500` - fallo de base de datos:**

```json
{
  "error": "Error al crear el producto"
}
```

### PUT /api/products/:id

Actualizacion **parcial**: solo modifica los campos enviados. Si el cuerpo no trae ningun campo conocido, responde `400`.

**Peticion:**

```http
PUT /api/products/4 HTTP/1.1
Host: localhost:3000
Content-Type: application/json
Accept: application/json
```

```json
{
  "price": 79.99,
  "stock": 12
}
```

**Respuesta `200`:**

```json
{
  "id": 4,
  "name": "Teclado Mecanico RGB",
  "description": "Teclado switch azul silencioso",
  "price": 79.99,
  "stock": 12,
  "created_at": "2026-11-04T18:35:00.000Z"
}
```

**Respuesta `400` - cuerpo sin campos actualizables:**

```json
{
  "error": "No se enviaron campos para actualizar"
}
```

**Respuesta `400` - id invalido:**

```json
{
  "error": "El id debe ser un entero positivo"
}
```

**Respuesta `400` - validacion de campos:**

```json
{
  "errors": [
    "El campo 'price' no puede ser negativo"
  ]
}
```

**Respuesta `404`:**

```json
{
  "error": "Producto no encontrado"
}
```

**Respuesta `500`:**

```json
{
  "error": "Error al actualizar el producto"
}
```

Reglas de actualizacion: `name` conserva la regla de no vacio; `price` debe ser numerico y no negativo; `stock` debe ser entero no negativo; `description` acepta texto o `null` para limpiar el campo.

### DELETE /api/products/:id

**Peticion:**

```http
DELETE /api/products/4 HTTP/1.1
Host: localhost:3000
```

**Respuesta `204`:** sin cuerpo.

**Respuesta `400`:**

```json
{
  "error": "El id debe ser un entero positivo"
}
```

**Respuesta `404`:**

```json
{
  "error": "Producto no encontrado"
}
```

**Respuesta `500`:**

```json
{
  "error": "Error al eliminar el producto"
}
```

---

## 7. Codigos HTTP soportados

| Codigo | Significado en esta API | Donde aparece |
| --- | --- | --- |
| `200` | Operacion exitosa | Health, ready, metrics, GET y PUT de productos |
| `201` | Recurso creado | `POST /api/products` |
| `204` | Eliminado, sin cuerpo | `DELETE /api/products/:id` |
| `400` | Id invalido, validacion fallida o cuerpo vacio | GET/PUT/DELETE con id invalido, POST/PUT invalidos |
| `404` | Producto inexistente | GET/PUT/DELETE por id |
| `500` | Error interno o fallo de PostgreSQL | Todos los endpoints de productos |
| `503` | Base de datos no disponible | `GET /ready` |

---

## 8. Consideraciones para el frontend

1. Usar `fetch` con `headers: { "Content-Type": "application/json" }` en `POST` y `PUT`.
2. Tratar `price` como `number`; formatear como Quetzales en la capa de presentacion (`Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" })`).
3. `DELETE` exitoso devuelve `204` sin cuerpo: no intentar `response.json()`.
4. Para crear, enviar `price` como numero JSON, nunca como cadena (`"85.00"` provoca `400`).
5. Centralizar el manejo de `500` y `503` con mensajes genericos; no exponer el detalle tecnico al usuario.
6. El listado no esta paginado: devuelve todos los registros existentes.
7. No hay autenticacion ni rate limiting en esta version.
