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

let lotes = [];
let loteActivo = null;
let modo = "entradas";

function setEstado(mensaje, esError = false) {
  estado.textContent = mensaje;
  estado.classList.toggle("error", esError);
  estado.classList.toggle("ok", !esError && Boolean(mensaje));
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

  if (!lotes.length) {
    loteVacio.style.display = "block";
    return;
  }

  loteVacio.style.display = "none";

  lotes.forEach((lote) => {
    const item = crearElemento("li", "lote-item");
    const button = crearElemento("button", "lote-btn");
    button.type = "button";
    const fechaLote = new Date(lote.created_at).toLocaleString();
    button.innerHTML = `
      <span class="lote-codigo">${fechaLote}</span>
      <span class="lote-meta">${lote.codigo_lote}</span>
    `;
    if (loteActivo && loteActivo.id === lote.id) {
      button.classList.add("activo");
    }
    button.addEventListener("click", () => seleccionarLote(lote.id));
    item.appendChild(button);
    loteList.appendChild(item);
  });
}

function renderDetalle() {
  productosContainer.innerHTML = "";
  setEstado("");

  if (!loteActivo) {
    detalleTitulo.textContent = "Selecciona un lote";
    validarBtn.disabled = true;
    return;
  }

  detalleTitulo.textContent = `Lote ${loteActivo.codigo_lote}`;

  loteActivo.productos.forEach((producto) => {
    const row = crearElemento("div", "producto-row");

    const info = crearElemento("div", "producto-info");
    info.innerHTML = `
      <div class="producto-codigo">${producto.codigo}</div>
      <div class="producto-descripcion">${producto.descripcion || ""}</div>
      <div class="producto-lote">Lote: ${loteActivo.codigo_lote}</div>
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

cargarLotes();
