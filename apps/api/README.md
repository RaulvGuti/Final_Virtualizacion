# KubeLab API

API REST del proyecto KubeLab construida con Node.js, TypeScript, Express y PostgreSQL.

## Requisitos

- Node.js 18+
- PostgreSQL 14+ (o un contenedor Docker con PostgreSQL)
- npm 9+

## Variables de entorno

Copia `.env.example` a `.env` y ajusta los valores:

| Variable      | Descripcion                  | Valor por defecto |
| ------------- | ---------------------------- | ----------------- |
| `PORT`        | Puerto HTTP de la API        | `3000`            |
| `DB_HOST`     | Host de PostgreSQL           | `localhost`       |
| `DB_PORT`     | Puerto de PostgreSQL         | `5432`            |
| `DB_USER`     | Usuario de PostgreSQL        | `postgres`        |
| `DB_PASSWORD` | Contrasena de PostgreSQL     | `secret`          |
| `DB_NAME`     | Nombre de la base de datos   | `kubelab_db`      |

Al arrancar, la API verifica la conexion y crea automaticamente la tabla `products` si no existe. Si la base de datos no esta disponible, reintenta sin detener el proceso.

## Comandos locales

```bash
npm install       # Instala dependencias
npm run dev       # Ejecuta en modo desarrollo (ts-node-dev)
npm run build     # Compila TypeScript a dist/ y copia el SQL
npm start         # Ejecuta la build de produccion
npm test          # Ejecuta las pruebas con Jest + Supertest
```

## Docker

```bash
docker build -t kubelab-api .
docker run -p 3000:3000 --env-file .env kubelab-api
```

## Endpoints

Base URL local: `http://localhost:3000`

### GET /health

Estado de la API.

**Respuesta 200:**

```json
{
  "status": "ok",
  "timestamp": "2026-01-01T12:00:00.000Z",
  "uptime": 42.5
}
```

### GET /metrics

Metricas de Prometheus (`text/plain; version=0.0.4`). Incluye metricas por defecto de Node.js, `http_requests_total` y `http_request_duration_seconds`.

### GET /api/products

Lista todos los productos.

**Respuesta 200:**

```json
[
  {
    "id": 1,
    "name": "Teclado mecanico",
    "description": "Teclado RGB",
    "price": 49.99,
    "stock": 10,
    "created_at": "2026-01-01T12:00:00.000Z"
  }
]
```

### GET /api/products/:id

Obtiene un producto por id.

- `404` si no existe.
- `400` si el id no es un entero positivo.

**Respuesta 200:**

```json
{
  "id": 1,
  "name": "Teclado mecanico",
  "description": "Teclado RGB",
  "price": 49.99,
  "stock": 10,
  "created_at": "2026-01-01T12:00:00.000Z"
}
```

### POST /api/products

Crea un producto.

**Body:**

```json
{
  "name": "Mouse gamer",
  "description": "Mouse con 6 botones",
  "price": 29.99,
  "stock": 5
}
```

**Respuesta 201:**

```json
{
  "id": 2,
  "name": "Mouse gamer",
  "description": "Mouse con 6 botones",
  "price": 29.99,
  "stock": 5,
  "created_at": "2026-01-01T12:05:00.000Z"
}
```

**Validaciones:**

- `name` obligatorio y no vacio.
- `price` obligatorio, numerico y no negativo.
- `stock` opcional, entero no negativo (por defecto `0`).
- `description` opcional, texto.

**Respuesta 400:**

```json
{
  "errors": ["El campo 'price' no puede ser negativo"]
}
```

### PUT /api/products/:id

Actualiza parcialmente un producto. Solo se modifican los campos enviados.

**Body:**

```json
{
  "price": 24.99,
  "stock": 8
}
```

**Respuesta 200:**

```json
{
  "id": 2,
  "name": "Mouse gamer",
  "description": "Mouse con 6 botones",
  "price": 24.99,
  "stock": 8,
  "created_at": "2026-01-01T12:05:00.000Z"
}
```

- `404` si no existe.
- `400` si no se envia ningun campo o alguna validacion falla.

### DELETE /api/products/:id

Elimina un producto.

- `204` sin contenido si se elimino.
- `404` si no existe.
- `400` si el id no es un entero positivo.

## Pruebas

```bash
npm test
```

Las pruebas verifican:

- `GET /health` responde `200` con `status: "ok"`.
- `POST /api/products` rechaza productos sin nombre, con nombre vacio, sin precio o con precio negativo.
