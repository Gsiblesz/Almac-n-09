import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }

  values.push(current.trim());
  return values;
}

function toNullableInt(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

async function importTablaCruzada() {
  const csvPath = path.resolve(__dirname, "..", "..", "tabla_cruzada.csv");
  const sqlPath = path.resolve(__dirname, "..", "db", "schema.sql");

  const [csvRaw, schemaSql] = await Promise.all([
    fs.readFile(csvPath, "utf8"),
    fs.readFile(sqlPath, "utf8"),
  ]);

  await pool.query(schemaSql);

  const lines = csvRaw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("tabla_cruzada.csv no contiene filas de datos");
  }

  const header = parseCsvLine(lines[0]);
  const idx = {
    codigo: header.indexOf("CODIGO"),
    descripcion: header.indexOf("DESCRIPCION"),
    unidad: header.indexOf("UNIDAD"),
    paquetes: header.indexOf("PAQUETES"),
    cestas: header.indexOf("CESTAS"),
    sobrePiso: header.indexOf("SOBRE_PISO"),
  };

  if (idx.codigo < 0 || idx.descripcion < 0) {
    throw new Error("Encabezados requeridos no encontrados en tabla_cruzada.csv");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let upserts = 0;
    for (let i = 1; i < lines.length; i += 1) {
      const row = parseCsvLine(lines[i]);
      const codigo = String(row[idx.codigo] ?? "").trim();
      const descripcion = String(row[idx.descripcion] ?? "").trim();

      if (!codigo || !descripcion) continue;

      const unidad = idx.unidad >= 0 ? String(row[idx.unidad] ?? "").trim() || null : null;
      const paquetes = idx.paquetes >= 0 ? toNullableInt(row[idx.paquetes]) : null;
      const cestas = idx.cestas >= 0 ? toNullableInt(row[idx.cestas]) : null;
      const sobrePiso = idx.sobrePiso >= 0 ? toNullableInt(row[idx.sobrePiso]) : null;

      await client.query(
        `INSERT INTO tabla_cruzada_productos (codigo, descripcion, unidad, paquetes, cestas, sobre_piso)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (codigo)
         DO UPDATE SET
           descripcion = EXCLUDED.descripcion,
           unidad = EXCLUDED.unidad,
           paquetes = EXCLUDED.paquetes,
           cestas = EXCLUDED.cestas,
           sobre_piso = EXCLUDED.sobre_piso,
           updated_at = NOW()`,
        [codigo, descripcion, unidad, paquetes, cestas, sobrePiso]
      );

      upserts += 1;
    }

    const countResult = await client.query("SELECT COUNT(*)::int AS total FROM tabla_cruzada_productos");

    await client.query("COMMIT");

    console.log(`Carga completada. Filas procesadas: ${upserts}. Total en tabla_cruzada_productos: ${countResult.rows[0].total}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

importTablaCruzada().catch(async (error) => {
  console.error("Error al importar tabla_cruzada.csv:", error.message);
  try {
    await pool.end();
  } catch (_) {
    // noop
  }
  process.exit(1);
});
