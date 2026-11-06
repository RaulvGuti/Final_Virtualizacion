#!/usr/bin/env python3
"""Servidor web local KubeLab.

Modo demo: python mock/mock_api.py
Modo API real de Raúl: python mock/mock_api.py --upstream http://localhost:3000
Navegador: http://localhost:8000
Sin dependencias externas y sin requerir CORS.
"""

import argparse
import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from time import monotonic
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, ProxyHandler
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from urllib.parse import unquote, urlsplit

WEB_ROOT = Path(__file__).resolve().parents[1]
LOCK = Lock()
PRODUCTS = {
    1: {"id": 1, "name": "Laptop ASUS ROG Zephyrus", "description": "Gaming laptop 16GB RAM RTX 4050", "price": 1250.50, "stock": 10, "created_at": "2026-11-04T20:00:00.000Z"},
    2: {"id": 2, "name": "Mouse Gamer", "description": "Mouse óptico RGB", "price": 45.00, "stock": 25, "created_at": "2026-11-04T20:05:00.000Z"},
}
NEXT_ID = 3
UPSTREAM = None
SERVER_START = monotonic()
NO_PROXY_OPENER = build_opener(ProxyHandler({}))
DETAIL_RE = re.compile(r"^/api/products/([^/]+)/?$")


def validate_product(data):
    if not isinstance(data, dict):
        return None, "Se esperaba un objeto JSON."
    name = data.get("name")
    description = data.get("description", "")
    price = data.get("price")
    stock = data.get("stock")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 120:
        return None, "El nombre es obligatorio y debe tener máximo 120 caracteres."
    if not isinstance(description, str) or len(description) > 500:
        return None, "La descripción debe tener máximo 500 caracteres."
    if isinstance(price, bool) or not isinstance(price, (int, float)) or not (0 <= price <= 999999999):
        return None, "El precio debe ser un número entre 0 y 999999999."
    if isinstance(stock, bool) or not isinstance(stock, int) or not (0 <= stock <= 999999999):
        return None, "Las existencias deben ser un número entero no negativo."
    return {"name": name.strip(), "description": description.strip(), "price": round(price, 2), "stock": stock}, None


class KubeLabHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, value=None):
        body = b"" if value is None else json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        if body:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 65536:
                return None, "El cuerpo de la solicitud está vacío o es demasiado grande."
            return json.loads(self.rfile.read(length)), None
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
            return None, "JSON inválido."

    def product_id(self, path):
        match = DETAIL_RE.fullmatch(path)
        if not match:
            return None
        try:
            return int(unquote(match.group(1)))
        except ValueError:
            return -1

    def proxy_request(self):
        """Reenviar /api/* y /health al backend real conservando ruta y método.

        La web y la API usan el mismo origen local; no hace falta CORS en desarrollo.
        """
        target = UPSTREAM.rstrip("/") + self.path
        length = int(self.headers.get("Content-Length", "0"))
        if length > 65536:
            return self.send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "Solicitud demasiado grande."})
        body = self.rfile.read(length) if length else None
        headers = {"Accept": "application/json"}
        if body is not None:
            headers["Content-Type"] = self.headers.get("Content-Type", "application/json")
        req = Request(target, data=body, headers=headers, method=self.command)
        try:
            with NO_PROXY_OPENER.open(req, timeout=12) as remote:
                status, payload = remote.status, remote.read()
                content_type = remote.headers.get("Content-Type", "application/json")
        except HTTPError as error:
            status, payload = error.code, error.read()
            content_type = error.headers.get("Content-Type", "application/json")
        except (URLError, OSError, TimeoutError) as error:
            return self.send_json(HTTPStatus.BAD_GATEWAY, {"error": f"No se pudo conectar con la API real: {error}"})
        self.send_response(status)
        if payload:
            self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        if payload:
            self.wfile.write(payload)

    def is_proxy_request(self):
        path = urlsplit(self.path).path
        return UPSTREAM is not None and (path == "/health" or path.startswith("/api/"))

    def do_OPTIONS(self):
        self.send_json(HTTPStatus.NO_CONTENT)

    def do_GET(self):
        if self.is_proxy_request():
            return self.proxy_request()
        path = urlsplit(self.path).path
        if path in ("/health", "/healthz"):
            return self.send_json(HTTPStatus.OK, {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "uptime": round(monotonic() - SERVER_START, 2)})
        if path.rstrip("/") == "/api/products":
            with LOCK:
                result = deepcopy(list(PRODUCTS.values()))
            return self.send_json(HTTPStatus.OK, result)
        product_id = self.product_id(path)
        if product_id is not None:
            with LOCK:
                product = deepcopy(PRODUCTS.get(product_id))
            return self.send_json(HTTPStatus.OK, product) if product else self.send_json(HTTPStatus.NOT_FOUND, {"error": "Producto no encontrado"})
        if path.startswith("/api/"):
            return self.send_json(HTTPStatus.NOT_FOUND, {"message": "Endpoint no encontrado."})
        return super().do_GET()

    def do_POST(self):
        if self.is_proxy_request():
            return self.proxy_request()
        global NEXT_ID
        if urlsplit(self.path).path.rstrip("/") != "/api/products":
            return self.send_json(HTTPStatus.NOT_FOUND, {"message": "Endpoint no encontrado."})
        data, error = self.read_json()
        if error:
            return self.send_json(HTTPStatus.BAD_REQUEST, {"message": error})
        product, error = validate_product(data)
        if error:
            return self.send_json(HTTPStatus.BAD_REQUEST, {"message": error})
        with LOCK:
            product["id"] = NEXT_ID
            product["created_at"] = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
            PRODUCTS[NEXT_ID] = product
            NEXT_ID += 1
        return self.send_json(HTTPStatus.CREATED, product)

    def do_PUT(self):
        if self.is_proxy_request():
            return self.proxy_request()
        product_id = self.product_id(urlsplit(self.path).path)
        if product_id is None:
            return self.send_json(HTTPStatus.NOT_FOUND, {"message": "Endpoint no encontrado."})
        data, error = self.read_json()
        if error:
            return self.send_json(HTTPStatus.BAD_REQUEST, {"message": error})
        product, error = validate_product(data)
        if error:
            return self.send_json(HTTPStatus.BAD_REQUEST, {"message": error})
        with LOCK:
            if product_id not in PRODUCTS:
                return self.send_json(HTTPStatus.NOT_FOUND, {"error": "Producto no encontrado"})
            product["id"] = product_id
            product["created_at"] = PRODUCTS[product_id]["created_at"]
            PRODUCTS[product_id] = product
        return self.send_json(HTTPStatus.OK, product)

    def do_DELETE(self):
        if self.is_proxy_request():
            return self.proxy_request()
        product_id = self.product_id(urlsplit(self.path).path)
        if product_id is None:
            return self.send_json(HTTPStatus.NOT_FOUND, {"message": "Endpoint no encontrado."})
        with LOCK:
            if product_id not in PRODUCTS:
                return self.send_json(HTTPStatus.NOT_FOUND, {"error": "Producto no encontrado"})
            del PRODUCTS[product_id]
        return self.send_json(HTTPStatus.NO_CONTENT)


def main():
    parser = argparse.ArgumentParser(description="API simulada y servidor web de KubeLab")
    parser.add_argument("--host", default="127.0.0.1", help="Host de escucha (por defecto 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Puerto de escucha (por defecto 8000)")
    parser.add_argument("--upstream", default=None, help="URL base de la API real, ej. http://localhost:3000 (sin /api)")
    args = parser.parse_args()
    global UPSTREAM
    UPSTREAM = args.upstream.rstrip("/") if args.upstream else None
    if UPSTREAM and urlsplit(UPSTREAM).scheme not in ("http", "https"):
        parser.error("--upstream debe comenzar con http:// o https://")
    server = ThreadingHTTPServer((args.host, args.port), KubeLabHandler)
    print(f"KubeLab (modo demo) activo en http://localhost:{args.port}", flush=True)
    print(f"Modo: {'proxy a API real ' + UPSTREAM if UPSTREAM else 'API demo (datos temporales en RAM)'}", flush=True)
    print("Pulsa Ctrl+C para detenerlo.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
