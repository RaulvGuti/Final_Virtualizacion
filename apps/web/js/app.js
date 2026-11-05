(() => {
  "use strict";

  const config = window.KUBELAB_CONFIG || {};
  const apiBase = String(config.apiBaseUrl || "/api").replace(/\/+$/, "");
  const timeoutMs = Number(config.requestTimeoutMs) || 12000;
  const currencyFormat = new Intl.NumberFormat(config.locale || "es-GT", {
    style: "currency",
    currency: config.currency || "GTQ",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const numberFormat = new Intl.NumberFormat(config.locale || "es-GT");

  const $ = (selector) => document.querySelector(selector);
  const el = {
    add: $("#add-product"),
    emptyAdd: $("#empty-add-product"),
    refresh: $("#refresh-products"),
    retry: $("#retry-products"),
    search: $("#search-products"),
    tbody: $("#products-tbody"),
    table: $("#table-wrapper"),
    loading: $("#loading-state"),
    empty: $("#empty-state"),
    emptyTitle: $("#empty-title"),
    emptyDescription: $("#empty-description"),
    errorBanner: $("#error-banner"),
    errorMessage: $("#error-message"),
    count: $("#result-count"),
    footerCount: $("#footer-count"),
    statProducts: $("#stat-products"),
    statStock: $("#stat-stock"),
    statValue: $("#stat-value"),
    apiStatus: $("#api-status"),
    apiStatusLabel: $("#api-status-label"),
    formDialog: $("#product-dialog"),
    form: $("#product-form"),
    modalTitle: $("#modal-title"),
    modalSubtitle: $("#modal-subtitle"),
    name: $("#product-name"),
    description: $("#product-description"),
    price: $("#product-price"),
    stock: $("#product-stock"),
    formError: $("#form-error"),
    save: $("#save-product"),
    closeForm: $("#close-form"),
    cancelForm: $("#cancel-form"),
    deleteDialog: $("#delete-dialog"),
    deleteDescription: $("#delete-description"),
    deleteError: $("#delete-error"),
    cancelDelete: $("#cancel-delete"),
    confirmDelete: $("#confirm-delete"),
    toasts: $("#toast-region")
  };

  const state = { products: [], loaded: false, loading: false, saving: false, editingId: null, deletingId: null };

  async function apiRequest(path, { method = "GET", data } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${apiBase}${path}`, {
        method,
        headers: { Accept: "application/json", ...(data !== undefined ? { "Content-Type": "application/json" } : {}) },
        ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
        signal: controller.signal,
        cache: "no-store"
      });
      const raw = await response.text();
      let payload = null;
      if (raw) {
        try { payload = JSON.parse(raw); }
        catch { payload = raw; }
      }
      if (!response.ok) {
        if ([502, 503, 504].includes(response.status)) {
          throw new Error("El servidor o la base de datos no están disponibles en este momento. Inténtalo de nuevo en unos minutos.");
        }
        let detail = null;
        if (payload && typeof payload === "object") {
          detail = Array.isArray(payload.errors) ? payload.errors.join(". ") : payload.message || payload.error || (typeof payload.detail === "string" ? payload.detail : null);
        } else if (typeof payload === "string" && payload.length < 160) {
          detail = payload;
        }
        if (response.status >= 500) {
          throw new Error("Ocurrió un error interno al procesar la solicitud. Inténtalo de nuevo más tarde.");
        }
        throw new Error(detail || `Error HTTP ${response.status}. Revisa la API e inténtalo de nuevo.`);
      }
      return payload;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("La API tardó demasiado en responder. Inténtalo nuevamente.");
      if (error instanceof TypeError) throw new Error("No se pudo conectar con la API. Revisa que el backend esté activo y que la URL sea correcta.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function unpackProducts(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.products)) return payload.products;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (payload && payload.data && Array.isArray(payload.data.products)) return payload.data.products;
    throw new Error("La API devolvió un formato inesperado. Se esperaba una lista de productos.");
  }

  function unpackProduct(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("La API devolvió un producto inválido.");
    return payload.product || payload.data || payload;
  }

  function formatPrice(price) { return currencyFormat.format(Number(price) || 0); }
  function formatNumber(value) { return numberFormat.format(value); }

  function setConnection(status) {
    el.apiStatus.dataset.status = status;
    el.apiStatusLabel.textContent = status === "online" ? "API conectada" : status === "offline" ? "API sin conexión" : "Conectando con API…";
  }

  function showToast(message, kind = "success") {
    const toast = document.createElement("div");
    toast.className = kind === "error" ? "toast error" : "toast";
    toast.textContent = message;
    el.toasts.append(toast);
    setTimeout(() => toast.remove(), 4200);
  }

  function setStats(products) {
    const quantity = products.reduce((total, p) => total + (Number(p.stock) || 0), 0);
    const value = products.reduce((total, p) => total + (Number(p.stock) || 0) * (Number(p.price) || 0), 0);
    el.statProducts.textContent = formatNumber(products.length);
    el.statStock.textContent = formatNumber(quantity);
    el.statValue.textContent = formatPrice(value);
  }

  function createNode(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = String(content);
    return node;
  }

  function createRow(product) {
    const id = String(product.id ?? "");
    const name = String(product.name ?? "Producto sin nombre");
    const description = String(product.description ?? "Sin descripción");
    const price = Number(product.price) || 0;
    const stock = Number(product.stock) || 0;

    const row = createNode("tr");
    const info = createNode("td");
    const productCell = createNode("div", "product-cell");
    const avatar = createNode("div", "product-avatar", name.slice(0, 1).toLocaleUpperCase());
    const label = createNode("div", "product-label");
    const title = createNode("strong", "", name);
    const subtitle = createNode("small", "", description);
    subtitle.title = product.created_at ? `${description} · Registrado: ${new Date(product.created_at).toLocaleString(config.locale || "es-GT")}` : description;
    label.append(title, subtitle);
    productCell.append(avatar, label);
    info.append(productCell);
    row.append(info);

    const priceCell = createNode("td", "price-cell", formatPrice(price));
    priceCell.dataset.label = "Precio";
    row.append(priceCell);

    const stockCell = createNode("td");
    stockCell.dataset.label = "Existencias";
    const stockBadge = createNode("span", "stock-badge", stock === 0 ? "Agotado" : `${formatNumber(stock)} uds.`);
    stockBadge.dataset.stock = stock === 0 ? "none" : stock < 5 ? "low" : "ok";
    stockCell.append(stockBadge);
    row.append(stockCell);

    const valueCell = createNode("td", "", formatPrice(price * stock));
    valueCell.dataset.label = "Valor total";
    row.append(valueCell);

    const actions = createNode("td", "actions");
    const group = createNode("div", "table-actions");
    const editBtn = createNode("button", "action-btn");
    editBtn.type = "button";
    editBtn.title = `Editar ${name}`;
    editBtn.setAttribute("aria-label", `Editar ${name}`);
    editBtn.dataset.action = "edit";
    editBtn.dataset.id = id;
    editBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4.5-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L4 20Z"/></svg>';

    const deleteBtn = createNode("button", "action-btn delete");
    deleteBtn.type = "button";
    deleteBtn.title = `Eliminar ${name}`;
    deleteBtn.setAttribute("aria-label", `Eliminar ${name}`);
    deleteBtn.dataset.action = "delete";
    deleteBtn.dataset.id = id;
    deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg>';
    group.append(editBtn, deleteBtn);
    actions.append(group);
    row.append(actions);
    return row;
  }

  function renderProducts() {
    const term = el.search.value.trim().toLocaleLowerCase();
    const products = state.products.filter((p) => `${p.name ?? ""} ${p.description ?? ""}`.toLocaleLowerCase().includes(term));
    const count = products.length;
    el.tbody.replaceChildren(...products.map(createRow));
    el.table.hidden = count === 0;
    el.empty.hidden = count !== 0;
    el.count.textContent = `${formatNumber(count)} de ${formatNumber(state.products.length)} productos`;
    el.footerCount.textContent = `${formatNumber(count)} registro${count === 1 ? "" : "s"} mostrado${count === 1 ? "" : "s"}`;
    if (count === 0) {
      const searching = term.length > 0;
      el.emptyTitle.textContent = searching ? "No encontramos productos" : "Todavía no hay productos";
      el.emptyDescription.textContent = searching ? "Prueba con otra búsqueda para ver resultados." : "Agrega tu primer producto para comenzar a utilizar el inventario.";
      el.emptyAdd.hidden = searching;
    }
  }

  async function loadProducts() {
    if (state.loading) return;
    state.loading = true;
    setConnection("checking");
    el.errorBanner.hidden = true;
    el.loading.hidden = false;
    el.table.hidden = true;
    el.empty.hidden = true;
    el.refresh.disabled = true;
    el.count.textContent = "Cargando…";
    try {
      const response = await apiRequest("/products");
      state.products = unpackProducts(response);
      state.loaded = true;
      setStats(state.products);
      renderProducts();
      setConnection("online");
    } catch (error) {
      setConnection("offline");
      state.loaded = false;
      state.products = [];
      el.statProducts.textContent = "—";
      el.statStock.textContent = "—";
      el.statValue.textContent = "—";
      el.errorMessage.textContent = error.message;
      el.errorBanner.hidden = false;
      el.count.textContent = "No disponible";
      el.footerCount.textContent = "Error al cargar";
    } finally {
      el.loading.hidden = true;
      el.refresh.disabled = false;
      state.loading = false;
    }
  }

  function formBusy(busy) {
    state.saving = busy;
    for (const field of el.form.querySelectorAll("input, textarea")) field.disabled = busy;
    el.save.disabled = busy;
    el.closeForm.disabled = busy;
    el.cancelForm.disabled = busy;
    el.save.textContent = busy ? "Guardando…" : state.editingId === null ? "Guardar producto" : "Guardar cambios";
  }

  function openNewProduct() {
    if (state.saving || el.formDialog.open) return;
    state.editingId = null;
    el.form.reset();
    el.formError.hidden = true;
    el.modalTitle.textContent = "Nuevo producto";
    el.modalSubtitle.textContent = "Completa los datos del artículo.";
    formBusy(false);
    el.formDialog.showModal();
    el.name.focus();
  }

  async function openEditProduct(id) {
    if (state.saving || el.formDialog.open) return;
    const button = [...el.tbody.querySelectorAll('button[data-action="edit"]')].find((b) => b.dataset.id === id);
    if (button) { button.disabled = true; button.setAttribute("aria-busy", "true"); }
    try {
      const product = unpackProduct(await apiRequest(`/products/${encodeURIComponent(id)}`));
      state.editingId = id;
      el.form.reset();
      el.formError.hidden = true;
      el.modalTitle.textContent = "Editar producto";
      el.modalSubtitle.textContent = "Modifica los datos y guarda los cambios.";
      el.name.value = String(product.name ?? "");
      el.description.value = String(product.description ?? "");
      el.price.value = String(product.price ?? "");
      el.stock.value = String(product.stock ?? "");
      formBusy(false);
      el.formDialog.showModal();
      el.name.focus();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      if (button) { button.disabled = false; button.removeAttribute("aria-busy"); }
    }
  }

  function closeForm() {
    if (!state.saving && el.formDialog.open) el.formDialog.close();
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (state.saving) return;
    el.formError.hidden = true;
    if (!el.form.reportValidity()) return;

    const name = el.name.value.trim();
    const price = Number(el.price.value);
    const stock = Number(el.stock.value);
    if (!name || !Number.isFinite(price) || price < 0 || !Number.isSafeInteger(stock) || stock < 0) {
      el.formError.textContent = "Revisa los datos: nombre obligatorio, precio válido y existencias enteras no negativas.";
      el.formError.hidden = false;
      return;
    }
    const data = { name, description: el.description.value.trim(), price, stock };
    const editing = state.editingId !== null;
    formBusy(true);
    try {
      await apiRequest(editing ? `/products/${encodeURIComponent(state.editingId)}` : "/products", {
        method: editing ? "PUT" : "POST",
        data
      });
      el.formDialog.close();
      showToast(editing ? "Producto actualizado correctamente." : "Producto agregado correctamente.");
      await loadProducts();
    } catch (error) {
      el.formError.textContent = error.message;
      el.formError.hidden = false;
    } finally {
      formBusy(false);
    }
  }

  function openDeleteProduct(id) {
    if (el.deleteDialog.open) return;
    const product = state.products.find((p) => String(p.id) === id);
    if (!product) return;
    state.deletingId = id;
    el.deleteDescription.textContent = `Vas a eliminar “${product.name}”. Esta acción no se puede deshacer.`;
    el.deleteError.hidden = true;
    el.confirmDelete.disabled = false;
    el.confirmDelete.textContent = "Sí, eliminar";
    el.deleteDialog.showModal();
  }

  async function confirmDelete() {
    if (state.deletingId === null || el.confirmDelete.disabled) return;
    el.confirmDelete.disabled = true;
    el.cancelDelete.disabled = true;
    el.confirmDelete.textContent = "Eliminando…";
    el.deleteError.hidden = true;
    try {
      await apiRequest(`/products/${encodeURIComponent(state.deletingId)}`, { method: "DELETE" });
      el.deleteDialog.close();
      state.deletingId = null;
      showToast("Producto eliminado correctamente.");
      await loadProducts();
    } catch (error) {
      el.deleteError.textContent = error.message;
      el.deleteError.hidden = false;
    } finally {
      el.confirmDelete.disabled = false;
      el.cancelDelete.disabled = false;
      el.confirmDelete.textContent = "Sí, eliminar";
    }
  }

  // No permitir que ESC cierre un modal durante una solicitud activa.
  el.formDialog.addEventListener("cancel", (event) => { if (state.saving) event.preventDefault(); });
  el.deleteDialog.addEventListener("cancel", (event) => { if (el.confirmDelete.disabled) event.preventDefault(); });
  el.add.addEventListener("click", openNewProduct);
  el.emptyAdd.addEventListener("click", openNewProduct);
  el.refresh.addEventListener("click", loadProducts);
  el.retry.addEventListener("click", loadProducts);
  el.search.addEventListener("input", () => { if (state.loaded && !state.loading) renderProducts(); });
  el.form.addEventListener("submit", saveProduct);
  el.closeForm.addEventListener("click", closeForm);
  el.cancelForm.addEventListener("click", closeForm);
  el.cancelDelete.addEventListener("click", () => { if (!el.confirmDelete.disabled) el.deleteDialog.close(); });
  el.confirmDelete.addEventListener("click", confirmDelete);
  el.tbody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "edit") void openEditProduct(button.dataset.id);
    if (button.dataset.action === "delete") openDeleteProduct(button.dataset.id);
  });

  void loadProducts();
})();
