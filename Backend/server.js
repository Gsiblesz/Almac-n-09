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
      const cantidad = Number(item && item.cantidad);
      if (!codigo || Number.isNaN(cantidad) || cantidad <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).send("Producto inválido");
      }
      await client.query(
        "INSERT INTO lote_productos (lote_id, codigo, cantidad) VALUES ($1, $2, $3)",
        [loteId, codigo, cantidad]
      );
    }

    await client.query("COMMIT");
    res.json({ codigo_lote: codigoLote });
  } catch (error) {
    await client.query("ROLLBACK");
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
                  'codigo', lp.codigo
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
      "SELECT codigo, cantidad FROM lote_productos WHERE lote_id = $1 ORDER BY id",
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
    }

    if (hayMismatch) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .send(
          "ERROR: Las cantidades no coinciden con el registro de Empaquetado. CUENTE DE NUEVO"
        );
    }

    await client.query("DELETE FROM lotes WHERE id = $1", [loteId]);
    await client.query("COMMIT");

    res.json({ ok: true, message: "Lote validado. Pendiente de registrar en Sheets." });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).send("Error al validar el lote");
  } finally {
    client.release();
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Servidor listo en puerto ${port}`);
});
