# Reporte de Pruebas - KubeLab API

Documento de pruebas unitarias, de validacion y de comprobacion manual en runtime para `apps/api`.

## 1. Marco de pruebas

| Elemento | Detalle |
| --- | --- |
| Framework de pruebas | Jest `29.7.0` |
| Cliente HTTP | Supertest `7.3.1` |
| Transformador TypeScript | `ts-jest` `29.4.15` |
| Entorno de ejecucion | Node.js 18, `testEnvironment: "node"` |
| Configuracion | `jest.config.js` + `tsconfig.test.json` |
| Comando | `npm test` (`jest --runInBand`) |
| Ubicacion de suites | `tests/` |
| Base de datos requerida | No para las suites actuales |

`jest.config.js` define `roots: ["<rootDir>/tests"]`, `testMatch: ["**/*.test.ts"]` y transforma con `tsconfig.test.json`, que extiende `tsconfig.json` con `noEmit` y tipos `node`/`jest`.

La ejecucion es serial (`--runInBand`) para evitar contención sobre el pool de PostgreSQL cuando se agreguen pruebas de integracion.

> En Windows PowerShell use `npm test`. Si `npm.ps1` esta bloqueado por la politica de ejecucion, ejecute `npm.cmd test`.

---

## 2. Resultado de la ultima ejecucion

Comando:

```bash
npm test
```

Resultado (2026-11-04):

```text
PASS tests/products.test.ts
PASS tests/health.test.ts

Test Suites: 2 passed, 2 total
Tests:       5 passed, 5 total
Snapshots:   0 total
Time:        2.393 s
Ran all test suites.
```

Codigo de salida: `0`.

---

## 3. Suites automatizadas implementadas

### 3.1 `tests/health.test.ts` - Estado y salud

| Caso | Peticion | Verificacion | Resultado |
| --- | --- | --- | --- |
| Estado de la API | `GET /health` | `200`, `status === "ok"`, `timestamp` string, `uptime` number | PASS |

Alcance: valida el liveness basico de Express y la forma del contrato de `/health`. No consulta PostgreSQL.

### 3.2 `tests/products.test.ts` - Validaciones de esquema al crear

| Caso | Cuerpo enviado | Verificacion | Resultado |
| --- | --- | --- | --- |
| Sin nombre | `{ description, price: 10, stock: 1 }` | `400`, error de `name` obligatorio | PASS |
| Nombre vacio | `{ name: "   ", price: 10 }` | `400`, error de `name` obligatorio | PASS |
| Precio negativo | `{ name: "Producto invalido", price: -5 }` | `400`, error de precio no negativo | PASS |
| Sin precio | `{ name: "Producto sin precio" }` | `400`, error de precio obligatorio | PASS |

Todas las validaciones se resuelven antes de tocar la base de datos, por lo que la suite no requiere PostgreSQL en ejecucion.

### 3.3 Cobertura real frente al alcance deseado

| Area | Estado en el repositorio |
| --- | --- |
| Verificacion de estado/salud (`/health`) | Automatizada |
| Validaciones de esquema al crear (`POST`) | Automatizada |
| Validaciones de esquema al actualizar (`PUT`) | **No automatizada** |
| Readiness (`/ready`) | **No automatizada** |
| Operaciones CRUD completas contra PostgreSQL | **No automatizadas** (verificacion manual en seccion 6) |

Las suites de CRUD requieren una instancia real de PostgreSQL y aun no forman parte de `npm test`. La seccion 7 propone como cerrar esa brecha.

---

## 4. Pruebas manuales con `curl`

Ejemplos ejecutables en Windows con `curl.exe` (evita el alias `curl` de PowerShell, que apunta a `Invoke-WebRequest`).

### 4.1 Salud y readiness

```bash
curl.exe -i http://localhost:3000/health
curl.exe -i http://localhost:3000/ready
curl.exe -i http://localhost:3000/metrics
```

Respuestas esperadas:

```json
{"status":"ok","timestamp":"2026-11-04T18:30:00.000Z","uptime":42.5}
```

```json
{"status":"ready","database":"connected"}
```

`/metrics` responde `200` con `Content-Type: text/plain; version=0.0.4; charset=utf-8`.

### 4.2 Listar y consultar

```bash
curl.exe -i http://localhost:3000/api/products
curl.exe -i http://localhost:3000/api/products/1
```

### 4.3 Crear

```bash
curl.exe -i -X POST http://localhost:3000/api/products -H "Content-Type: application/json" -d '{"name":"Mouse Gamer","description":"Mouse optico 6 botones","price":45.00,"stock":25}'
```

Si necesita dividir el comando en PowerShell, use el backtick como continuacion de linea al final de cada renglon.

Respuesta esperada: `201` con el producto creado y `price` como numero (`45`, no `"45.00"`).

### 4.4 Actualizar

```bash
curl.exe -i -X PUT http://localhost:3000/api/products/4 -H "Content-Type: application/json" -d '{"price":39.50,"stock":20}'
```

Respuesta esperada: `200` con `price: 39.5`.

### 4.5 Eliminar

```bash
curl.exe -i -X DELETE http://localhost:3000/api/products/4
```

Respuesta esperada: `204 No Content`, sin cuerpo.

### 4.6 Casos de error

```bash
curl.exe -i http://localhost:3000/api/products/abc
curl.exe -i http://localhost:3000/api/products/999999
curl.exe -i -X POST http://localhost:3000/api/products -H "Content-Type: application/json" -d '{"name":"","price":-1}'
```

Resultados esperados: `400` (id invalido), `404` (producto inexistente) y `400` con arreglo `errors` (validacion).

Para comprobar `503` en `/ready`, detenga PostgreSQL y consulte de nuevo:

```bash
docker compose stop postgres
curl.exe -i http://localhost:3000/ready
docker compose start postgres
```

---

## 5. Pruebas manuales con `Invoke-RestMethod`

Equivalentes para PowerShell nativo.

```powershell
$base = "http://localhost:3000"

# Salud y readiness
Invoke-RestMethod -Uri "$base/health" -Method Get
Invoke-RestMethod -Uri "$base/ready" -Method Get

# Listado y detalle
Invoke-RestMethod -Uri "$base/api/products" -Method Get
Invoke-RestMethod -Uri "$base/api/products/1" -Method Get
```

### 5.1 Crear un producto

```powershell
$body = @{
  name        = "Mouse Gamer"
  description = "Mouse optico 6 botones"
  price       = 45.00
  stock       = 25
} | ConvertTo-Json

$created = Invoke-RestMethod -Uri "$base/api/products" -Method Post `
  -ContentType "application/json" -Body $body

$created
$created.id
```

### 5.2 Actualizar un producto

```powershell
$id = $created.id
$update = @{ price = 39.50; stock = 20 } | ConvertTo-Json

Invoke-RestMethod -Uri "$base/api/products/$id" -Method Put `
  -ContentType "application/json" -Body $update
```

### 5.3 Eliminar un producto

```powershell
$response = Invoke-WebRequest -Uri "$base/api/products/$id" -Method Delete
$response.StatusCode
```

`Invoke-WebRequest` permite leer `StatusCode`; `Invoke-RestMethod` no devuelve cuerpo para un `204`.

### 5.4 Capturar errores HTTP

```powershell
try {
  Invoke-RestMethod -Uri "$base/api/products/999999" -Method Get
} catch {
  $status = $_.Exception.Response.StatusCode.value__
  $detalle = $_.ErrorDetails.Message
  "HTTP $status - $detalle"
}
```

Salida esperada: `HTTP 404 - {"error":"Producto no encontrado"}`.

---

## 6. Pruebas de integracion CRUD contra PostgreSQL

Procedimiento manual reproducible para validar el ciclo completo. Requiere la pila levantada (`docker compose up -d --build`) o PostgreSQL local con la API apuntando a el.

### 6.1 Preparacion

```bash
docker compose up -d --build
docker compose ps
docker compose logs api --tail=50
curl.exe -i http://localhost:3000/ready
```

No continuar hasta que `/ready` devuelva `200` con `database: "connected"`.

### 6.2 Ciclo completo

1. **Create**: `POST /api/products` con `price` numerico. Verificar `201`, `id` generado y `price` numerico.
2. **Read (listado)**: `GET /api/products`. Verificar que el nuevo `id` aparece y el arreglo esta ordenado por `id` ascendente.
3. **Read (detalle)**: `GET /api/products/{id}`. Verificar coincidencia campo a campo.
4. **Update**: `PUT /api/products/{id}` con `price` y `stock`. Verificar `200` y que el resto de campos no cambio.
5. **Delete**: `DELETE /api/products/{id}`. Verificar `204` sin cuerpo.
6. **Read despues de delete**: `GET /api/products/{id}`. Verificar `404`.
7. **Persistencia**: reiniciar solo la API con `docker compose restart api` y confirmar que los productos creados antes del borrado siguen presentes.

### 6.3 Verificacion directa en base de datos

```bash
docker compose exec postgres psql -U postgres -d kubelab_db -c "SELECT id, name, price, stock FROM products ORDER BY id;"
docker compose exec postgres psql -U postgres -d kubelab_db -c "\d products"
```

Esquema esperado:

| Columna | Tipo | Restriccion |
| --- | --- | --- |
| `id` | `SERIAL` | `PRIMARY KEY` |
| `name` | `VARCHAR(255)` | `NOT NULL` |
| `description` | `TEXT` | nullable |
| `price` | `NUMERIC(10, 2)` | `NOT NULL` |
| `stock` | `INTEGER` | `NOT NULL DEFAULT 0` |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT CURRENT_TIMESTAMP` |

### 6.4 Resultado del ciclo manual

| Paso | Codigo esperado | Criterio de aceptacion |
| --- | --- | --- |
| Create | `201` | Producto con `id` nuevo y `price` numerico |
| Read listado | `200` | Incluye el producto creado |
| Read detalle | `200` | Campos coinciden con el create |
| Update | `200` | Solo cambian los campos enviados |
| Delete | `204` | Sin cuerpo |
| Read post-delete | `404` | `{"error":"Producto no encontrado"}` |
| Persistencia | `200` | Datos sobreviven al reinicio de la API |

---

## 7. Brechas y plan de mejora

Para alcanzar la cobertura descrita en el alcance ideal, se recomienda agregar las siguientes suites:

| Suite propuesta | Casos |
| --- | --- |
| `tests/ready.test.ts` | `/ready` `200` con PostgreSQL disponible; `/ready` `503` con PostgreSQL detenido o pool simulado con error |
| `tests/products-validation.test.ts` | `PUT` con `price` negativo, `stock` decimal, `description` no textual, cuerpo sin campos (`400`) y `name` vacio |
| `tests/products-crud.test.ts` | Create, read, update y delete contra PostgreSQL real con limpieza (`TRUNCATE products RESTART IDENTITY CASCADE`) en `beforeEach` |
| `tests/products-errors.test.ts` | `GET /api/products/abc` (`400`), `GET /api/products/999999` (`404`), `DELETE` inexistente (`404`) |
| `tests/metrics.test.ts` | `/metrics` responde `200`, `Content-Type` Prometheus y contiene `http_requests_total` |

Consideraciones para la suite de integracion:

- Usar una base de datos exclusiva de pruebas (`DB_NAME=kubelab_test`) y variables de entorno en `jest.setup.ts`.
- Ejecutar con `--runInBand` (ya configurado) para evitar carreras sobre la misma tabla.
- Cerrar el pool en `afterAll` (`await pool.end()`) para que Jest no quede con handles abiertos.
- Sembrar datos propios en `beforeEach`; no depender del seed de `init.sql`.

---

## 8. Integracion continua

El workflow `.github/workflows/ci.yml` se ejecuta en `push` a `main`/`dev` y en `pull_request` a `main`, con `working-directory: apps/api`:

1. `actions/checkout@v4`
2. `actions/setup-node@v4` con Node 18 y cache de `apps/api/package-lock.json`
3. `npm ci`
4. `npm test`
5. En `push`: login a GHCR, metadata de imagen y `docker/build-push-action@v5`

Si `npm test` falla, el pipeline se detiene antes de construir o publicar la imagen, por lo que las suites actuales actuan como puerta de calidad minima.

---

## 9. Hallazgos y observaciones

1. **Seed repetible**: `src/db/init.sql` inserta tres productos con `ON CONFLICT DO NOTHING`, pero `products` no tiene una restriccion unica sobre `name`. En cada arranque de la API el seed vuelve a insertar los tres registros. Para pruebas y produccion conviene agregar `UNIQUE(name)` o condicionar el seed con `WHERE NOT EXISTS`.
2. **Precios**: PostgreSQL devuelve `NUMERIC` como cadena; la API lo convierte con `Number()`. Las pruebas deben comparar contra numero (`45`), no contra cadena (`"45.00"`).
3. **`/health` no valida base de datos**: es correcto para liveness, pero no debe usarse como indicador de disponibilidad funcional. Para eso existe `/ready`.
4. **Sin pruebas de `/ready` ni de `PUT`**: son los huecos mas relevantes frente al contrato documentado en `API-CONTRACT.md`.
5. **Sin autenticacion**: cualquier cliente con acceso a la red puede modificar productos. Aceptable para el laboratorio, no para produccion.
6. **CORS abierto**: `cors()` sin opciones permite cualquier origen; revisar antes de exponer la API fuera del cluster.
