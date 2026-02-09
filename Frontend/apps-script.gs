const SPREADSHEET_ID = "1mrBkcP3Wz04KfBxmNXP0tn6GI645lKctT095uW43ezw";
const SHEET_NAME = "Entradas09";

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    const { numero_lote, producto, cantidad_almacen, fecha_entrada, cestas_calculadas } = payload;

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

    let colCestas = findCol("CESTAS_CALCULADAS");
    if (colCestas >= 0) {
      colCestas = colCestas + 1;
    } else {
      // Crear columna al final si no existe
      const lastCol = Math.max(sheet.getLastColumn(), 1);
      colCestas = lastCol + 1;
      sheet.getRange(1, colCestas).setValue("CESTAS_CALCULADAS");
    }

    const data = sheet.getDataRange().getValues();
    let updated = 0;
    const fecha = fecha_entrada ? new Date(fecha_entrada) : new Date();

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const lote = row[0];
      const prod = row[1];

      if (String(lote).trim() === String(numero_lote).trim() &&
          String(prod).trim() === String(producto).trim()) {
        sheet.getRange(i + 1, colCantidadAlmacen).setValue(cantidad_almacen);
        sheet.getRange(i + 1, colFechaEntrada).setValue(fecha);
        if (cestas_calculadas !== undefined && cestas_calculadas !== null && cestas_calculadas !== '') {
          sheet.getRange(i + 1, colCestas).setValue(cestas_calculadas);
        }
        updated++;
      }
    }

    if (updated === 0) {
      return jsonResponse({ ok: false, error: "No se encontró el lote/producto" }, 404);
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
