"""Pruebas HTTP reales del servidor simulado, sin dependencias de terceros."""
import json
import sys
import threading
import unittest
from copy import deepcopy
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'mock'))
import mock_api

ORIGINAL = deepcopy(mock_api.PRODUCTS)

class HTTPContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        mock_api.UPSTREAM = None
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), mock_api.KubeLabHandler)
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(3)

    def setUp(self):
        with mock_api.LOCK:
            mock_api.PRODUCTS.clear()
            mock_api.PRODUCTS.update(deepcopy(ORIGINAL))
            mock_api.NEXT_ID = 3

    def call(self, method, path, data=None):
        content = json.dumps(data).encode('utf-8') if data is not None else None
        req = Request(self.base + path, data=content, method=method,
                      headers={'Content-Type': 'application/json'} if content else {})
        try:
            result = urlopen(req, timeout=3)
        except HTTPError as exc:
            result = exc
        with result:
            raw = result.read()
            return result.status, (json.loads(raw) if raw and "json" in result.headers.get("Content-Type", "") else raw if raw else None), result.headers

    def test_static_assets_and_health(self):
        code, html, headers = self.call('GET','/')
        self.assertEqual(code,200)
        self.assertIn('text/html',headers.get('Content-Type',''))
        code, health,_ = self.call('GET','/health')
        self.assertEqual(code,200)
        self.assertEqual(health['status'],'ok')
        self.assertIsInstance(health['uptime'],float)
        code,_,_ = self.call('GET','/js/app.js')
        self.assertEqual(code,200)

    def test_get_list_one_and_404(self):
        code, data,_=self.call('GET','/api/products')
        self.assertEqual(code,200)
        self.assertEqual(len(data),2)
        self.assertEqual(data[0]['name'],'Laptop ASUS ROG Zephyrus')
        code, one,_=self.call('GET','/api/products/1')
        self.assertEqual(code,200)
        self.assertIn('created_at',one)
        code, missing,_=self.call('GET','/api/products/9999')
        self.assertEqual(code,404)
        self.assertEqual(missing['error'],'Producto no encontrado')

    def test_crud_cycle_with_empty_delete_response(self):
        sample={'name':'Monitor 24', 'description':'IPS', 'price':350.5, 'stock':7}
        code, created,_=self.call('POST','/api/products',sample)
        self.assertEqual(code,201)
        self.assertIsInstance(created['id'],int)
        self.assertEqual(created['price'],350.5)
        self.assertIn('created_at',created)
        path=f"/api/products/{created['id']}"
        code, updated,_=self.call('PUT',path,{'name':'Monitor 27','description':'IPS','price':400,'stock':2})
        self.assertEqual(code,200)
        self.assertEqual(updated['stock'],2)
        self.assertEqual(updated['created_at'],created['created_at'])
        code, body,_=self.call('DELETE',path)
        self.assertEqual(code,204)
        self.assertIsNone(body)
        code, err,_=self.call('GET',path)
        self.assertEqual(code,404)
        self.assertEqual(err['error'],'Producto no encontrado')

    def test_server_validation(self):
        for data in (
           {'name':'', 'description':'x', 'price':2,'stock':2},
           {'name':'a','description':'x','price':-2,'stock':2},
           {'name':'a','description':'x','price':2,'stock':1.5},
           {'name':'a','description':'x','price':'Q 30','stock':2},
        ):
            with self.subTest(data=data):
                code, err,_=self.call('POST','/api/products',data)
                self.assertEqual(code,400)
                self.assertIn('message',err)

    def test_unsupported_api_route(self):
        code, payload,_=self.call('GET','/api/unknown')
        self.assertEqual(code,404)
        self.assertIn('message',payload)

if __name__ == '__main__':
    unittest.main(verbosity=2)
