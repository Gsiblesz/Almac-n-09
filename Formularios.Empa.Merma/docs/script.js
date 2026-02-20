// Configura aquí la URL de tu Apps Script Web App (deployment URL que termina en /exec)
// Ejemplo: const WEB_APP_URL = "https://script.google.com/macros/s/AKfycby.../exec";
// Si hay URL guardada en ajustes, úsala; si no, fallback a la fija:
const WEB_APP_URL = (typeof localStorage !== 'undefined' && localStorage.getItem('WEB_APP_URL_DYNAMIC'))
    ? localStorage.getItem('WEB_APP_URL_DYNAMIC')
    : "https://script.google.com/macros/s/AKfycbzWJyQGgnGtgMK1mRxBmfrnMzp1Kf8Y4Jx-BQOWU6C7rwTytfXz2FH6LW_wAfatGtCQ/exec"; // URL por defecto (deployment actual)

const BACKEND_URL = (typeof localStorage !== 'undefined' && localStorage.getItem('BACKEND_URL'))
    ? localStorage.getItem('BACKEND_URL')
    : "https://almac-n-09.onrender.com";

// Endpoints por hoja (el Apps Script espera ?sheet=Empaquetado | ?sheet=Merma)
const APPS_SCRIPT_URL_EMPAQUETADOS = WEB_APP_URL ? WEB_APP_URL + "?sheet=Empaquetado" : "";
const APPS_SCRIPT_URL_MERMA = WEB_APP_URL ? WEB_APP_URL + "?sheet=Merma" : "";

function generarNonce() {
    try {
        if (window.crypto && window.crypto.getRandomValues) {
            const arr = new Uint32Array(4);
            window.crypto.getRandomValues(arr);
            return Array.from(arr).map(n => n.toString(16)).join('');
        }
    } catch (_) {}
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

async function registrarLoteBackend(seleccionados, codigoLote) {
    const productos = (seleccionados || []).map(item => ({
    codigo: item.codigo,
    descripcion: item.descripcion || "",
    cantidad: item.cantidad,
    paquetes: item.paquetes || "",
    sobre_piso: item.sobre_piso || item.sobrePiso || "",
    lote: item.lote || ""
    }));

    if (!productos.length) return;

    const payload = {
        productos
    };

    if (codigoLote) {
        payload.codigo_lote = codigoLote;
    }

    const response = await fetch(`${BACKEND_URL}/nuevo-lote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
    }
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatFechaVisual(raw) {
    const value = String(raw || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split('-');
        return `${d}-${m}-${y}`;
    }
    return value;
}

function getInputValueById(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
}

function buildResumenMeta(formId) {
    const isEmpa = formId === 'empaquetados-form';
    const fecha = isEmpa ? formatFechaVisual(getInputValueById('empa-fecha')) : formatFechaVisual(getInputValueById('merma-fecha'));
    const hora = isEmpa ? getInputValueById('empa-hora') : getInputValueById('merma-hora');
    const responsable = isEmpa ? getInputValueById('empa-responsable') : getInputValueById('merma-responsable');
    const sede = isEmpa ? getInputValueById('empa-sede') : getInputValueById('merma-sede');

    const baseItems = [
        ['Fecha', fecha || '-'],
        ['Hora', hora || '-'],
        ['Responsable', responsable || '-'],
        ['Sede', sede || '-']
    ];

    if (isEmpa) {
        const maquina = getInputValueById('empa-maquina');
        const entregado = getInputValueById('empa-entregado');
        const registro = getInputValueById('empa-registro');
        const lotePreview = getInputValueById('empa-lote-preview').replace(/^Lote:\s*/i, '');
        baseItems.splice(2, 0,
            ['Máquina', maquina || '-'],
            ['Entregado a', entregado || '-'],
            ['N° registro', registro || '-'],
            ['Lote sugerido', lotePreview || '-']
        );
    }

    return baseItems;
}

function buildProductosResumenRows(formId, seleccionados) {
    const isMerma = formId === 'merma-form';
    return (seleccionados || []).map((item, idx) => {
        const cantidad = `${item.cantidad}${item.unidad ? ` ${item.unidad}` : ''}`;
        const motivo = isMerma ? (item.motivo || '-') : '-';
        return `
            <tr>
                <td>${idx + 1}</td>
                <td>${escapeHtml(item.codigo || '-')}</td>
                <td>${escapeHtml(item.descripcion || '-')}</td>
                <td>${escapeHtml(cantidad)}</td>
                <td>${escapeHtml(item.lote || '-')}</td>
                <td>${escapeHtml(motivo)}</td>
            </tr>`;
    }).join('');
}

function mostrarConfirmacionEnvio(formId, seleccionados) {
    const modal = document.getElementById('confirmacion-modal');
    const titleEl = document.getElementById('confirm-titulo');
    const metaEl = document.getElementById('confirm-meta');
    const bodyEl = document.getElementById('confirm-productos-body');
    const checkEl = document.getElementById('confirm-check');
    const editarBtn = document.getElementById('confirm-editar');
    const enviarBtn = document.getElementById('confirm-enviar');

    if (!modal || !titleEl || !metaEl || !bodyEl || !checkEl || !editarBtn || !enviarBtn) {
        return Promise.resolve(window.confirm('Verifica cantidades, productos y lotes antes de enviar. ¿Confirmas el envío?'));
    }

    const titulo = formId === 'empaquetados-form'
        ? 'Verifica Empaquetado antes de enviar'
        : 'Verifica Merma antes de enviar';
    titleEl.textContent = titulo;

    const metaItems = buildResumenMeta(formId);
    metaEl.innerHTML = metaItems
        .map(([key, val]) => `<div class="confirm-meta-item"><strong>${escapeHtml(key)}:</strong> ${escapeHtml(val)}</div>`)
        .join('');

    bodyEl.innerHTML = buildProductosResumenRows(formId, seleccionados);
    checkEl.checked = false;
    enviarBtn.disabled = true;

    return new Promise((resolve) => {
        let closed = false;
        const close = (confirmed) => {
            if (closed) return;
            closed = true;
            modal.classList.remove('open');
            modal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            checkEl.removeEventListener('change', onToggle);
            editarBtn.removeEventListener('click', onCancel);
            enviarBtn.removeEventListener('click', onConfirm);
            modal.removeEventListener('click', onBackdrop);
            document.removeEventListener('keydown', onEsc);
            resolve(confirmed);
        };

        const onToggle = () => { enviarBtn.disabled = !checkEl.checked; };
        const onCancel = () => close(false);
        const onConfirm = () => close(true);
        const onBackdrop = (e) => { if (e.target === modal) close(false); };
        const onEsc = (e) => { if (e.key === 'Escape') close(false); };

        checkEl.addEventListener('change', onToggle);
        editarBtn.addEventListener('click', onCancel);
        enviarBtn.addEventListener('click', onConfirm);
        modal.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onEsc);

        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    });
}

function enviarFormulario(formId, url) {
    const form = document.getElementById(formId);
    form.addEventListener("submit", async function(e) {
        e.preventDefault();
        if (!url) {
            document.getElementById("mensaje").textContent = "Configura la URL del Apps Script (WEB_APP_URL)";
            return;
        }
        // Evitar envíos dobles (doble click, redoble toque)
        if (form.dataset.submitting === "1") {
            return; // ya se está enviando
        }
        form.dataset.submitting = "1";
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Revisar..."; }
        const msgEl = document.getElementById("mensaje");
        if (msgEl) msgEl.textContent = "Revisa el resumen y confirma el envío...";
        const datos = new FormData(form);
        // Lote global para Empaquetado (respaldo si el lote por producto está vacío)
        let loteGlobal = '';
        if (formId === "empaquetados-form") {
            try {
                const preview = document.getElementById('empa-lote-preview');
                if (preview && preview.value) {
                    loteGlobal = String(preview.value).replace(/^Lote:\s*/i, '').trim();
                }
                if (!loteGlobal) {
                    const fechaInput = document.getElementById('empa-fecha');
                    const maqInput = document.getElementById('empa-maquina');
                    const raw = fechaInput ? (fechaInput.value||'').trim() : '';
                    const maq = maqInput ? (maqInput.value||'').trim() : '';
                    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
                        const [y,m,d] = raw.split('-');
                        loteGlobal = `BC${d}${m}${y.slice(2)}${maq}`;
                    }
                }
                if (loteGlobal) datos.append('lote', loteGlobal);
            } catch(_) { /* no-op */ }
        }
        const qtyInputs = form.querySelectorAll('.prod-qty');
        let seleccionados = [];
        // Formatear fecha a dd-mm-aaaa si viene como yyyy-mm-dd
        try {
            const fechaInput = form.querySelector('input[name="fecha"]');
            const raw = fechaInput ? (fechaInput.value||'').trim() : '';
            if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
                const [y,m,d] = raw.split('-');
                datos.set('fecha', `${d}-${m}-${y}`);
            }
        } catch(_) { /* no-op */ }
        // Idempotencia: token anti-duplicado (reutiliza el mismo nonce en reintentos)
        let nonce = form.dataset.nonce || localStorage.getItem(`nonce_${formId}`) || '';
        if (!nonce) {
            nonce = generarNonce();
            form.dataset.nonce = nonce;
            try { localStorage.setItem(`nonce_${formId}`, nonce); } catch(_) {}
        }
        datos.append('nonce', nonce);
        // Agregar solo los productos con cantidad > 0 como JSON
        try {
            const seleccionadosTmp = [];
            qtyInputs.forEach(inp => {
                const val = parseInt(inp.value, 10);
                if (!isNaN(val) && val > 0) {
                    const row = inp.closest('.producto-line');
                    const motivoEl = row ? row.querySelector('.merma-motivo') : null;
                    const loteEl = row ? row.querySelector('.merma-lote, .empa-lote') : null;
                    // read motivo and lote robustly: prefer value, fallback to selected option text
                    var motivoVal = '';
                    if (motivoEl) {
                        try {
                            motivoVal = (motivoEl.value || '').toString().trim();
                        } catch(_) { motivoVal = ''; }
                        try {
                            if (!motivoVal && typeof motivoEl.selectedIndex === 'number' && motivoEl.selectedIndex >= 0) {
                                var opt = motivoEl.options[motivoEl.selectedIndex];
                                motivoVal = (opt && (opt.value || opt.text) || '').toString().trim();
                            }
                        } catch(_) {}
                    }
                    var loteVal = '';
                    if (loteEl) {
                        try { loteVal = (loteEl.value || '').toString().trim(); } catch(_) { loteVal = ''; }
                    }
                    if (!loteVal && loteGlobal) loteVal = loteGlobal;
                    seleccionadosTmp.push({
                        codigo: inp.dataset.codigo,
                        descripcion: inp.dataset.desc || '',
                        unidad: inp.dataset.unidad || '',
                        cantidad: val,
                        paquetes: inp.dataset.paquetes || '',
                        sobre_piso: inp.dataset.sobrePiso || inp.dataset.sobre_piso || '',
                        motivo: motivoVal,
                        lote: loteVal
                    });
                }
            });
            seleccionados = seleccionadosTmp;
            // Validar motivo y lote en Merma
            if (formId === "merma-form") {
                const falta = seleccionados.find(it => !String(it.motivo || '').trim() || !String(it.lote || '').trim());
                if (falta) {
                    if (msgEl) msgEl.textContent = "Completa el motivo y el número de lote en todos los productos.";
                    form.dataset.submitting = "0";
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = "Enviar";
                    }
                    return;
                }
            }
            // Evitar duplicados de producto + lote (en Merma permite repetir lote si el motivo es distinto)
            const dupMap = new Set();
            let hasDup = false;
            const isMermaForm = formId === "merma-form";
            seleccionados.forEach(item => {
                const codigo = (item.codigo || '').trim().toLowerCase();
                const lote = (item.lote || '').trim().toLowerCase();
                const motivo = (item.motivo || '').trim().toLowerCase();
                if (!codigo) return;
                const key = isMermaForm ? (codigo + '|' + lote + '|' + motivo) : (codigo + '|' + lote);
                if (dupMap.has(key)) hasDup = true;
                else dupMap.add(key);
            });
            if (hasDup) {
                if (msgEl) msgEl.textContent = isMermaForm
                    ? "No se permite el mismo producto con el mismo lote y motivo."
                    : "No se permite el mismo producto con el mismo número de lote.";
                form.dataset.submitting = "0";
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Enviar";
                }
                return;
            }
            if (seleccionados.length) {
                datos.append('productos_json', JSON.stringify(seleccionados));
                if (formId === "merma-form") {
                    // Captura redundante para Apps Script en caso de que el JSON se recorte en tránsito
                    datos.append('productos_count', String(seleccionados.length));
                    seleccionados.forEach((item, idx) => {
                        datos.append(`prodCodigo_${idx}`, item.codigo || '');
                        datos.append(`motivo_${idx}`, item.motivo || '');
                        datos.append(`lote_${idx}`, item.lote || '');
                    });
                }
            }
            // Identificar a qué hoja va (para depuración opcional en backend)
            if (url.includes('Empaquetado')) datos.append('sheet', 'Empaquetado');
            if (url.includes('Merma')) datos.append('sheet', 'Merma');
        } catch(_) { /* no-op */ }
        if (!seleccionados.length) {
            if (msgEl) msgEl.textContent = "Agrega al menos un producto con cantidad.";
            form.dataset.submitting = "0";
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Enviar";
            }
            return;
        }

        const confirmado = await mostrarConfirmacionEnvio(formId, seleccionados);
        if (!confirmado) {
            if (msgEl) msgEl.textContent = "Envío cancelado para que puedas corregir la información.";
            form.dataset.submitting = "0";
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Enviar";
            }
            return;
        }

        if (submitBtn) { submitBtn.textContent = "Enviando..."; }
        if (msgEl) msgEl.textContent = "Enviando...";

        try {
            if (formId === "empaquetados-form") {
                const entregadoEl = document.getElementById('empa-entregado');
                const entregadoA = (entregadoEl && entregadoEl.value ? String(entregadoEl.value) : '').trim().toUpperCase();
                const debeRegistrarEnBackend = entregadoA === 'DESPACHO';
                if (debeRegistrarEnBackend) {
                    await registrarLoteBackend(seleccionados, loteGlobal);
                }
            }
        } catch (backendError) {
            if (msgEl) msgEl.textContent = "No se pudo registrar el lote en la base de datos. " + backendError.message;
            form.dataset.submitting = "0";
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Enviar";
            }
            return;
        }

        fetch(url, {
            method: "POST",
            body: datos
        })
        .then(async (response) => {
            let txt;
            try { txt = await response.text(); } catch(_) { txt = ''; }
            let ok = response.ok;
            let duplicate = false;
            let errorMsg = '';
            let parsed = null;
            try {
                parsed = JSON.parse(txt);
                if (parsed.ok !== undefined) ok = parsed.ok;
                duplicate = !!parsed.duplicate;
                if (!ok && parsed.error) errorMsg = parsed.error;
            } catch(e) {
                // texto no JSON; mantener valores por defecto
            }
            // Log detallado para depuración
            try { console.log('[ENVIAR_FORM]', formId, 'status:', response.status, 'okFlag:', ok, 'duplicate:', duplicate, 'raw:', txt); } catch(_) {}
            // Consideramos éxito también si la respuesta es no legible pero status 200 (opaque redirect no-cors)
            if (ok || response.status === 0) {
                if (msgEl) {
                    if (duplicate) {
                        msgEl.textContent = "Registro ya existente (deduplicado).";
                    } else if (formId === "empaquetados-form") {
                        const entregadoEl = document.getElementById('empa-entregado');
                        const entregadoA = (entregadoEl && entregadoEl.value ? String(entregadoEl.value) : '').trim().toUpperCase();
                        if (entregadoA === 'K FOOD') {
                            msgEl.textContent = "¡Formulario enviado! Registro visible solo en Google Sheets (K FOOD).";
                        } else if (entregadoA === 'DESPACHO') {
                            msgEl.textContent = "¡Formulario enviado! Registro enviado a Google Sheets y base de datos (DESPACHO).";
                        } else {
                            msgEl.textContent = "¡Formulario enviado correctamente!";
                        }
                    } else {
                        msgEl.textContent = "¡Formulario enviado correctamente!";
                    }
                }
                // Disparar evento para página de registros
                try {
                    const insertedCount = Array.from(form.querySelectorAll('.prod-qty')).filter(inp => parseInt(inp.value,10)>0).length;
                    const hoja = url.includes('Empaquetado') ? 'Empaquetado' : (url.includes('Merma') ? 'Merma' : '');
                    window.dispatchEvent(new CustomEvent('registroInsertado',{ detail:{ sheet:hoja, productos:insertedCount, nonce: form.dataset.nonce || '' }}));
                } catch(_) {}
                form.reset();
                const qtyInputs = form.querySelectorAll('.prod-qty');
                qtyInputs.forEach(i => i.value = "");
                const contenedores = form.querySelectorAll('.seleccionados');
                contenedores.forEach(c => c.innerHTML = "");
                delete form.dataset.nonce;
                try { localStorage.removeItem(`nonce_${formId}`); } catch(_) {}
                setTimeout(() => { if (msgEl) msgEl.textContent = ""; }, 3000);
            } else {
                // Mostrar mensaje específico si lo tenemos
                if (!errorMsg && parsed && !parsed.ok && !parsed.error) {
                    errorMsg = 'Error desconocido (respuesta JSON sin ok=true).';
                }
                if (!errorMsg && !parsed && response.status !== 200) {
                    errorMsg = 'HTTP '+response.status+' sin detalle del servidor.';
                }
                let debugMsg = '';
                try {
                    if (parsed && parsed.debug) {
                        const d = parsed.debug;
                        const ent = d.entradas09;
                        const emp = d.empaquetado;
                        const entInfo = ent ? `Entradas09: lastCol=${ent.lastCol}, maxCols=${ent.maxCols}, tablas=${Array.isArray(ent.tables)?ent.tables.length:'?'}; ` : '';
                        const empInfo = emp ? `Empaquetado: lastCol=${emp.lastCol}, maxCols=${emp.maxCols}, tablas=${Array.isArray(emp.tables)?emp.tables.length:'?'}; ` : '';
                        debugMsg = entInfo || empInfo ? (` Diagnóstico: ${entInfo}${empInfo}`) : '';
                    }
                } catch(_){ }
                if (msgEl) msgEl.textContent = "Error al enviar el formulario. " + (errorMsg ? ("Detalle: "+ errorMsg) : "Puedes reintentar.") + debugMsg;
            }
        })
        .catch(error => {
            // Fallback: asumimos que puede haber sido un bloqueo de lectura pero el backend insertó la fila.
            if (msgEl) msgEl.textContent = "Posible envío exitoso (respuesta no legible). Verifica en la hoja. Si falta, reintenta.";
            try { console.error('[ENVIAR_FORM][ERROR]', formId, error); } catch(_) {}
            // No limpiamos por si realmente no llegó; conservamos nonce para reintentar.
        })
        .finally(() => {
            // Pequeño enfriamiento para evitar reenvío inmediato
            setTimeout(() => {
                form.dataset.submitting = "0";
                const btn = form.querySelector('button[type="submit"]');
                if (btn) {
                    btn.disabled = false;
                    // Si hay nonce activo, ofrecer reintento; si no, volver a "Enviar"
                    btn.textContent = (form.dataset.nonce || localStorage.getItem(`nonce_${formId}`)) ? "Reintentar" : "Enviar";
                }
            }, 800);
        });
    });
}

// Limpieza manual de formulario
function clearForm(formId){
    const form = document.getElementById(formId);
    if(!form) return;
    form.reset();
    // Limpiar cantidades y contenedores de productos seleccionados
    const qtyInputs = form.querySelectorAll('.prod-qty');
    qtyInputs.forEach(i => i.value = "");
    const contenedores = form.querySelectorAll('.seleccionados');
    contenedores.forEach(c => c.innerHTML = "");
    // Limpiar nonce para permitir nuevo envío independiente
    delete form.dataset.nonce;
    try { localStorage.removeItem(`nonce_${formId}`); } catch(_) {}
    const msgEl = document.getElementById('mensaje');
    if (msgEl) {
        msgEl.textContent = 'Formulario limpiado.';
        setTimeout(()=>{ if(msgEl.textContent==='Formulario limpiado.') msgEl.textContent=''; },2000);
    }
    // Restaurar texto del botón si estaba en otro estado
    const btn = form.querySelector('button[type="submit"]');
    if(btn) btn.textContent = 'Enviar';
}

enviarFormulario("empaquetados-form", APPS_SCRIPT_URL_EMPAQUETADOS);
enviarFormulario("merma-form", APPS_SCRIPT_URL_MERMA);
