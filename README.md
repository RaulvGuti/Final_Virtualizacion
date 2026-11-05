# KubeLab — entrega del frontend para K3s

La aplicación real está en [`apps/web`](apps/web). Los archivos para GitHub Actions están en `.github/workflows/frontend-ci.yml` **en la raíz del repositorio**.

**Tecnología:** HTML5 + CSS3 + JavaScript nativo, sin React/Vite/Node ni `package.json`. **Producción:** Nginx, puerto **80**. **API navegador:** `/api`, reenviada por Nginx a un Service interno K3s mediante `API_UPSTREAM`. **Moneda:** GTQ (Q).

## Inicio local

```powershell
cd apps/web
python mock/mock_api.py
```

Abrir `http://localhost:8000`. El mock guarda productos solo en RAM y **no** reemplaza PostgreSQL.

Con API real (cuando sea accesible desde esa computadora):

```powershell
python mock/mock_api.py --upstream http://SERVIDOR_RAUL:3000
```

No colocar IPs específicas en archivos del frontend. Para probar en Windows `python` puede sustituirse por `py`.

## Archivos importantes

- `apps/web/index.html`, `css/styles.css`, `js/app.js`, `js/config.js`: web que consume API real mediante HTTP.
- `apps/web/Dockerfile`, `nginx.conf.template`, `.dockerignore`, `.env.example`: producción Nginx y proxy.
- `apps/web/k8s/`: Deployment, ClusterIP, ConfigMap y manifiesto Ingress opcional.
- `apps/web/tests/`: pruebas HTTP de mock, navegador Chromium, Nginx y manifiestos.
- `.github/workflows/frontend-ci.yml`: CI y publicación GHCR en pushes a `main` / versiones, nunca despliegue al clúster.
- `apps/web/DEPLOYMENT.md`: Docker, GHCR, K3s, GitOps y funcionamiento sin Internet.
- `apps/web/TESTING.md`: pruebas ejecutadas y faltantes.
- `apps/web/API-INTEGRATION.md`: contrato con Raúl.
- `apps/web/AUDIT_REPORT.md`: auditoría y estado real.

> **Importante:** el Deployment usa por defecto `kubelab-web:dev` y un backend llamado `kubelab-api:3000` **solo como ejemplos**. Fernando debe confirmar el nombre y puerto reales del Service API, la imagen y el namespace. No se ha modificado Proxmox, K3s ni la red física.
