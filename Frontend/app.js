const API_BASE = "https://almac-n-09.onrender.com";

const loteList = document.getElementById("loteList");
const loteVacio = document.getElementById("loteVacio");
const detalleTitulo = document.getElementById("detalleTitulo");
const productosContainer = document.getElementById("productos");
const estado = document.getElementById("estado");
const validacionForm = document.getElementById("validacionForm");
const validarBtn = document.getElementById("validarBtn");
const recargarBtn = document.getElementById("recargar");
const btnEntradas = document.getElementById("btnEntradas");
const btnSalidas = document.getElementById("btnSalidas");
const btnAjustes = document.getElementById("btnAjustes");
const panelAjustes = document.getElementById("panelAjustes");
const adminKeyInput = document.getElementById("adminKey");
const guardarClaveBtn = document.getElementById("guardarClave");
const borrarSeleccionadosBtn = document.getElementById("borrarSeleccionados");
const borrarRegistrosBtn = document.getElementById("borrarRegistros");
const ajustesEstado = document.getElementById("ajustesEstado");

let lotes = [];
let loteActivo = null;
let modo = "entradas";

function getRegistroLabel(loteId) {
  const index = lotes.findIndex((lote) => lote.id === loteId);
  const numero = String(index + 1).padStart(5, "0");
  return `Registro ${numero}`;
}

function setEstado(mensaje, esError = false) {
  estado.textContent = mensaje;
  estado.classList.toggle("error", esError);
  estado.classList.toggle("ok", !esError && Boolean(mensaje));
}

function setAjustesEstado(mensaje, esError = false) {
  ajustesEstado.textContent = mensaje;
  ajustesEstado.classList.toggle("error", esError);
  ajustesEstado.classList.toggle("ok", !esError && Boolean(mensaje));
}

function limpiarInputs() {
  const inputs = productosContainer.querySelectorAll("input[data-codigo]");
  inputs.forEach((input) => {
    input.value = "";
  });
}

function setModo(nuevoModo) {
  modo = nuevoModo;
  btnEntradas.classList.toggle("active", modo === "entradas");
  btnEntradas.setAttribute("aria-selected", modo === "entradas");
  btnSalidas.classList.toggle("active", modo === "salidas");
  btnSalidas.setAttribute("aria-selected", modo === "salidas");

  if (modo === "salidas") {
    setEstado("Salidas estará disponible próximamente.");
  } else {
    setEstado("");
  }
}

function crearElemento(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderLotes() {
  loteList.innerHTML = "";
  loteList.classList.toggle("ajustes-activo", !panelAjustes.hidden);

  if (!lotes.length) {
    loteVacio.style.display = "block";
    return;
  }

  loteVacio.style.display = "none";

  lotes.forEach((lote) => {
    const item = crearElemento("li", "lote-item");
    const checkbox = crearElemento("input", "lote-check");
    checkbox.type = "checkbox";
    checkbox.value = lote.id;
    if (panelAjustes.hidden) {
      checkbox.hidden = true;
    }
    const button = crearElemento("button", "lote-btn");
    button.type = "button";
    const fechaLote = new Date(lote.created_at).toLocaleString();
    button.innerHTML = `
      <span class="lote-codigo">${getRegistroLabel(lote.id)}</span>
      <span class="lote-meta">${fechaLote}</span>
    `;
    if (loteActivo && loteActivo.id === lote.id) {
      button.classList.add("activo");
    }
    button.addEventListener("click", () => seleccionarLote(lote.id));
    item.appendChild(checkbox);
    item.appendChild(button);
    loteList.appendChild(item);
  });
}

function renderDetalle() {
  productosContainer.innerHTML = "";
  setEstado("");

  if (!loteActivo) {
    detalleTitulo.textContent = "Selecciona un registro";
    validarBtn.disabled = true;
    return;
  }

  detalleTitulo.textContent = getRegistroLabel(loteActivo.id);

  loteActivo.productos.forEach((producto) => {
    const row = crearElemento("div", "producto-row");

    const info = crearElemento("div", "producto-info");
    const loteProducto = producto.lote_producto || loteActivo.codigo_lote;
    const nombreProducto = producto.descripcion || producto.codigo;
    info.innerHTML = `
      <div class="producto-codigo">${producto.codigo}</div>
      <div class="producto-descripcion">${nombreProducto}</div>
      <div class="producto-lote">Lote: ${loteProducto}</div>
    `;

    const inputWrap = crearElemento("div", "producto-input");
    const label = crearElemento("label", null, "Cantidad en almacén");
    label.setAttribute("for", `cantidad-${producto.id}`);
    const input = crearElemento("input");
    input.type = "number";
    input.min = "0";
    input.required = true;
    input.id = `cantidad-${producto.id}`;
    input.dataset.codigo = producto.codigo;
    input.placeholder = "0";
    inputWrap.appendChild(label);
    inputWrap.appendChild(input);

    row.appendChild(info);
    row.appendChild(inputWrap);
    productosContainer.appendChild(row);
  });

  validarBtn.disabled = false;
}

function seleccionarLote(loteId) {
  loteActivo = lotes.find((lote) => lote.id === loteId) || null;
  renderLotes();
  renderDetalle();
}

async function cargarLotes() {
  setEstado("");
  try {
    recargarBtn.disabled = true;
    const response = await fetch(`${API_BASE}/lotes`);
    if (!response.ok) {
      const text = await response.text();
      setEstado(`Error: ${text || response.status}`, true);
      return;
    }
    lotes = await response.json();
    if (loteActivo) {
      loteActivo = lotes.find((lote) => lote.id === loteActivo.id) || null;
    }
    renderLotes();
    renderDetalle();
  } catch (error) {
    setEstado("No se pudo cargar la lista de lotes.", true);
  } finally {
    recargarBtn.disabled = false;
  }
}

validacionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setEstado("");

  if (!loteActivo) return;

  const inputs = productosContainer.querySelectorAll("input[data-codigo]");
  const cantidades = Array.from(inputs).map((input) => ({
    codigo: input.dataset.codigo,
    cantidad: Number(input.value),
  }));

  if (cantidades.some((item) => Number.isNaN(item.cantidad))) {
    setEstado("Completa todas las cantidades.", true);
    return;
  }

  try {
    validarBtn.disabled = true;
    const response = await fetch(`${API_BASE}/validar-conteo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        codigo_lote: loteActivo.codigo_lote,
        productos_y_cantidades: cantidades,
      }),
    });

    if (response.status === 400) {
      const text = await response.text();
      limpiarInputs();
      setEstado(text, true);
      return;
    }

    if (!response.ok) {
      const text = await response.text();
      setEstado(`Error: ${text || response.status}`, true);
      return;
    }

    const data = await response.json();
    setEstado(data.message || "Lote validado y registrado.");
    await cargarLotes();
  } catch (error) {
    setEstado("Error de red al validar el lote.", true);
  } finally {
    validarBtn.disabled = false;
  }
});

recargarBtn.addEventListener("click", cargarLotes);
btnEntradas.addEventListener("click", () => setModo("entradas"));
btnSalidas.addEventListener("click", () => setModo("salidas"));

btnAjustes.addEventListener("click", () => {
  panelAjustes.hidden = !panelAjustes.hidden;
  if (!panelAjustes.hidden) {
    const stored = localStorage.getItem("ADMIN_KEY") || "";
    adminKeyInput.value = stored;
  }
  renderLotes();
});

guardarClaveBtn.addEventListener("click", () => {
  localStorage.setItem("ADMIN_KEY", adminKeyInput.value.trim());
  setAjustesEstado("Clave guardada.");
});

borrarRegistrosBtn.addEventListener("click", async () => {
  const key = (adminKeyInput.value || "").trim();
  if (!key) {
    setAjustesEstado("Ingresa la clave.", true);
    return;
  }
  const ok = confirm("¿Seguro que deseas borrar todos los registros?");
  if (!ok) return;

  try {
    borrarRegistrosBtn.disabled = true;
    setAjustesEstado("Borrando...");
    const response = await fetch(`${API_BASE}/borrar-lotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });

    const text = await response.text();
    if (!response.ok) {
      setAjustesEstado(text || "Error al borrar.", true);
      return;
    }

    setAjustesEstado("Registros borrados.");
    await cargarLotes();
  } catch (error) {
    setAjustesEstado("Error de red al borrar.", true);
  } finally {
    borrarRegistrosBtn.disabled = false;
  }
});

borrarSeleccionadosBtn.addEventListener("click", async () => {
  const key = (adminKeyInput.value || "").trim();
  if (!key) {
    setAjustesEstado("Ingresa la clave.", true);
    return;
  }

  const seleccionados = Array.from(document.querySelectorAll(".lote-check:checked"))
    .map((input) => Number(input.value))
    .filter((id) => Number.isFinite(id));

  if (!seleccionados.length) {
    setAjustesEstado("Selecciona al menos un registro.", true);
    return;
  }

  const ok = confirm("¿Borrar los registros seleccionados?");
  if (!ok) return;

  try {
    borrarSeleccionadosBtn.disabled = true;
    setAjustesEstado("Borrando...");
    const response = await fetch(`${API_BASE}/borrar-registros`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, ids: seleccionados }),
    });

    const text = await response.text();
    if (!response.ok) {
      setAjustesEstado(text || "Error al borrar.", true);
      return;
    }

    setAjustesEstado("Registros borrados.");
    await cargarLotes();
  } catch (error) {
    setAjustesEstado("Error de red al borrar.", true);
  } finally {
    borrarSeleccionadosBtn.disabled = false;
  }
});

cargarLotes();
