import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./db.js";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const staticDir = process.env.FRONTEND_DIR || path.join(__dirname, "..", "Frontend");
app.use(express.static(staticDir));

const appsScriptUrl = process.env.APPS_SCRIPT_URL || "";
const adminKey = process.env.ADMIN_KEY || "";
const buildVersion = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || process.env.COMMIT_SHA || "dev";

function formatDDMMYY(date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

async function generarCodigoLote() {
  const hoy = new Date();
  const fechaClave = formatDDMMYY(hoy);

  const result = await pool.query(
    "SELECT COUNT(*) AS total FROM lotes WHERE created_at::date = CURRENT_DATE"
  );

  const correlativo = String(Number(result.rows[0].total) + 1).padStart(2, "0");
  return `BC${fechaClave}${correlativo}`;
}

async function registrarEnSheets(codigoLote, productos) {
  if (!appsScriptUrl) {
    throw new Error("APPS_SCRIPT_URL no configurada");
  }

  const fechaEntrada = new Date().toISOString();

  for (const producto of productos) {
    const numeroLote = String(producto && producto.lote_producto ? producto.lote_producto : codigoLote || "").trim();
    const payload = {
      numero_lote: numeroLote,
      producto: String(producto.descripcion || producto.codigo || "").trim(),
      cantidad_almacen: producto.recibido,
      cestas_calculadas: producto.cestas_calculadas ?? null,
      fecha_entrada: fechaEntrada,
    };

    const response = await fetch(appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = null;
    }

    if (!response.ok || !data || data.ok !== true) {
      const message = (data && (data.error || data.message))
        ? String(data.error || data.message)
        : (text || "Error al registrar en Sheets");
      throw new Error(message);
    }
  }
}

async function registrarErrorConteo(codigoLote) {
  try {
    await pool.query(
      "INSERT INTO conteo_errores (codigo_lote) VALUES ($1)",
      [codigoLote || null]
    );
  } catch (error) {
    console.error("Error al registrar conteo_errores:", error);
  }
}

app.post("/nuevo-lote", async (req, res) => {
  const { productos, codigo_lote } = req.body || {};

  if (!Array.isArray(productos) || productos.length === 0) {
    return res.status(400).send("Productos requeridos");
  }

  const client = await pool.connect();
  try {
    let codigoLote = codigo_lote ? String(codigo_lote).trim() : "";
    if (codigoLote) {
      const exists = await client.query(
        "SELECT 1 FROM lotes WHERE codigo_lote = $1",
        [codigoLote]
      );
      if (exists.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).send("El código de lote ya existe");
      }
    } else {
      codigoLote = await generarCodigoLote();
    }

    await client.query("BEGIN");
    const loteResult = await client.query(
      "INSERT INTO lotes (codigo_lote) VALUES ($1) RETURNING id",
      [codigoLote]
    );

    const loteId = loteResult.rows[0].id;

    for (const item of productos) {
      const codigo = item && item.codigo ? String(item.codigo).trim() : "";
      const descripcion = item && item.descripcion ? String(item.descripcion).trim() : "";
      const loteProducto = item && item.lote ? String(item.lote).trim() : "";
      const paquetes = Number(item && item.paquetes);
      const sobrePiso = Number(item && (item.sobre_piso ?? item.sobrePiso));
      const cantidad = Number(item && item.cantidad);
      if (!codigo || Number.isNaN(cantidad) || cantidad <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).send("Producto inválido");
      }
      const paquetesValidos = Number.isNaN(paquetes) ? null : paquetes;
      const sobrePisoValido = Number.isNaN(sobrePiso) ? null : sobrePiso;
      const cestasCalc = paquetesValidos && paquetesValidos > 0
        ? Math.ceil(cantidad / paquetesValidos) + (sobrePisoValido || 0)
        : null;

      await client.query(
        "INSERT INTO lote_productos (lote_id, codigo, descripcion, lote_producto, paquetes, sobre_piso, cestas_calculadas, cantidad) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [loteId, codigo, descripcion || null, loteProducto || null, paquetesValidos, sobrePisoValido, cestasCalc, cantidad]
      );
    }

    await client.query("COMMIT");
    res.json({ codigo_lote: codigoLote });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error en /nuevo-lote:", error);
    res.status(500).send("Error al crear el lote");
  } finally {
    client.release();
  }
});

app.get("/lotes", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.id,
              l.codigo_lote,
              l.created_at,
              JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id', lp.id,
                  'codigo', lp.codigo,
                  'descripcion', lp.descripcion,
                  'lote_producto', lp.lote_producto,
                  'cestas_calculadas', lp.cestas_calculadas
                )
                ORDER BY lp.id
              ) AS productos
       FROM lotes l
       JOIN lote_productos lp ON lp.lote_id = l.id
       GROUP BY l.id
       ORDER BY l.created_at ASC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error en /lotes:", error);
    res.status(500).send("Error al listar lotes");
  }
});

app.post("/validar-lote", async (req, res) => {
  const { loteId, cantidades } = req.body || {};

  if (!loteId || !Array.isArray(cantidades) || cantidades.length === 0) {
    return res.status(400).send("Datos incompletos");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const productosResult = await client.query(
      "SELECT id, codigo, cantidad FROM lote_productos WHERE lote_id = $1 ORDER BY id",
      [loteId]
    );

    if (productosResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).send("Lote no encontrado");
    }

    const cantidadesMap = new Map();
    for (const item of cantidades) {
      if (item.codigo && item.cantidad !== undefined) {
        cantidadesMap.set(item.codigo, Number(item.cantidad));
      }
    }

    const mismatches = [];
    for (const producto of productosResult.rows) {
      const recibido = cantidadesMap.get(producto.codigo);
      if (recibido === undefined || Number.isNaN(recibido)) {
        mismatches.push({
          codigo: producto.codigo,
          esperado: producto.cantidad,
          recibido: 0,
        });
        continue;
      }
      if (Number(recibido) !== Number(producto.cantidad)) {
        mismatches.push({
          codigo: producto.codigo,
          esperado: producto.cantidad,
          recibido,
        });
      }
    }

    if (mismatches.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, mismatches });
    }

    await client.query("DELETE FROM lotes WHERE id = $1", [loteId]);
    await client.query("COMMIT");

    res.json({ ok: true, message: "Lote validado. Pendiente de registrar en Sheets." });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error en /validar-lote:", error);
    res.status(500).send("Error al validar el lote");
  } finally {
    client.release();
  }
});

app.post("/validar-conteo", async (req, res) => {
  const { codigo_lote, productos_y_cantidades } = req.body || {};

  if (!codigo_lote || !Array.isArray(productos_y_cantidades) || productos_y_cantidades.length === 0) {
    return res.status(400).send("Datos incompletos");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const loteResult = await client.query(
      "SELECT id FROM lotes WHERE codigo_lote = $1",
      [codigo_lote]
    );

    if (loteResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).send("Lote no encontrado");
    }

    const loteId = loteResult.rows[0].id;

    const productosResult = await client.query(
      "SELECT id, codigo, descripcion, cantidad, cestas_calculadas, lote_producto FROM lote_productos WHERE lote_id = $1 ORDER BY id",
      [loteId]
    );

    if (productosResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).send("Lote no encontrado");
    }

    const cantidadesPorProductoId = new Map();
    const cantidadesPorCodigo = new Map();
    for (const item of productos_y_cantidades) {
      const cantidad = Number(item && item.cantidad);
      if (Number.isNaN(cantidad)) continue;

      const productoId = Number(item && item.id);
      if (Number.isFinite(productoId) && productoId > 0) {
        cantidadesPorProductoId.set(productoId, cantidad);
        continue;
      }

      const codigo = item && item.codigo ? String(item.codigo).trim() : "";
      if (codigo) {
        cantidadesPorCodigo.set(codigo, cantidad);
      }
    }

    let hayMismatch = false;
    const productosParaSheets = [];
    for (const producto of productosResult.rows) {
      const recibido = cantidadesPorProductoId.has(producto.id)
        ? cantidadesPorProductoId.get(producto.id)
        : cantidadesPorCodigo.get(producto.codigo);
      if (recibido === undefined || Number.isNaN(recibido)) {
        hayMismatch = true;
        break;
      }
      if (Number(recibido) !== Number(producto.cantidad)) {
        hayMismatch = true;
        break;
      }

      productosParaSheets.push({
        codigo: producto.codigo,
        descripcion: producto.descripcion || "",
        recibido,
        cestas_calculadas: producto.cestas_calculadas,
        lote_producto: producto.lote_producto || "",
      });
    }

    if (hayMismatch) {
      await client.query("ROLLBACK");
      await registrarErrorConteo(codigo_lote);
      return res
        .status(400)
        .send(
          "ERROR: Las cantidades no coinciden con el registro de Empaquetado. CUENTE DE NUEVO"
        );
    }

    await registrarEnSheets(codigo_lote, productosParaSheets);
    await client.query("DELETE FROM lotes WHERE id = $1", [loteId]);
    await client.query("COMMIT");

    res.json({ ok: true, message: "Lote validado. Pendiente de registrar en Sheets." });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error en /validar-conteo:", error);
    res.status(500).send(String(error && error.message ? error.message : "Error al validar el lote"));
  } finally {
    client.release();
  }
});

app.post("/borrar-lotes", async (req, res) => {
  const { key } = req.body || {};

  if (!adminKey) {
    return res.status(500).send("ADMIN_KEY no configurada");
  }

  if (!key || String(key).trim() !== adminKey) {
    return res.status(401).send("Clave inválida");
  }

  try {
    await pool.query("DELETE FROM lotes");
    res.json({ ok: true, message: "Registros borrados." });
  } catch (error) {
    console.error("Error en /borrar-lotes:", error);
    res.status(500).send("Error al borrar registros");
  }
});

app.post("/borrar-registros", async (req, res) => {
  const { key, ids } = req.body || {};

  if (!adminKey) {
    return res.status(500).send("ADMIN_KEY no configurada");
  }

  if (!key || String(key).trim() !== adminKey) {
    return res.status(401).send("Clave inválida");
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).send("Ids requeridos");
  }

  try {
    await pool.query("DELETE FROM lotes WHERE id = ANY($1::int[])", [ids]);
    res.json({ ok: true, message: "Registros borrados." });
  } catch (error) {
    console.error("Error en /borrar-registros:", error);
    res.status(500).send("Error al borrar registros");
  }
});

app.get("/errores-conteo", async (req, res) => {
  const { date, key } = req.query || {};
  const targetDate = date ? String(date) : null;

  if (!adminKey) {
    return res.status(500).send("ADMIN_KEY no configurada");
  }

  if (!key || String(key).trim() !== adminKey) {
    return res.status(401).send("Clave inválida");
  }

  try {
    const params = [];
    let where = "created_at::date = CURRENT_DATE";
    if (targetDate) {
      where = "created_at::date = $1";
      params.push(targetDate);
    }

    const result = await pool.query(
      `SELECT id, codigo_lote, created_at
       FROM conteo_errores
       WHERE ${where}
       ORDER BY created_at DESC`,
      params
    );

    res.json({
      ok: true,
      total: result.rows.length,
      items: result.rows,
    });
  } catch (error) {
    console.error("Error en /errores-conteo:", error);
    res.status(500).send("Error al consultar errores");
  }
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    version: buildVersion,
    appsScriptConfigured: Boolean(appsScriptUrl),
  });
});

app.listen(port, () => {
  console.log(`Servidor listo en puerto ${port}`);
});
