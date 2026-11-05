"""Prueba nativa de proxy de Nginx (sin Docker), mismo template de producción.
Requiere `nginx` y `envsubst` instalados; no modifica /etc/nginx.
"""
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'mock'))
import mock_api
WEB=Path(__file__).resolve().parents[1]


def unused_port():
    sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close();return port

def req(url,method='GET',body=None):
    request=Request(url,data=body,method=method,headers={'Content-Type':'application/json'} if body else {})
    try: resp=urlopen(request,timeout=4)
    except HTTPError as e: resp=e
    with resp: return resp.status,resp.read(),resp.headers

def main():
    if not shutil.which('nginx') or not shutil.which('envsubst'):
        print('SKIP: nginx/envsubst no disponible');return 2
    mock_api.UPSTREAM=None
    mock=ThreadingHTTPServer(('127.0.0.1',0),mock_api.KubeLabHandler)
    thread=threading.Thread(target=mock.serve_forever,daemon=True);thread.start()
    prefix=Path(tempfile.mkdtemp(prefix='kubelab-nginx-'))
    try:
        (prefix/'logs').mkdir();(prefix/'conf').mkdir()
        front_port=unused_port()
        env=os.environ.copy();env['API_UPSTREAM']=f'127.0.0.1:{mock.server_port}'
        template=(WEB/'nginx.conf.template').read_text()
        p=subprocess.run(['envsubst','${API_UPSTREAM}'],input=template,text=True,capture_output=True,env=env,check=True)
        config=p.stdout.replace('listen 80;','listen 127.0.0.1:'+str(front_port)+';').replace('/usr/share/nginx/html',str(WEB))
        conf=prefix/'conf'/'nginx.conf'
        conf.write_text('events { worker_connections 64; }\nhttp {\n'+config+'\n}\n')
        test=subprocess.run(['nginx','-t','-p',str(prefix)+'/', '-c',str(conf)],text=True,capture_output=True)
        if test.returncode:raise AssertionError(test.stderr)
        proc=subprocess.Popen(['nginx','-g','daemon off;', '-p',str(prefix)+'/', '-c',str(conf)],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        import time
        try:
            url=f'http://127.0.0.1:{front_port}'
            for _ in range(30):
                try:
                    if req(url+'/healthz')[0]==200: break
                except Exception:time.sleep(.1)
            else:raise AssertionError('Nginx no arrancó')
            assert req(url+'/')[0]==200
            assert req(url+'/css/styles.css')[0]==200
            assert req(url+'/js/app.js')[0]==200
            assert req(url+'/healthz')[1]==b'ok'
            assert req(url+'/health')[0]==200
            status,data,_=req(url+'/api/products')
            assert status==200 and b'Zephyrus' in data
            assert req(url+'/api/products/999999')[0]==404
            assert req(url+'/ruta-spa/no-existente')[0]==200
            payload=b'{"name":"Prueba Nginx","description":"proxy","price":10,"stock":2}'
            assert req(url+'/api/products',method='POST',body=payload)[0]==201
            print('OK: nginx -t, estáticos, SPA fallback, /healthz, /health, /api GET + POST, 404')
            print('NGINX INTEGRATION RESULT: PASS')
            return 0
        finally:
            proc.terminate()
            try:proc.wait(timeout=4)
            except subprocess.TimeoutExpired: proc.kill();proc.wait()
    finally:
        mock.shutdown();mock.server_close();thread.join(3)
        shutil.rmtree(prefix,ignore_errors=True)
if __name__=='__main__':sys.exit(main())
