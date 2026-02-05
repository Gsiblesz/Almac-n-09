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
    const payload = {
      numero_lote: codigoLote,
      producto: producto.descripcion || producto.codigo,
      cantidad_almacen: producto.recibido,
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
      throw new Error(text || "Error al registrar en Sheets");
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
      const cantidad = Number(item && item.cantidad);
      if (!codigo || Number.isNaN(cantidad) || cantidad <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).send("Producto inválido");
      }
      await client.query(
        "INSERT INTO lote_productos (lote_id, codigo, descripcion, lote_producto, cantidad) VALUES ($1, $2, $3, $4, $5)",
        [loteId, codigo, descripcion || null, loteProducto || null, cantidad]
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
                  'lote_producto', lp.lote_producto
                )
                ORDER BY lp.id
              ) AS productos
       FROM lotes l
       JOIN lote_productos lp ON lp.lote_id = l.id
       GROUP BY l.id
       ORDER BY l.created_at DESC`
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
      "SELECT codigo, descripcion, cantidad FROM lote_productos WHERE lote_id = $1 ORDER BY id",
      [loteId]
    );

    if (productosResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).send("Lote no encontrado");
    }

    const cantidadesMap = new Map();
    for (const item of productos_y_cantidades) {
      if (item.codigo && item.cantidad !== undefined) {
        cantidadesMap.set(item.codigo, Number(item.cantidad));
      }
    }

    let hayMismatch = false;
    const productosParaSheets = [];
    for (const producto of productosResult.rows) {
      const recibido = cantidadesMap.get(producto.codigo);
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
    res.status(500).send("Error al validar el lote");
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
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Servidor listo en puerto ${port}`);
});
