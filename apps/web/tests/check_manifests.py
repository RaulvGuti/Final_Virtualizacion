"""Validación estática de manifiestos. Requiere PyYAML; no sustituye kubectl dry-run."""
from pathlib import Path
import yaml
web=Path(__file__).resolve().parents[1]
ks=web/'k8s'
items={}
for name in ('configmap.yaml','deployment.yaml','service.yaml','ingress-ip.yaml','kustomization.yaml'):
    doc=yaml.safe_load((ks/name).read_text())
    assert doc.get('apiVersion') and doc.get('kind'),name
    items[name]=doc
assert items['deployment.yaml']['kind']=='Deployment'
assert items['service.yaml']['spec']['type']=='ClusterIP'
assert items['service.yaml']['spec']['selector']==items['deployment.yaml']['spec']['selector']['matchLabels']
assert items['deployment.yaml']['spec']['replicas']==1
c=items['deployment.yaml']['spec']['template']['spec']['containers'][0]
assert c['imagePullPolicy']=='IfNotPresent'
assert c['readinessProbe']['httpGet']['path']=='/healthz'
assert c['livenessProbe']['httpGet']['path']=='/healthz'
assert c['resources']['limits']['memory']=='128Mi'
assert items['ingress-ip.yaml']['kind']=='Ingress'
assert items['kustomization.yaml']['kind']=='Kustomization'
assert not any(x in (ks/'configmap.yaml').read_text() for x in ('192.168.50.','localhost','127.0.0.1'))
print('MANIFEST CHECK: PASS (5 YAMLs, coherencia básica)')
