/*
 * Configuración del frontend. El valor por defecto usa el mismo origen: /api.
 * Nginx reenvía /api/* al backend definido con API_UPSTREAM en Docker/Kubernetes.
 * Si la API está en otro origen, usar su URL absoluta y habilitar CORS en ella.
 * Moneda confirmada por Raúl: GTQ (Q), el precio viaja como número JSON.
 * No colocar IPs privadas fijas aquí para producción.
 */
window.KUBELAB_CONFIG = Object.freeze({
  apiBaseUrl: "/api",
  requestTimeoutMs: 12000,
  locale: "es-GT",
  currency: "GTQ"
});
