"""Pruebas de UI en Chromium con transporte HTTP mediado por Python.

La UI, lógica y eventos de Chromium son reales, y las solicitudes llegan al servidor
HTTP de mock_api. El puente evita el bloqueo de loopback impuesto en algunos
entornos de ejecución de navegadores automatizados.
"""
import json
import os
import re
import sys
import threading
from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'mock'))
import mock_api
from playwright.sync_api import sync_playwright, expect

WEB_ROOT = Path(__file__).resolve().parents[1]
FETCH_POLYFILL = """
window.__testFailFetch = '';
window.fetch = async (path, options = {}) => {
  if (window.__testFailFetch === 'offline') throw new TypeError('Network disconnected');
  if (window.__testFailFetch === '503') return new Response('Gateway offline', { status: 503 });
  const res = await window.__pythonHttpBridge({
    path: String(path), method: options.method || 'GET', body: options.body ?? null
  });
  return new Response(res.body === '' ? (res.status === 204 ? null : '') : res.body, {
    status: res.status,
    headers: { 'Content-Type': res.content_type }
  });
};
true;
"""


def run():
    mock_api.UPSTREAM = None
    server = ThreadingHTTPServer(('127.0.0.1', 0), mock_api.KubeLabHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f'http://127.0.0.1:{server.server_port}'
    html = (WEB_ROOT / 'index.html').read_text()
    html = re.sub(r'<script\s+defer\s+src="[^"]+"\s*></script>', '', html)
    html = re.sub(r'<link\s+rel="stylesheet"\s+href="[^"]+"\s*>', '', html)
    css = (WEB_ROOT / 'css/styles.css').read_text()
    app = (WEB_ROOT / 'js/app.js').read_text()
    config = (WEB_ROOT / 'js/config.js').read_text()
    checks = []

    def bridge(request):
        path = request['path']
        assert path.startswith('/api/'), 'Solicitud inesperada: ' + path
        url = origin + path
        body = request['body'].encode('utf8') if request['body'] is not None else None
        req = Request(url, method=request['method'], data=body,
                      headers={'Accept': 'application/json', 'Content-Type': 'application/json'})
        try:
            response = urlopen(req, timeout=8)
        except HTTPError as error:
            response = error
        with response:
            raw = response.read().decode('utf8')
            return {'status': response.status, 'body': raw,
                    'content_type': response.headers.get('Content-Type', 'application/json')}

    def setup(page):
        page.expose_function('__pythonHttpBridge', bridge)
        page.set_content(html, wait_until='load')
        page.add_style_tag(content=css)
        page.evaluate(FETCH_POLYFILL)
        page.evaluate(config)
        page.evaluate(app)

    try:
        with sync_playwright() as playwright:
            executable = os.getenv('CHROMIUM_EXECUTABLE') or None
            args = ['--no-sandbox'] if hasattr(os, 'geteuid') and os.geteuid() == 0 else []
            browser = playwright.chromium.launch(headless=True, executable_path=executable, args=args)
            try:
                page = browser.new_page(viewport={'width': 1440, 'height': 900})
                failures = []
                page.on('pageerror', lambda error: failures.append(str(error)))
                setup(page)

                expect(page.locator('#api-status-label')).to_have_text('API conectada')
                expect(page.locator('#products-tbody tr')).to_have_count(2)
                expect(page.locator('#stat-value')).to_contain_text('Q')
                checks.append('inicio + GET productos + moneda GTQ')

                page.locator('#search-products').fill('Zephyrus')
                expect(page.locator('#products-tbody tr')).to_have_count(1)
                page.locator('#search-products').fill('')
                checks.append('buscador')

                page.locator('#add-product').click()
                page.locator('#product-name').fill('')
                page.locator('#product-price').fill('10')
                page.locator('#product-stock').fill('2')
                page.locator('#save-product').click()
                expect(page.locator('#product-dialog')).to_be_visible()
                assert page.locator('#product-name').evaluate('(el) => el.validity.valueMissing')
                page.locator('#product-name').fill('Teclado KubeLab')
                page.locator('#product-description').fill('Switches rojos')
                page.locator('#product-price').fill('250.50')
                page.locator('#product-stock').fill('9')
                page.locator('#save-product').click()
                expect(page.locator('#product-dialog')).to_be_hidden()
                expect(page.locator('#products-tbody tr')).to_have_count(3)
                expect(page.locator('#products-tbody')).to_contain_text('Teclado KubeLab')
                checks.append('validación del nombre y creación POST')

                page.get_by_role('button', name='Editar Teclado KubeLab', exact=True).click()
                expect(page.locator('#product-dialog')).to_be_visible()
                page.locator('#product-name').fill('Teclado KubeLab PRO')
                page.locator('#product-stock').fill('4')
                page.locator('#save-product').click()
                expect(page.locator('#product-dialog')).to_be_hidden()
                expect(page.locator('#products-tbody')).to_contain_text('Teclado KubeLab PRO')
                checks.append('GET individual y actualización PUT')

                page.get_by_role('button', name='Eliminar Teclado KubeLab PRO').click()
                expect(page.locator('#delete-dialog')).to_be_visible()
                page.locator('#cancel-delete').click()
                expect(page.locator('#products-tbody')).to_contain_text('Teclado KubeLab PRO')
                page.get_by_role('button', name='Eliminar Teclado KubeLab PRO').click()
                page.locator('#confirm-delete').click()
                expect(page.locator('#delete-dialog')).to_be_hidden()
                expect(page.locator('#products-tbody tr')).to_have_count(2)
                checks.append('cancelación y confirmación DELETE 204')

                page.evaluate('window.__testFailFetch = "503"')
                page.locator('#refresh-products').click()
                expect(page.locator('#api-status-label')).to_have_text('API sin conexión')
                expect(page.locator('#error-banner')).to_be_visible()
                expect(page.locator('#error-message')).to_contain_text('no está disponible')
                page.evaluate('window.__testFailFetch = ""')
                page.locator('#retry-products').click()
                expect(page.locator('#products-tbody tr')).to_have_count(2)
                checks.append('error HTTP 503 y reintento exitoso')

                page.evaluate('window.__testFailFetch = "offline"')
                page.locator('#refresh-products').click()
                expect(page.locator('#api-status-label')).to_have_text('API sin conexión')
                expect(page.locator('#error-banner')).to_be_visible()
                checks.append('error por backend desconectado')

                mobile = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=1)
                setup(mobile)
                expect(mobile.locator('#products-tbody tr')).to_have_count(2)
                expect(mobile.locator('#add-product')).to_be_visible()
                checks.append('vista móvil 390px')

                assert not failures, f'Errores JavaScript: {failures}'
                checks.append('sin excepciones JavaScript')
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(3)
    for label in checks:
        print('OK:', label)
    print(f'BROWSER RESULT: PASS ({len(checks)} comprobaciones; transporte HTTP mediado por Python)')

if __name__ == '__main__':
    run()
