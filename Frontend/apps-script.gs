const SPREADSHEET_ID = "1mrBkcP3Wz04KfBxmNXP0tn6GI645lKctT095uW43ezw";
const SHEET_NAME = "Entradas09";

function norm_(value) {
  return String(value || "")
    .trim()
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    const { numero_lote, producto, cantidad_almacen, fecha_entrada } = payload;

    if (!numero_lote || !producto || cantidad_almacen === undefined) {
      return jsonResponse({ ok: false, error: "Datos incompletos" }, 400);
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      return jsonResponse({ ok: false, error: "Hoja no encontrada" }, 404);
    }

    const headersRange = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1);
    const headers = headersRange.getValues()[0].map((h) => String(h || "").trim());
    const findCol = (name) => headers.findIndex((h) => h.toUpperCase() === name.toUpperCase());

    const colCantidadAlmacen = findCol("CANTIDAD ALMACEN") >= 0 ? findCol("CANTIDAD ALMACEN") + 1 : 5;
    const colFechaEntrada = findCol("FECHA ENTRADA") >= 0 ? findCol("FECHA ENTRADA") + 1 : 6;

    const data = sheet.getDataRange().getValues();
    let updated = 0;
    const fecha = fecha_entrada ? new Date(fecha_entrada) : new Date();

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const lote = row[0];
      const prod = row[1];

      if (norm_(lote) === norm_(numero_lote) &&
          norm_(prod) === norm_(producto)) {
        sheet.getRange(i + 1, colCantidadAlmacen).setValue(cantidad_almacen);
        sheet.getRange(i + 1, colFechaEntrada).setValue(fecha);
        updated++;
      }
    }

    if (updated === 0) {
      return jsonResponse({
        ok: false,
        error: `No se encontró el lote/producto: ${String(numero_lote || '').trim()} | ${String(producto || '').trim()}`
      }, 404);
    }

    return jsonResponse({ ok: true, updated });
  } catch (err) {
    return jsonResponse({ ok: false, error: "Error interno" }, 500);
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
